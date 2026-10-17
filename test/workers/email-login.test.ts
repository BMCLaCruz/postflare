import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../../worker/index";
import { ORIGIN, sessionCookie, type CallOptions, type Client } from "./helpers";

// Email sign-in links: no account enumeration, single use, expiry, disabled users, throttling. Own D1 (EMAIL_LOGIN_DB).

const sent: Array<{ to: string; text: string }> = [];
const EMAIL = { send: async (m: { to: string; text: string }) => void sent.push(m) } as unknown as SendEmail;
const E = { ...env, DB: env.EMAIL_LOGIN_DB, EMAIL, EMAIL_FROM: "Postflare <login@pf.test>" } as unknown as Env;
const PW = "password123";

async function call(client: Client | null, path: string, opts: CallOptions = {}, e: Env = E) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (client?.cookie) headers.cookie = client.cookie;
  let body: BodyInit | undefined;
  if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const ctx = createExecutionContext();
  const res = await worker.fetch!(new Request(`${ORIGIN}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body }) as Request<unknown, IncomingRequestCfProperties>, e, ctx);
  await waitOnExecutionContext(ctx);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

let ip = 0;
const requestLink = (email: string, headers: Record<string, string> = { "cf-connecting-ip": `10.20.0.${++ip}` }) => call(null, "/api/auth/email-link", { body: { email }, headers });
const tokenOf = (m: { text: string }) => m.text.match(/\/login\/link#([\w-]+)/)![1];

let owner: Client;

beforeAll(async () => {
  const setup = await call(null, "/api/auth/setup", { body: { name: "Mia", email: "mia@example.com", password: PW } });
  expect(setup.status, setup.text).toBe(200);
  owner = { cookie: sessionCookie(setup.headers)! };
});

describe("email sign-in links", () => {
  it("is reported by /api/auth/status only when configured", async () => {
    expect((await call(null, "/api/auth/status")).json).toMatchObject({ emailLogin: true });
    const off = { ...E, EMAIL: undefined } as Env;
    expect((await call(null, "/api/auth/status", {}, off)).json.emailLogin).toBeUndefined();
    expect((await call(null, "/api/auth/email-link", { body: { email: "mia@example.com" } }, off)).status).toBe(404);
  });

  it("answers the same for unknown emails and sends nothing", async () => {
    sent.length = 0;
    const res = await requestLink("nobody@example.com");
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ ok: true });
    expect(sent).toHaveLength(0);
  });

  it("signs in once with the emailed link", async () => {
    sent.length = 0;
    expect((await requestLink(" MIA@example.com ")).status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("mia@example.com");
    expect(sent[0].text).toContain(`${ORIGIN}/login/link#`);
    const token = tokenOf(sent[0]);

    const res = await call(null, "/api/auth/email-link/verify", { body: { token } });
    expect(res.status, res.text).toBe(200);
    const cookie = sessionCookie(res.headers)!;
    expect((await call({ cookie }, "/api/me")).json.user.email).toBe("mia@example.com");
    // Single use.
    expect((await call(null, "/api/auth/email-link/verify", { body: { token } })).status).toBe(400);
    expect((await call(null, "/api/auth/email-link/verify", { body: { token: "nope" } })).status).toBe(400);
  });

  it("refuses expired links and links of disabled users", async () => {
    sent.length = 0;
    await requestLink("mia@example.com");
    const token = tokenOf(sent[0]);
    await E.DB.prepare("UPDATE login_links SET expires_at = ? WHERE used_at IS NULL").bind(Date.now() - 1).run();
    expect((await call(null, "/api/auth/email-link/verify", { body: { token } })).status).toBe(400);

    sent.length = 0;
    await requestLink("mia@example.com");
    await E.DB.prepare("UPDATE users SET status = 'disabled' WHERE email = 'mia@example.com'").run();
    expect((await call(null, "/api/auth/email-link/verify", { body: { token: tokenOf(sent[0]) } })).status).toBe(400);
    sent.length = 0;
    await requestLink("mia@example.com");
    expect(sent).toHaveLength(0);
    await E.DB.prepare("UPDATE users SET status = 'active' WHERE email = 'mia@example.com'").run();
    expect((await call(owner, "/api/me")).status).toBe(200);
  });

  it("throttles requests per email and refuses cross-site requests", async () => {
    let last = 0;
    for (let i = 0; i < 6; i++) last = (await requestLink("throttle@example.com")).status;
    expect(last).toBe(429);
    expect((await requestLink("x@example.com", { origin: "https://evil.example" })).status).toBe(403);
    expect((await call(null, "/api/auth/email-link/verify", { body: { token: "x" }, headers: { origin: "https://evil.example" } })).status).toBe(403);
  });
});
