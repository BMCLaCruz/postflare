import { Hono } from "hono";
import { forbidInDemoWorkspace, requirePermission, wsId, type AppEnv } from "../lib/auth";
import {
  AccountElsewhereError,
  accountDto,
  findAccount,
  freshAccount,
  providerContext,
  removeAccounts,
  saveConnectedAccounts,
  type AccountRow,
} from "../lib/accounts";
import { pkceChallenge } from "../lib/crypto";
import { connectBlocked } from "../lib/settings";
import { demoOptions } from "../lib/demo";
import { errorMessage, now, parseJson, randomToken } from "../lib/util";
import { ProviderError } from "../providers/errors";
import { getProvider } from "../providers/registry";

export const accountRoutes = new Hono<AppEnv>();

accountRoutes.get("/accounts", requirePermission("accounts.read"), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT * FROM accounts WHERE workspace_id = ? ORDER BY provider, name")
    .bind(wsId(c))
    .all<AccountRow>();
  return c.json(results.map(accountDto));
});

accountRoutes.patch("/accounts/:id", requirePermission("accounts.manage"), async (c) => {
  const { status } = await c.req.json<{ status: "active" | "disabled" }>();
  if (status !== "active" && status !== "disabled") return c.json({ error: "Invalid status" }, 400);
  await c.env.DB.prepare("UPDATE accounts SET status = ?, updated_at = ? WHERE id = ? AND workspace_id = ?")
    .bind(status, now(), c.req.param("id"), wsId(c))
    .run();
  const row = await findAccount(c.env, wsId(c), c.req.param("id"));
  return row ? c.json(accountDto(row)) : c.json({ error: "Not found" }, 404);
});

accountRoutes.delete("/accounts/:id", requirePermission("accounts.manage"), async (c) => {
  const row = await findAccount(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  await removeAccounts(c.env, [row.id]);
  return c.json({ ok: true });
});

/** Force a token refresh (also a quick "is this account still working" check). */
accountRoutes.post("/accounts/:id/refresh", requirePermission("accounts.manage"), async (c) => {
  const row = await findAccount(c.env, wsId(c), c.req.param("id"));
  const provider = row && getProvider(row.provider);
  if (!row || !provider) return c.json({ error: "Not found" }, 404);
  // Demo workspace: the tokens are fake, there is nothing to refresh.
  if (!provider.refresh || c.var.workspace?.demo) return c.json(accountDto(row));
  try {
    const ctx = await providerContext(c.env, provider, { requestUrl: c.req.url });
    await freshAccount(c.env, provider, ctx, row, { force: true });
    return c.json(accountDto((await findAccount(c.env, wsId(c), row.id))!));
  } catch (err) {
    return c.json({ error: errorMessage(err) }, 400);
  }
});

// Used by the composer to fill dynamic settings fields (boards, channels...), so it needs posts.write.
accountRoutes.get("/accounts/:id/options/:key", requirePermission("posts.write"), async (c) => {
  const row = await findAccount(c.env, wsId(c), c.req.param("id"));
  const provider = row && getProvider(row.provider);
  if (!row || !provider) return c.json({ error: "Not found" }, 404);
  if (!provider.options) return c.json([]);
  // Demo workspace: a small fake list instead of asking the platform.
  if (c.var.workspace?.demo) return c.json(demoOptions(provider.id, c.req.param("key")));
  try {
    const ctx = await providerContext(c.env, provider, { requestUrl: c.req.url });
    const account = await freshAccount(c.env, provider, ctx, row);
    const settings = parseJson<Record<string, unknown>>(c.req.query("settings"), {});
    return c.json(await provider.options(ctx, account, c.req.param("key"), settings));
  } catch (err) {
    return c.json({ error: errorMessage(err) }, err instanceof ProviderError && err.kind === "auth" ? 401 : 400);
  }
});

/** Connect with credentials (app passwords, bot tokens, API keys). */
accountRoutes.post("/connect/:provider", requirePermission("accounts.manage"), forbidInDemoWorkspace("Connecting accounts"), async (c) => {
  const provider = getProvider(c.req.param("provider"));
  if (!provider?.connect) return c.json({ error: "This platform connects with OAuth" }, 400);
  const blocked = await connectBlocked(c.env.DB, provider);
  if (blocked) return c.json({ error: blocked }, 403);
  const { values } = await c.req.json<{ values: Record<string, string> }>();
  for (const f of provider.credentialFields) {
    if (f.required && !values?.[f.key]?.trim()) return c.json({ error: `${f.label} is required` }, 400);
  }
  try {
    const ctx = await providerContext(c.env, provider, { requestUrl: c.req.url });
    const accounts = await provider.connect(ctx, values);
    const ids = await saveConnectedAccounts(c.env, provider.id, accounts, { workspaceId: wsId(c), userId: c.var.user.id });
    return c.json({ ids });
  } catch (err) {
    return c.json({ error: errorMessage(err) }, err instanceof AccountElsewhereError ? 409 : 400);
  }
});

/** Start an OAuth flow: returns the platform authorization URL. */
accountRoutes.get("/connect/:provider/url", requirePermission("accounts.manage"), forbidInDemoWorkspace("Connecting accounts"), async (c) => {
  const provider = getProvider(c.req.param("provider"));
  if (!provider?.authorize) return c.json({ error: "This platform connects with credentials" }, 400);
  const blocked = await connectBlocked(c.env.DB, provider);
  if (blocked) return c.json({ error: blocked }, 403);
  try {
    const ctx = await providerContext(c.env, provider, { requestUrl: c.req.url });
    const state = randomToken(24);
    const codeVerifier = randomToken(48);
    const url = await provider.authorize(ctx, { state, codeVerifier, codeChallenge: await pkceChallenge(codeVerifier) });
    // The callback saves into this workspace, and only for this user.
    await c.env.DB.prepare(
      "INSERT INTO oauth_states (state, provider, code_verifier, user_id, workspace_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
      .bind(state, provider.id, codeVerifier, c.var.user.id, wsId(c), now())
      .run();
    return c.json({ url });
  } catch (err) {
    return c.json({ error: errorMessage(err) }, 400);
  }
});
