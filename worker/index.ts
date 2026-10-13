import { Hono } from "hono";
import { forbidDemoUser, isSessionValid, requireAuth, sameOriginMutations, type AppEnv } from "./lib/auth";
import { APP_CSP, securityHeaders } from "./lib/headers";
import { refreshExpiringAccounts } from "./lib/accounts";
import { demoCron } from "./lib/demo";
import { ensureSchema } from "./lib/migrate";
import { recoverStuckPosts, sweepScheduledPosts } from "./lib/posts";
import { now } from "./lib/util";
import { collectMetrics } from "./lib/metrics";
import { updateCheckCron } from "./lib/updates";
import { accountRoutes } from "./routes/accounts";
import { analyticsRoutes } from "./routes/analytics";
import { authRoutes } from "./routes/auth";
import { demoLogin, demoPage } from "./routes/demo";
import { invitationPublicRoutes, invitationRoutes } from "./routes/invitations";
import { mcpRoutes } from "./routes/mcp";
import { mediaRoutes, publicMedia } from "./routes/media";
import { oauthRoutes } from "./routes/oauth";
import { platformRoutes } from "./routes/platforms";
import { postRoutes } from "./routes/posts";
import { settingsRoutes } from "./routes/settings";
import { updateRoutes, versionRoute } from "./routes/updates";
import { uploadLinkPublic, uploadLinkRoutes } from "./routes/uploadLinks";
import { userRoutes } from "./routes/users";
import { changePassword, meRoutes, workspaceRoutes } from "./routes/workspaces";

export { PublishWorkflow } from "./workflow";

const api = new Hono<AppEnv>();
api.use("*", sameOriginMutations);
api.post("/auth/demo", demoLogin);
api.route("/auth", authRoutes);
api.route("/invitations", invitationPublicRoutes);
api.route("/version", versionRoute);
// Everything below needs a session or an API key; handlers scope by c.var.workspace and check permissions.
api.use("*", requireAuth);
api.post("/auth/password", forbidDemoUser, changePassword); // Old path of POST /api/me/password.
api.route("/", meRoutes);
api.route("/", workspaceRoutes);
api.route("/", userRoutes);
api.route("/", invitationRoutes);
api.route("/", platformRoutes);
api.route("/", accountRoutes);
api.route("/", mediaRoutes);
api.route("/", postRoutes);
api.route("/", analyticsRoutes);
api.route("/", settingsRoutes);
api.route("/", uploadLinkRoutes);
api.route("/", updateRoutes);
api.notFound((c) => c.json({ error: "Not found" }, 404));

const app = new Hono<AppEnv>();
app.use("*", securityHeaders);
app.use("*", async (c, next) => {
  await ensureSchema(c.env.DB);
  await next();
});
app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || "Internal error" }, 500);
});
// Public landing page for visitors; the app itself for signed-in users (both are static assets).
app.get("/", async (c) => {
  // Fetch "/" (not "/index.html", which the assets layer redirects back to "/", looping forever).
  if (await isSessionValid(c)) {
    // The app itself (Vite build, no inline scripts): strict CSP.
    c.set("csp", APP_CSP);
    return c.env.ASSETS.fetch(new Request(new URL("/", c.req.url), c.req.raw));
  }
  const res = await c.env.ASSETS.fetch(new Request(new URL("/landing/", c.req.url), c.req.raw));
  // Link previews need absolute URLs: the landing page ships relative ones so any instance can serve it.
  const origin = new URL(c.req.url).origin;
  return new HTMLRewriter()
    .on('meta[property="og:image"], meta[name="twitter:image"]', {
      element(el) {
        const v = el.getAttribute("content");
        if (v?.startsWith("/")) el.setAttribute("content", origin + v);
      },
    })
    .on("head", {
      element(el) {
        el.append(`<meta property="og:url" content="${origin}/">`, { html: true });
      },
    })
    .transform(res);
});
// Public live demo (DEMO_MODE=true): signs in as the demo user and opens the app.
app.get("/demo", demoPage);
app.route("/api", api);
app.route("/oauth", oauthRoutes);
app.route("/m", publicMedia);
app.route("/u", uploadLinkPublic);
app.route("/mcp", mcpRoutes(app));

export default {
  fetch: app.fetch,
  async scheduled(_event, env, ctx) {
    await ensureSchema(env.DB);
    ctx.waitUntil(
      Promise.allSettled([
        sweepScheduledPosts(env),
        recoverStuckPosts(env),
        // Analytics after token refreshes: collection reuses fresh tokens and stays within the tick's fetch budget.
        refreshExpiringAccounts(env).finally(() => collectMetrics(env)),
        demoCron(env),
        // New Postflare release? At most one GitHub request a day (UPDATE_CHECK="false" turns it off).
        updateCheckCron(env),
        env.DB.prepare("DELETE FROM oauth_states WHERE created_at < ?").bind(now() - 60 * 60 * 1000).run(),
        env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(now()).run(),
        env.DB.prepare("DELETE FROM upload_links WHERE expires_at < ?").bind(now() - 7 * 24 * 60 * 60 * 1000).run(),
        env.DB.prepare("DELETE FROM settings WHERE (key LIKE 'login_fail:%' OR key LIKE 'demo_login:%') AND json_extract(value, '$.until') < ?").bind(now()).run(),
        env.DB.prepare("DELETE FROM invitations WHERE accepted_at IS NULL AND expires_at < ?").bind(now() - 30 * 24 * 60 * 60 * 1000).run(),
      ]),
    );
  },
} satisfies ExportedHandler<Env>;
