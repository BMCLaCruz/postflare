import { Hono } from "hono";
import type { AdminEmailDTO } from "../../shared/types";
import { adminOverview } from "../lib/admin-overview";
import { requireInstancePermission, type AppEnv } from "../lib/auth";
import { MAGIC_LINK_SETTING, emailConfigured, sendEmail, testEmail } from "../lib/email";
import { baseUrl, getSetting, setSetting } from "../lib/settings";

/** Instance administration pages that are not about users, plus the email (sign-in links) settings. */
export const adminRoutes = new Hono<AppEnv>();

/** GET /api/admin/overview?days=30 (1-90): one D1 batch of aggregate queries. */
adminRoutes.get("/admin/overview", requireInstancePermission("instance.overview.view"), async (c) => {
  c.header("cache-control", "no-store");
  return c.json(await adminOverview(c.env, Number(c.req.query("days") ?? 30)));
});

// ---------- Sign-in links by email (Cloudflare Email Sending): off until an instance admin turns them on ----------

const manageSettings = requireInstancePermission("instance.settings.manage");
const NOT_CONFIGURED =
  "Email is not set up: add the send_email binding EMAIL and the EMAIL_FROM var in wrangler.local.jsonc, then deploy. Sending to any address needs Cloudflare Workers Paid ($5/month) and a domain onboarded to Cloudflare Email Sending (on the Free plan emails only reach your account's verified addresses).";

async function emailState(env: Env): Promise<AdminEmailDTO> {
  return { configured: emailConfigured(env), from: env.EMAIL_FROM?.trim() || null, enabled: (await getSetting(env.DB, MAGIC_LINK_SETTING)) === "1" };
}

adminRoutes.get("/admin/email", manageSettings, async (c) => c.json(await emailState(c.env)));

/** PATCH /api/admin/email {enabled}: turning it off also ends every outstanding link (deleted; verify answers 404 while off). */
adminRoutes.patch("/admin/email", manageSettings, async (c) => {
  const body = await c.req.json<{ enabled?: unknown }>().catch(() => ({}) as { enabled?: unknown });
  if (typeof body.enabled !== "boolean") return c.json({ error: "enabled must be true or false" }, 400);
  if (body.enabled && !emailConfigured(c.env)) return c.json({ error: NOT_CONFIGURED }, 400);
  if (body.enabled) await setSetting(c.env.DB, MAGIC_LINK_SETTING, "1");
  else {
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM settings WHERE key = ?").bind(MAGIC_LINK_SETTING),
      c.env.DB.prepare("DELETE FROM magic_links"),
    ]);
  }
  return c.json(await emailState(c.env));
});

/** POST /api/admin/email/test: a test email to the signed-in admin's own address, sent before answering (errors → 502). */
adminRoutes.post("/admin/email/test", manageSettings, async (c) => {
  if (!emailConfigured(c.env)) return c.json({ error: NOT_CONFIGURED }, 400);
  const to = c.var.user.email;
  try {
    await sendEmail(c.env, testEmail(to, new URL(await baseUrl(c.env, c.req.url)).host));
  } catch (err) {
    const e = err as { code?: string; message?: string };
    return c.json({ error: `Sending failed${e?.code ? ` (${e.code})` : ""}: ${e?.message ?? String(err)}` }, 502);
  }
  return c.json({ ok: true, to });
});
