import { Hono } from "hono";
import { sessionUser, workspaceAccess, type AppEnv } from "../lib/auth";
import { providerContext, saveConnectedAccounts } from "../lib/accounts";
import { connectBlocked } from "../lib/settings";
import { errorMessage, now } from "../lib/util";
import { getProvider } from "../providers/registry";

export const oauthRoutes = new Hono<AppEnv>();

const STATE_TTL_MS = 30 * 60 * 1000;

// Some platforms (Apple-style form_post, TikTok...) may POST the callback.
oauthRoutes.on(["GET", "POST"], ["/:provider/callback", "/:provider/callback/"], async (c) => {
  const back = (q: Record<string, string>) => c.redirect(`/accounts?${new URLSearchParams(q)}`);
  const provider = getProvider(c.req.param("provider"));
  if (!provider?.callback) return back({ error: "Unknown platform" });
  const session = await sessionUser(c);
  if (!session) return c.redirect("/login");

  const params = new URLSearchParams(new URL(c.req.url).search);
  if (c.req.method === "POST") {
    const form = await c.req.parseBody();
    for (const [k, v] of Object.entries(form)) if (typeof v === "string") params.set(k, v);
  }
  const error = params.get("error_description") || params.get("error_message") || params.get("error");
  if (error) return back({ error: `${provider.name}: ${error}` });

  const stateParam = params.get("state") ?? "";
  // Consume atomically so a replayed callback cannot reuse the state.
  const state = await c.env.DB.prepare(
    "DELETE FROM oauth_states WHERE state = ? AND provider = ? RETURNING code_verifier, created_at, user_id, workspace_id",
  )
    .bind(stateParam, provider.id)
    .first<{ code_verifier: string; created_at: number; user_id: string | null; workspace_id: string | null }>();
  if (!state || state.created_at < now() - STATE_TTL_MS) return back({ error: "Login link expired, please try again" });
  // The flow must be finished by the user who started it, who must still be allowed to manage accounts there.
  if (state.user_id !== session.user.id || !state.workspace_id) {
    return back({ error: "This connection was started by another user, please try again" });
  }
  const ws = await workspaceAccess(c.env.DB, session.user.id, session.instancePermissions, state.workspace_id);
  if (!ws?.permissions.includes("accounts.manage")) return back({ error: "You can no longer connect accounts in this workspace" });
  if (ws.demo) return back({ error: "Connecting accounts is disabled in the demo workspace" });
  const blocked = await connectBlocked(c.env.DB, provider);
  if (blocked) return back({ error: blocked });

  try {
    const ctx = await providerContext(c.env, provider, { requestUrl: c.req.url });
    const accounts = await provider.callback(ctx, {
      code: params.get("code") ?? params.get("oauth_verifier") ?? "",
      codeVerifier: state.code_verifier,
      params,
    });
    if (!accounts.length) return back({ error: `${provider.name}: no accounts found for this login` });
    const ids = await saveConnectedAccounts(c.env, provider.id, accounts, { workspaceId: ws.id, userId: session.user.id });
    return back({ connected: String(ids.length), provider: provider.id, workspaceId: ws.id });
  } catch (err) {
    return back({ error: `${provider.name}: ${errorMessage(err)}` });
  }
});
