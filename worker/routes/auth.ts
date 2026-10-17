import { Hono } from "hono";
import type { SetupInput } from "../../shared/types";
import { createSession, destroySession, sessionUser, throttleIp, type AppEnv } from "../lib/auth";
import { demoEnabled } from "../lib/demo";
import { magicLinkEmail, magicLinkEnabled, sendEmail } from "../lib/email";
import { hashPassword, needsRehash, verifyPassword } from "../lib/crypto";
import { ROLE } from "../lib/permissions";
import { baseUrl, getSetting, setSetting } from "../lib/settings";
import { normalizeEmail, normalizeName, passwordError } from "../lib/users";
import { newId, now, parseJson, randomToken, sha256Hex } from "../lib/util";

export const authRoutes = new Hono<AppEnv>();

async function hasUsers(db: D1Database) {
  // The live demo's shared user does not count: the instance still needs its first real user.
  return !!(await db.prepare("SELECT 1 AS x FROM users WHERE is_demo = 0 LIMIT 1").first());
}

authRoutes.get("/status", async (c) => {
  const [setup, session, magicLink] = await Promise.all([hasUsers(c.env.DB), sessionUser(c), magicLinkEnabled(c.env)]);
  // Demo visitors are signed in even on an instance that has no real user yet.
  const demo = !!session?.user.demo;
  return c.json({
    setup: setup || demo,
    authenticated: !!session && (setup || demo),
    // The setup form then asks for the SETUP_TOKEN secret.
    ...(!setup && c.env.SETUP_TOKEN ? { setupToken: true } : {}),
    // Only when the live demo is on (the landing page shows its "Live demo" buttons then).
    ...(demoEnabled(c.env) ? { demo: true } : {}),
    // The sign-in page then offers "Email me a sign-in link instead" (EMAIL + EMAIL_FROM set and turned on by an admin).
    ...(setup && magicLink ? { magicLink: true } : {}),
  });
});

