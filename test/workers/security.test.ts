import { createExecutionContext, env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import worker from "../../worker/index";
import { throttleIp } from "../../worker/lib/auth";
import { MAX_LINK_FILES } from "../../worker/routes/uploadLinks";
import { ORIGIN, sessionCookie, type CallOptions, type Client } from "./helpers";

// Hardening from the security audit: CSRF on every /api mutation, SETUP_TOKEN, security headers, MCP path
// injection, key minting with API keys, webhook URL masking, upload link caps. Own D1 instance (SECURITY_DB).

const assets = {
  fetch: async (input: Request | string) => {
    const path = new URL(typeof input === "string" ? input : input.url).pathname;
    return new Response(`<!doctype html><title>${path}</title>`, { headers: { "content-type": "text/html", "content-security-policy": "from-assets" } });
  },
} as unknown as Fetcher;

const E = { ...env, DB: env.SECURITY_DB, ASSETS: assets, SETUP_TOKEN: "s3tup-token", DEMO_MODE: "true" } as unknown as Env;
const PW = "password123";

async function call(client: Client | null, path: string, opts: CallOptions = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (client?.cookie) headers.cookie = client.cookie;
  if (client?.key) headers.authorization = `Bearer ${client.key}`;
  let body: BodyInit | undefined = opts.raw;
  if (opts.body !== undefined) {
    headers["content-type"] ??= "application/json";
    body = JSON.stringify(opts.body);
  }
  const req = new Request(`${ORIGIN}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, redirect: "manual" });
  const res = await worker.fetch!(req as Request<unknown, IncomingRequestCfProperties>, E, createExecutionContext());
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

const EVIL = { origin: "https://evil.example" };
let owner: Client;
let key: string;
let wsId: string;

async function mcp(name: string, args: Record<string, unknown>) {
  const res = await call({ key }, "/mcp", { body: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } } });
  return res.json.result as { content: Array<{ text: string }>; isError?: boolean };
}

beforeAll(async () => {
  const status = await call(null, "/api/auth/status");
  expect(status.json).toMatchObject({ setup: false, setupToken: true });
  const body = { name: "Sam", email: "sam@example.com", password: PW, workspaceName: "Sam" };
  expect((await call(null, "/api/auth/setup", { body })).status).toBe(403);
  expect((await call(null, "/api/auth/setup", { body: { ...body, setupToken: "wrong" } })).status).toBe(403);
  // Cross-site setup (e.g. a form on another site racing the owner) is refused before anything else.
  expect((await call(null, "/api/auth/setup", { body: { ...body, setupToken: "s3tup-token" }, headers: EVIL })).status).toBe(403);
  const setup = await call(null, "/api/auth/setup", { body: { ...body, setupToken: "s3tup-token" } });
  expect(setup.status, setup.text).toBe(200);
  owner = { cookie: sessionCookie(setup.headers)! };
  wsId = (await call(owner, "/api/me")).json.currentWorkspaceId;
  const k = await call(owner, "/api/keys", { body: { name: "agent" } });
  expect(k.status).toBe(201);
  key = k.json.token;
});

describe("setup token", () => {
  it("is no longer reported once set up", async () => {
    expect((await call(null, "/api/auth/status")).json).toEqual({ setup: true, authenticated: false, demo: true });
  });
});

describe("CSRF", () => {
  it("refuses cross-site logins (login CSRF) and logouts on the public auth routes", async () => {
    const creds = { email: "sam@example.com", password: PW };
    expect((await call(null, "/api/auth/login", { body: creds, headers: EVIL })).status).toBe(403);
    expect((await call(null, "/api/auth/login", { body: creds, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await call(null, "/api/auth/login", { body: creds, headers: { origin: ORIGIN } })).status).toBe(200);
    expect((await call(owner, "/api/auth/logout", { body: {}, headers: EVIL })).status).toBe(403);
    expect((await call(owner, "/api/me")).status).toBe(200);
    expect((await call(null, "/api/invitations/accept", { body: { token: "x".repeat(40) }, headers: EVIL })).status).toBe(403);
  });

  it("a cross-site link to /demo does not sign a user out of their account", async () => {
    const res = await call(owner, "/demo", { headers: { "sec-fetch-site": "cross-site" } });
    expect(res.status).toBe(302);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect((await call(owner, "/api/me")).json.user.email).toBe("sam@example.com");
  });

  it("API key requests (no Origin) keep working", async () => {
    expect((await call({ key }, "/api/upload-links", { body: {} })).status).toBe(201);
  });
});

describe("security headers", () => {
  it("sets nosniff/referrer on every response and a CSP on HTML", async () => {
    const api = await call(owner, "/api/me");
    expect(api.headers.get("x-content-type-options")).toBe("nosniff");
    expect(api.headers.get("referrer-policy")).toBe("strict-origin-when-cross-origin");

    const page = await call(null, "/u/not-a-valid-token-at-all-000");
    expect(page.status).toBe(410);
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");

    // Landing for visitors (inline scripts allowed), the app for signed-in users (scripts from 'self' only).
    const landing = await call(null, "/");
    expect(landing.headers.get("content-security-policy")).toContain("script-src 'self' 'unsafe-inline'");
    const app = await call(owner, "/");
    expect(app.headers.get("content-security-policy")).toMatch(/^script-src 'self';/);
    expect(app.headers.get("x-frame-options")).toBe("DENY");
  });
});

describe("API keys", () => {
  it("cannot mint new API keys (a leaked key must not outlive its revocation)", async () => {
    expect((await call({ key }, "/api/keys", { body: { name: "persist" } })).status).toBe(403);
  });

  it("an instance admin's key has no instance permissions (users, roles, platforms, settings)", async () => {
    const me = await call({ key }, "/api/me");
    expect(me.json.instancePermissions).toEqual([]);
    expect((await call({ key }, "/api/users")).status).toBe(403);
    expect((await call({ key }, "/api/platforms/bluesky")).status).toBe(403);
    expect((await call({ key }, "/api/roles", { body: { scope: "workspace", name: "x", permissions: [] } })).status).toBe(403);
    expect((await call({ key }, "/api/settings", { method: "PUT", body: { timezone: "UTC" } })).status).toBe(403);
    // Workspace work still goes through the member role (Owner here).
    expect((await call({ key }, "/api/accounts")).status).toBe(200);
    expect((await call({ key }, "/api/posts")).status).toBe(200);
  });
});

describe("MCP", () => {
  it("encodes ids so tools cannot reach other REST routes", async () => {
    const keys = await mcp("get_post", { id: "../keys" });
    expect(keys.isError).toBe(true);
    expect(keys.content[0].text).not.toContain("agent");
    const del = await mcp("delete_post", { id: `../workspaces/${wsId}` });
    expect(del.isError).toBe(true);
    expect((await call(owner, "/api/workspaces")).json.map((w: { id: string }) => w.id)).toContain(wsId);
    expect((await mcp("cancel_post", { id: ".." })).isError).toBe(true);
  });
});

describe("accounts", () => {
  it("never shows a webhook's full URL (it is often the credential)", async () => {
    const res = await call(owner, "/api/connect/webhook", { body: { values: { name: "Zap", url: "https://hooks.zapier.example/hooks/catch/123/secret-path" } } });
    expect(res.status, res.text).toBe(200);
    const [acc] = (await call(owner, "/api/accounts")).json;
    expect(acc.externalId).toBe("https://hooks.zapier.example/…");
    expect(JSON.stringify((await call({ key }, "/api/accounts")).json)).not.toContain("secret-path");
  });
});

describe("upload links", () => {
  it(`accept at most ${MAX_LINK_FILES} files`, async () => {
    const link = await call(owner, "/api/upload-links", { body: {} });
    const token = link.json.putUrl.split("/u/")[1].split("/")[0];
    const put = () =>
      call(null, `/u/${token}/file`, {
        method: "PUT",
        raw: new Uint8Array([1, 2, 3, 4]),
        headers: { "content-type": "image/png", "x-filename": "%E0%A4%A", "content-length": "4" },
      });
    const first = await put();
    // A malformed percent-encoded filename is kept as is instead of failing with a 500.
    expect(first.status, first.text).toBe(200);
    const ids = Array.from({ length: MAX_LINK_FILES }, (_, i) => `med_fake${i}`);
    await E.DB.prepare("UPDATE upload_links SET media = ? WHERE id = ?").bind(JSON.stringify(ids), link.json.id).run();
    expect((await put()).status).toBe(409);
    expect((await call(null, `/u/${token}/multipart`, { body: { filename: "a.mp4", mime: "video/mp4", size: 10 } })).status).toBe(409);
  });
});

describe("public media", () => {
  it("serves signed links (full, range, HEAD) with nosniff, and 404s on a bad signature", async () => {
    const up = await call({ key }, "/api/media", {
      method: "POST",
      raw: new Uint8Array([1, 2, 3, 4, 5, 6]),
      headers: { "content-type": "image/png", "x-filename": "p.png", "content-length": "6" },
    });
    expect(up.status, up.text).toBe(200);
    const path = new URL(up.json.url).pathname;
    const full = await call(null, path);
    expect(full.status).toBe(200);
    expect(full.headers.get("content-type")).toBe("image/png");
    expect(full.headers.get("x-content-type-options")).toBe("nosniff");
    const part = await call(null, path, { headers: { range: "bytes=2-3" } });
    expect(part.status).toBe(206);
    expect(part.headers.get("content-range")).toBe("bytes 2-3/6");
    expect(part.headers.get("content-length")).toBe("2");
    const head = await call(null, path, { method: "HEAD" });
    expect(head.headers.get("content-length")).toBe("6");
    const [, , id, sig, name] = path.split("/");
    const bad = sig.slice(0, -1) + (sig.endsWith("A") ? "B" : "A");
    expect((await call(null, `/m/${id}/${bad}/${name}`)).status).toBe(404);
    expect((await call(null, `/m/${id}/${sig.slice(0, 15)}/${name}`)).status).toBe(404);
  });
});

describe("throttleIp", () => {
  it("groups IPv6 addresses by /64 and keeps IPv4 as is", () => {
    expect(throttleIp("203.0.113.7")).toBe("203.0.113.7");
    expect(throttleIp(undefined)).toBe("local");
    expect(throttleIp("2001:db8:1:2:aaaa::1")).toBe("2001:db8:1:2::/64");
    expect(throttleIp("2001:0db8:0001:0002:ffff:ffff:ffff:ffff")).toBe("2001:db8:1:2::/64");
    expect(throttleIp("2001:db8::1")).toBe("2001:db8:0:0::/64");
    expect(throttleIp("::1")).toBe("0:0:0:0::/64");
  });
});