/** First run: creates the first user (instance Admin) and their workspace (Owner), then signs in. */
authRoutes.post("/setup", async (c) => {
  const body = await c.req.json<Partial<SetupInput>>().catch(() => ({}) as Partial<SetupInput>);
  const name = normalizeName(body.name);
  const email = normalizeEmail(body.email);
  if (!name) return c.json({ error: "Name is required" }, 400);
  if (!email) return c.json({ error: "A valid email is required" }, 400);
  const pwError = passwordError(body.password);
  if (pwError) return c.json({ error: pwError }, 400);
  if (await hasUsers(c.env.DB)) return c.json({ error: "Already set up" }, 409);
  // Until the first user exists anyone who finds the URL could claim the instance; SETUP_TOKEN closes that window.
  if (c.env.SETUP_TOKEN && (await sha256Hex(String(body.setupToken ?? ""))) !== (await sha256Hex(c.env.SETUP_TOKEN))) {
    return c.json({ error: "Wrong setup token (the SETUP_TOKEN secret of this deployment)" }, 403);
  }

  const db = c.env.DB;
  const userId = newId("usr_");
  const workspaceId = newId("ws_");
  const t = now();
  const userExists = "WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)";
  // Atomic and race-safe: the user is only inserted while there is none, the workspace only if that insert happened.
  const [res] = await db.batch([
    db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, role_id, status, created_at, updated_at, last_login_at)
         SELECT ?, ?, ?, ?, ?, 'active', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users WHERE is_demo = 0)`,
      )
      .bind(userId, email, name, await hashPassword(body.password!), ROLE.instanceAdmin, t, t, t),
    db
      .prepare(`INSERT INTO workspaces (id, name, created_by, created_at, updated_at) SELECT ?, ?, ?, ?, ? ${userExists}`)
      .bind(workspaceId, normalizeName(body.workspaceName) ?? "My workspace", userId, t, t, userId),
    db
      .prepare(`INSERT INTO workspace_members (workspace_id, user_id, role_id, created_at) SELECT ?, ?, ?, ? ${userExists}`)
      .bind(workspaceId, userId, ROLE.owner, t, userId),
  ]);
  if (!res.meta.changes) return c.json({ error: "Already set up" }, 409);
  await baseUrl(c.env, c.req.url);
  await createSession(c, userId, workspaceId);
  return c.json({ ok: true });
});

const MAX_FAILURES_IP = 5;
const MAX_FAILURES_EMAIL = 10;
const LOCK_MS = 15 * 60 * 1000;

type Failures = { n: number; until: number };

/** Failed logins per IP and per email, kept in D1 so the limit holds across isolates. */
async function failures(env: Env, key: string): Promise<Failures> {
  return parseJson<Failures>(await getSetting(env.DB, key), { n: 0, until: 0 });
}

async function recordFailure(env: Env, key: string, f: Failures) {
  const n = (f.until > Date.now() ? f.n : 0) + 1;
  await setSetting(env.DB, key, JSON.stringify({ n, until: Date.now() + LOCK_MS }));
}

// Verified for unknown emails so they cost the same PBKDF2 as wrong passwords (no user enumeration by timing).
const DUMMY_HASH = "pbkdf2$20000$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{ email?: string; password?: string }>().catch(() => ({}) as { email?: string; password?: string });
  const ipKey = `login_fail:${throttleIp(c.req.header("cf-connecting-ip"))}`;
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const emailKey = `login_fail:email:${email}`;
  const [ipF, emailF] = await Promise.all([failures(c.env, ipKey), email ? failures(c.env, emailKey) : { n: 0, until: 0 }]);
  const locked = (f: Failures, max: number) => f.n >= max && f.until > Date.now();
  if (locked(ipF, MAX_FAILURES_IP) || locked(emailF, MAX_FAILURES_EMAIL)) {
    return c.json({ error: "Too many attempts, try again in a few minutes" }, 429);
  }
  const user = email
    ? await c.env.DB.prepare("SELECT id, password_hash, status FROM users WHERE email = ? AND is_demo = 0")
        .bind(email)
        .first<{ id: string; password_hash: string; status: string }>()
    : null;
  const password = typeof body.password === "string" ? body.password : "";
  const ok = await verifyPassword(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !ok) {
    await Promise.all([recordFailure(c.env, ipKey, ipF), email ? recordFailure(c.env, emailKey, emailF) : null]);
    return c.json({ error: "Wrong email or password" }, 401);
  }
  if (user.status !== "active") return c.json({ error: "This account is disabled" }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM settings WHERE key IN (?, ?)").bind(ipKey, emailKey),
    c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(now(), user.id),
  ]);
  if (needsRehash(user.password_hash)) {
    await c.env.DB.prepare("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?").bind(await hashPassword(password), now(), user.id).run();
  }
  await createSession(c, user.id);
  return c.json({ ok: true });
});

const LINK_TTL_MS = 15 * 60 * 1000;
const MAX_LINKS_IP = 10;
const MAX_LINKS_EMAIL = 3;
const INVALID_LINK = "This sign-in link is invalid, used or expired. Request a new one.";
const NOT_ENABLED = "Sign-in links by email are not turned on for this instance";

/**
 * Sign-in links by email ("magic link"): mails a single-use link to an existing active user. The answer is the same
 * whether or not the email has an account: the user lookup, the link and the email all happen after the response.
 * Throttled per email (3) and per IP (10) in 15 minutes, counting every request.
 */
authRoutes.post("/magic-link", async (c) => {
  if (!(await magicLinkEnabled(c.env))) return c.json({ error: NOT_ENABLED }, 404);
  const body = await c.req.json<{ email?: unknown }>().catch(() => ({}) as { email?: unknown });
  const email = normalizeEmail(body.email);
  if (!email) return c.json({ error: "A valid email is required" }, 400);
  const ipKey = `magic_link:${throttleIp(c.req.header("cf-connecting-ip"))}`;
  const emailKey = `magic_link:email:${email.toLowerCase()}`;
  const [ipF, emailF] = await Promise.all([failures(c.env, ipKey), failures(c.env, emailKey)]);
  const over = (f: Failures, max: number) => f.n >= max && f.until > Date.now();
  if (over(ipF, MAX_LINKS_IP) || over(emailF, MAX_LINKS_EMAIL)) return c.json({ error: "Too many sign-in links requested. Try again in 15 minutes." }, 429);
  await Promise.all([recordFailure(c.env, ipKey, ipF), recordFailure(c.env, emailKey, emailF)]);

  c.executionCtx.waitUntil(
    (async () => {
      const user = await c.env.DB.prepare("SELECT id, email FROM users WHERE email = ? AND is_demo = 0 AND status = 'active'")
        .bind(email)
        .first<{ id: string; email: string }>();
      if (!user) return;
      const token = randomToken(32);
      const t = now();
      await c.env.DB.prepare("INSERT INTO magic_links (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
        .bind(await sha256Hex(token), user.id, t, t + LINK_TTL_MS)
        .run();
      // The token goes in the fragment: never sent to a server, so it stays out of request logs.
      const url = `${await baseUrl(c.env, c.req.url)}/auth/link#${token}`;
      await sendEmail(c.env, magicLinkEmail(user.email, url, LINK_TTL_MS / 60_000));
    })().catch((err) => console.error("sign-in link email failed", err?.code ?? "", err?.message ?? err)),
  );
  return c.json({ ok: true });
});

/**
 * Opens a session from an emailed sign-in link (POSTed by the /auth/link page on click, so link scanners cannot use it
 * up). Single use; the user's other open links end. Turning the feature off ends outstanding links too (404).
 */
authRoutes.post("/magic-link/verify", async (c) => {
  if (!(await magicLinkEnabled(c.env))) return c.json({ error: NOT_ENABLED }, 404);
  const body = await c.req.json<{ token?: unknown }>().catch(() => ({}) as { token?: unknown });
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!/^[\w-]{20,100}$/.test(token)) return c.json({ error: INVALID_LINK }, 400);
  const t = now();
  const row = await c.env.DB.prepare("UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING user_id")
    .bind(t, await sha256Hex(token), t)
    .first<{ user_id: string }>();
  if (!row) return c.json({ error: INVALID_LINK }, 400);
  const user = await c.env.DB.prepare("SELECT status, is_demo FROM users WHERE id = ?").bind(row.user_id).first<{ status: string; is_demo: number }>();
  if (!user || user.is_demo) return c.json({ error: INVALID_LINK }, 400);
  if (user.status !== "active") return c.json({ error: "This account is disabled" }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE magic_links SET used_at = ? WHERE user_id = ? AND used_at IS NULL").bind(t, row.user_id),
    c.env.DB.prepare("UPDATE users SET last_login_at = ? WHERE id = ?").bind(t, row.user_id),
  ]);
  await createSession(c, row.user_id);
  return c.json({ ok: true });
});

authRoutes.post("/logout", async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});
