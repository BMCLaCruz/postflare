import { createExecutionContext, env, waitOnExecutionContext } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import worker from "../../worker/index";
import { publishGate } from "../../worker/workflow";
import { ORIGIN, sessionCookie, type CallOptions, type Client } from "./helpers";

// Hosted mode (docs/hosted-spec.md): billing off changes nothing, enabling is refused until configured, plans CRUD,
// trials (start, one per user, expiry), every limit key, the locked state, exempt / manual overrides, permissions,
// checkout and portal of the three providers with a mocked fetch, the admin overview numbers. Own D1 (BILLING_DB).

const E = { ...env, DB: env.BILLING_DB } as unknown as Env;
const PW = "password123";

async function call(client: Client | null, path: string, opts: CallOptions = {}) {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  if (client?.cookie) headers.cookie = client.cookie;
  if (client?.key) headers.authorization = `Bearer ${client.key}`;
  if (client?.ws && !headers["x-workspace-id"]) headers["x-workspace-id"] = client.ws;
  let body: BodyInit | undefined = opts.raw;
  if (opts.body !== undefined) {
    headers["content-type"] ??= "application/json";
    body = JSON.stringify(opts.body);
  }
  const ctx = createExecutionContext();
  const res = await worker.fetch!(new Request(`${ORIGIN}${path}`, { method: opts.method ?? (body ? "POST" : "GET"), headers, body }) as any, E, ctx);
  await waitOnExecutionContext(ctx);
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text, headers: res.headers };
}

const one = <T>(sql: string, ...binds: unknown[]) => E.DB.prepare(sql).bind(...binds).first<T>();
const run = (sql: string, ...binds: unknown[]) => E.DB.prepare(sql).bind(...binds).run();

/** Mocks global fetch (provider APIs) with `answer`; returns the recorded requests. */
function mockFetch(answer: (url: string, init: RequestInit) => unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, init: init ?? {} });
    return new Response(JSON.stringify(answer(url, init ?? {})), { status: 200, headers: { "content-type": "application/json" } });
  });
  return calls;
}

afterEach(() => vi.restoreAllMocks());

let ada: Client; // instance admin, Owner of adaWs
let adaWs: string;
let eve: Client; // Editor in adaWs
let bob: Client; // instance Member, Owner of bobWs
let bobWs: string;
let proId: string;
let freeId: string;

const billing = (client: Client, ws?: string) => call(ws ? { ...client, ws } : client, "/api/billing");
const connectWebhook = (client: Client, url: string) => call(client, "/api/connect/webhook", { body: { values: { name: "Hook", url } } });
const draft = (client: Client, accountIds: string[]) => call(client, "/api/posts", { body: { posts: accountIds.map((accountId) => ({ accountId, content: "Hello" })), scheduledAt: null } });

async function insertAccount(workspaceId: string, provider: string, status = "active") {
  const id = `acc_${provider}_${Math.random().toString(36).slice(2, 10)}`;
  await run(
    "INSERT INTO accounts (id, provider, external_id, name, credentials_enc, status, created_at, updated_at, workspace_id) VALUES (?, ?, ?, ?, 'x', ?, ?, ?, ?)",
    id,
    provider,
    id,
    `${provider} account`,
    status,
    Date.now(),
    Date.now(),
    workspaceId,
  );
  return id;
}

beforeAll(async () => {
  const setup = await call(null, "/api/auth/setup", { body: { name: "Ada", email: "ada@example.com", password: PW } });
  expect(setup.status, setup.text).toBe(200);
  ada = { cookie: sessionCookie(setup.headers)! };
  adaWs = (await call(ada, "/api/me")).json.currentWorkspaceId;
  ada.ws = adaWs;
  const inv = await call(ada, "/api/invitations", { body: { workspaceId: adaWs, workspaceRoleId: "role_ws_editor", instanceRoleId: "role_instance_member" } });
  const accepted = await call(null, "/api/invitations/accept", { body: { token: inv.json.url.split("/invite/")[1], name: "Eve", email: "eve@example.com", password: PW } });
  expect(accepted.status, accepted.text).toBe(200);
  eve = { cookie: sessionCookie(accepted.headers)!, ws: adaWs };
  const inv2 = await call(ada, "/api/invitations", { body: { instanceRoleId: "role_instance_member", newWorkspaceName: "Bob" } });
  const accepted2 = await call(null, "/api/invitations/accept", { body: { token: inv2.json.url.split("/invite/")[1], name: "Bob", email: "bob@example.com", password: PW } });
  expect(accepted2.status, accepted2.text).toBe(200);
  bobWs = accepted2.json.workspaceId;
  bob = { cookie: sessionCookie(accepted2.headers)!, ws: bobWs };
});

describe("billing off (default)", () => {
  it("reports unlimited, no plans, no usage, and refuses checkout", async () => {
    const b = await billing(bob);
    expect(b.status, b.text).toBe(200);
    expect(b.json).toMatchObject({ enabled: false, state: "unlimited", usage: null, limits: null, plans: [], canManage: true, status: "none" });
    expect((await call(null, "/api/billing/plans")).json).toEqual({ enabled: false, currency: "USD", plans: [] });
    expect((await call(bob, "/api/billing/checkout", { body: { planId: "pln_x", interval: "month" } })).status).toBe(409);
  });

  it("enforces nothing", async () => {
    const acc = await connectWebhook(bob, "https://hooks.example.com/off-1");
    expect(acc.status, acc.text).toBe(200);
    const res = await draft(bob, [acc.json.ids[0], acc.json.ids[0], acc.json.ids[0]]);
    expect(res.status, res.text).toBe(201);
    expect((await call(bob, "/api/keys", { method: "POST", body: { name: "k" } })).status).toBe(201);
  });

  it("gives billing.manage to Owners only", async () => {
    const me = await call(eve, "/api/me");
    expect(me.json.workspaces[0].permissions).not.toContain("billing.manage");
    expect((await call(bob, "/api/me")).json.workspaces.find((w: any) => w.id === bobWs).permissions).toContain("billing.manage");
    const roles = (await call(ada, "/api/roles")).json;
    expect(roles.find((r: any) => r.id === "role_ws_owner").permissions).toContain("billing.manage");
    expect(roles.find((r: any) => r.id === "role_ws_admin").permissions).not.toContain("billing.manage");
  });
});

describe("admin billing", () => {
  it("needs instance.settings.manage / instance.users.manage", async () => {
    expect((await call(eve, "/api/admin/billing")).status).toBe(403);
    expect((await call(bob, "/api/admin/billing/plans", { body: { name: "X" } })).status).toBe(403);
    expect((await call(bob, `/api/admin/workspaces/${bobWs}/billing`, { method: "PATCH", body: { exempt: true } })).status).toBe(403);
    expect((await call(bob, "/api/admin/billing/workspaces")).status).toBe(403);
  });

  it("starts off, Polar first, and refuses to turn on until a provider and a paid plan exist", async () => {
    const s = await call(ada, "/api/admin/billing");
    expect(s.status, s.text).toBe(200);
    expect(s.json).toMatchObject({ enabled: false, active: false, activeProvider: null, trialDays: 7, pastDueGraceDays: 7, signupEnabled: false, emailConfigured: false });
    expect(s.json.providers.map((p: any) => p.id)).toEqual(["polar", "stripe", "lemonsqueezy"]);
    expect(s.json.providers[0]).toMatchObject({ recommended: true, configured: false, sandbox: false, webhookUrl: `${ORIGIN}/api/billing/webhooks/polar` });
    expect(s.json.providers[1].sandbox).toBeNull();
    expect(s.json.limits.map((l: any) => l.key)).toEqual(["accounts", "posts_per_month", "x_posts_per_month", "members", "storage_mb", "api"]);
    const on = await call(ada, "/api/admin/billing", { method: "PATCH", body: { enabled: true } });
    expect(on.status).toBe(400);
    expect(on.json.problems).toHaveLength(2);
    expect(on.json.error).toMatch(/can't be turned on yet/);
  });

  it("stores provider credentials encrypted and never returns secrets", async () => {
    const res = await call(ada, "/api/admin/billing/providers/polar", { method: "PUT", body: { values: { accessToken: "polar_oat_secret", webhookSecret: "whsec_c2VjcmV0" }, sandbox: true } });
    expect(res.status, res.text).toBe(200);
    const polar = res.json.providers[0];
    expect(polar).toMatchObject({ configured: true, sandbox: true });
    expect(polar.fields.every((f: any) => f.set && f.value === null)).toBe(true);
    expect(res.text).not.toContain("polar_oat_secret");
    const stored = await one<{ value: string }>("SELECT value FROM settings WHERE key = 'billing_provider:polar'");
    expect(stored!.value.startsWith("v1.")).toBe(true);
    expect(stored!.value).not.toContain("polar_oat_secret");
    // An empty secret keeps the stored one; unknown fields are refused.
    expect((await call(ada, "/api/admin/billing/providers/polar", { method: "PUT", body: { values: { accessToken: "" } } })).json.providers[0].configured).toBe(true);
    expect((await call(ada, "/api/admin/billing/providers/polar", { method: "PUT", body: { values: { nope: "x" } } })).status).toBe(400);
    expect((await call(ada, "/api/admin/billing/providers/paypal", { method: "PUT", body: { values: {} } })).status).toBe(404);
  });

  it("tests the connection with one API call", async () => {
    const calls = mockFetch(() => ({ items: [{ name: "Acme", slug: "acme" }] }));
    const res = await call(ada, "/api/admin/billing/providers/polar/test", { method: "POST" });
    expect(res.json).toEqual({ ok: true, account: "Acme (acme) · sandbox" });
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://sandbox-api.polar.sh/v1/organizations/?limit=1");
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe("Bearer polar_oat_secret");
  });

  it("creates suggested plans and deletes unused plans", async () => {
    const res = await call(ada, "/api/admin/billing/plans/suggested", { method: "POST" });
    expect(res.status, res.text).toBe(201);
    expect(res.json.map((p: any) => p.name)).toEqual(["Free", "Creator", "Team"]);
    expect(res.json[0]).toMatchObject({ isFree: true, limits: { accounts: 3, posts_per_month: 30, x_posts_per_month: 0, members: 1, storage_mb: 500, api: false } });
    expect(res.json[1]).toMatchObject({ priceMonth: 1900, isTrialDefault: true, highlight: true });
    for (const p of res.json) {
      const del = await call(ada, `/api/admin/billing/plans/${p.id}`, { method: "DELETE" });
      expect(del.json).toEqual({ ok: true });
    }
    expect((await call(ada, "/api/admin/billing/plans")).json).toEqual([]);
  });

  it("validates and saves plans; free and trial default are exclusive", async () => {
    expect((await call(ada, "/api/admin/billing/plans", { body: { name: "Bad", limits: { bogus: 1 } } })).status).toBe(400);
    expect((await call(ada, "/api/admin/billing/plans", { body: { name: "Bad", limits: { accounts: -1 } } })).status).toBe(400);
    expect((await call(ada, "/api/admin/billing/plans", { body: { name: "Bad", priceMonth: 9.5 } })).status).toBe(400);
    expect((await call(ada, "/api/admin/billing/plans", { body: { name: "Bad", providerPrices: { paypal: { month: "x" } } } })).status).toBe(400);
    const free = await call(ada, "/api/admin/billing/plans", { body: { name: "Free", isFree: true, limits: { posts_per_month: 30, x_posts_per_month: 0, api: false } } });
    expect(free.status, free.text).toBe(201);
    freeId = free.json.id;
    const pro = await call(ada, "/api/admin/billing/plans", {
      body: {
        name: "Pro",
        priceMonth: 1900,
        features: ["1 account"],
        isTrialDefault: true,
        limits: { accounts: 1, posts_per_month: 2, x_posts_per_month: 0, members: 1, storage_mb: 1, api: false },
        providerPrices: { polar: { month: "prod_m" }, stripe: { month: "price_m" }, lemonsqueezy: { month: "123" } },
      },
    });
    expect(pro.status, pro.text).toBe(201);
    proId = pro.json.id;
    expect(pro.json).toMatchObject({ name: "Pro", currency: "USD", priceYear: null, active: true, workspaces: 0, providerPrices: { polar: { month: "prod_m" } } });
    const other = await call(ada, "/api/admin/billing/plans", { body: { name: "Other", isFree: true } });
    expect((await call(ada, "/api/admin/billing/plans")).json.find((p: any) => p.id === freeId).isFree).toBe(false);
    await call(ada, `/api/admin/billing/plans/${freeId}`, { method: "PATCH", body: { isFree: true, description: "Starter" } });
    const list = (await call(ada, "/api/admin/billing/plans")).json;
    expect(list.find((p: any) => p.id === other.json.id).isFree).toBe(false);
    expect(list.find((p: any) => p.id === freeId)).toMatchObject({ isFree: true, description: "Starter" });
    expect((await call(ada, `/api/admin/billing/plans/${other.json.id}`, { method: "DELETE" })).json).toEqual({ ok: true });
  });

  it("turns on once Polar is the active provider; workspaces that existed become exempt", async () => {
    const res = await call(ada, "/api/admin/billing", { method: "PATCH", body: { activeProvider: "polar", enabled: true } });
    expect(res.status, res.text).toBe(200);
    expect(res.json).toMatchObject({ enabled: true, active: true, problems: [], activeProvider: "polar" });
    expect((await billing(ada)).json).toMatchObject({ enabled: true, exempt: true, state: "unlimited" });
    expect((await billing(bob)).json).toMatchObject({ enabled: true, exempt: true, state: "unlimited" });
    const plans = (await call(null, "/api/billing/plans")).json;
    expect(plans.enabled).toBe(true);
    expect(plans.plans.map((p: any) => [p.name, p.checkoutIntervals])).toEqual([
      ["Free", []],
      ["Pro", ["month"]],
    ]);
  });
});

let trialWs: string;
let freeWs: string;

describe("trials and limits", () => {
  it("a new workspace starts the trial on the trial default plan; a user gets one trial", async () => {
    const created = await call(bob, "/api/workspaces", { body: { name: "Trial" } });
    expect(created.status, created.text).toBe(201);
    trialWs = created.json.id;
    const b = (await billing(bob, trialWs)).json;
    expect(b).toMatchObject({ enabled: true, exempt: false, state: "trial", status: "trialing", subscribedPlanId: proId, canManage: true });
    expect(b.plan).toMatchObject({ id: proId, name: "Pro" });
    expect(b.trialEndsAt - Date.now()).toBeGreaterThan(6.9 * 86_400_000);
    expect(b.limits).toEqual({ accounts: 1, posts_per_month: 2, x_posts_per_month: 0, members: 1, storage_mb: 1, api: false });
    const second = await call(bob, "/api/workspaces", { body: { name: "Second" } });
    freeWs = second.json.id;
    expect((await billing(bob, freeWs)).json).toMatchObject({ state: "free", status: "none", plan: { id: freeId } });
  });

  it("accounts: new ones count, reconnects don't, re-enabling counts", async () => {
    const c = { ...bob, ws: trialWs };
    expect((await connectWebhook(c, "https://hooks.example.com/t1")).status).toBe(200);
    const second = await connectWebhook(c, "https://hooks.example.com/t2");
    expect(second.status, second.text).toBe(402);
    expect(second.json).toMatchObject({ code: "plan_limit", limit: "accounts", used: 1, max: 1, upgradeUrl: `${ORIGIN}/workspace?tab=billing` });
    expect((await connectWebhook(c, "https://hooks.example.com/t1")).status).toBe(200);
    const disabled = await insertAccount(trialWs, "webhook", "disabled");
    const enable = await call(c, `/api/accounts/${disabled}`, { method: "PATCH", body: { status: "active" } });
    expect(enable.status).toBe(402);
    expect(enable.json.limit).toBe("accounts");
    await run("DELETE FROM accounts WHERE id = ?", disabled);
  });

  it("posts per month (one per account post) and X posts", async () => {
    const c = { ...bob, ws: trialWs };
    const acc = (await one<{ id: string }>("SELECT id FROM accounts WHERE workspace_id = ? AND provider = 'webhook'", trialWs))!.id;
    expect((await draft(c, [acc, acc])).status).toBe(201);
    const over = await draft(c, [acc]);
    expect(over.status).toBe(402);
    expect(over.json).toMatchObject({ limit: "posts_per_month", used: 2, max: 2 });
    expect(over.json.error).toMatch(/Pro allows 2 posts this month/);
    // Free plan: 30 posts, 0 X posts.
    const x = await insertAccount(freeWs, "x");
    const xRes = await draft({ ...bob, ws: freeWs }, [x]);
    expect(xRes.status).toBe(402);
    expect(xRes.json).toMatchObject({ limit: "x_posts_per_month", used: 0, max: 0 });
    const hook = await connectWebhook({ ...bob, ws: freeWs }, "https://hooks.example.com/free1");
    expect((await draft({ ...bob, ws: freeWs }, [hook.json.ids[0]])).status).toBe(201);
  });

  it("members (members + pending invitations)", async () => {
    const res = await call(bob, "/api/invitations", { body: { workspaceId: trialWs, workspaceRoleId: "role_ws_viewer" } });
    expect(res.status).toBe(402);
    expect(res.json).toMatchObject({ limit: "members", used: 1, max: 1 });
  });

  it("storage", async () => {
    const c = { ...bob, ws: trialWs };
    const small = await call(c, "/api/media", { raw: new Uint8Array(1000), headers: { "content-type": "image/png", "x-filename": "a.png", "content-length": "1000" } });
    expect(small.status, small.text).toBe(200);
    const big = await call(c, "/api/media", { raw: new Uint8Array(1024 * 1024), headers: { "content-type": "image/png", "x-filename": "b.png", "content-length": String(1024 * 1024) } });
    expect(big.status).toBe(402);
    expect(big.json.limit).toBe("storage_mb");
    const multi = await call(c, "/api/media/multipart", { body: { filename: "v.mp4", mime: "video/mp4", size: 5 * 1024 * 1024 } });
    expect(multi.status).toBe(402);
  });

  it("api: no API keys, and existing keys answer 402", async () => {
    const res = await call({ ...bob, ws: trialWs }, "/api/keys", { method: "POST", body: { name: "cli" } });
    expect(res.status).toBe(402);
    expect(res.json).toMatchObject({ limit: "api", max: false });
    // A key made before the plan changed.
    const key = (await call(bob, "/api/keys", { method: "POST", body: { name: "old" } })).json; // bobWs is exempt
    await run("UPDATE api_keys SET workspace_id = ? WHERE id = ?", trialWs, key.id);
    const viaKey = await call({ key: key.token }, "/api/posts");
    expect(viaKey.status).toBe(402);
    expect(viaKey.json.code).toBe("plan_limit");
    await run("UPDATE api_keys SET workspace_id = ? WHERE id = ?", bobWs, key.id);
    expect((await call({ key: key.token }, "/api/posts")).status).toBe(200);
  });

  it("shows usage next to the limits", async () => {
    const b = (await billing(bob, trialWs)).json;
    expect(b.usage).toEqual({ accounts: 1, postsThisMonth: 2, xPostsThisMonth: 0, members: 1, storageMb: 0 });
  });

  it("trial expiry falls back to the free plan, then to locked (read-only) without one", async () => {
    const c = { ...bob, ws: trialWs };
    await run("UPDATE workspaces SET trial_ends_at = ? WHERE id = ?", Date.now() - 1000, trialWs);
    expect((await billing(bob, trialWs)).json).toMatchObject({ state: "free", status: "trialing", plan: { id: freeId } });
    await call(ada, `/api/admin/billing/plans/${freeId}`, { method: "PATCH", body: { active: false } });
    expect((await billing(bob, trialWs)).json).toMatchObject({ state: "locked", plan: null });
    const acc = (await one<{ id: string }>("SELECT id FROM accounts WHERE workspace_id = ? AND provider = 'webhook'", trialWs))!.id;
    const locked = await draft(c, [acc]);
    expect(locked.status).toBe(402);
    expect(locked.json).toMatchObject({ code: "plan_limit", limit: "locked" });
    expect(locked.json.error).toMatch(/no active plan/);
    const post = (await one<{ id: string }>("SELECT id FROM posts WHERE workspace_id = ? LIMIT 1", trialWs))!.id;
    expect((await call(c, `/api/posts/${post}`, { method: "PATCH", body: { scheduledAt: Date.now() + 3600_000 } })).status).toBe(402);
    expect((await call(c, `/api/posts/${post}`, { method: "PATCH", body: { content: "still editable as a draft" } })).status).toBe(200);
    expect((await call(c, "/api/upload-links", { body: {} })).status).toBe(402);
    expect((await call(c, "/api/posts")).status).toBe(200);
    expect((await call(c, "/api/accounts")).status).toBe(200);
    // Already scheduled posts fail at publish time (the workflow's sandbox check reads it in the same query).
    expect(await publishGate(E.DB, post)).toEqual({ demo: false, locked: true });
    expect((await call(c, `/api/posts/${post}`, { method: "DELETE" })).status).toBe(200);
    await call(ada, `/api/admin/billing/plans/${freeId}`, { method: "PATCH", body: { active: true } });
    expect(await publishGate(E.DB, (await one<{ id: string }>("SELECT id FROM posts WHERE workspace_id = ? LIMIT 1", trialWs))!.id)).toEqual({ demo: false, locked: false });
  });
});

describe("instance admin overrides", () => {
  it("comps a workspace and assigns a plan by hand (provider manual)", async () => {
    const comp = await call(ada, `/api/admin/workspaces/${trialWs}/billing`, { method: "PATCH", body: { exempt: true } });
    expect(comp.status, comp.text).toBe(200);
    expect(comp.json).toMatchObject({ workspaceId: trialWs, exempt: true, state: "unlimited" });
    expect((await call({ ...bob, ws: trialWs }, "/api/keys", { method: "POST", body: { name: "now ok" } })).status).toBe(201);
    const manual = await call(ada, `/api/admin/workspaces/${trialWs}/billing`, { method: "PATCH", body: { exempt: false, planId: proId } });
    expect(manual.json).toMatchObject({ exempt: false, state: "plan", status: "active", provider: "manual", planId: proId, planName: "Pro" });
    expect((await call(ada, `/api/admin/workspaces/${trialWs}/billing`, { method: "PATCH", body: { planId: "pln_nope" } })).status).toBe(404);
    expect((await call(ada, `/api/admin/workspaces/${trialWs}/billing`, { method: "PATCH", body: { status: "bogus" } })).status).toBe(400);
    expect((await call(ada, "/api/admin/workspaces/ws_nope/billing")).status).toBe(404);
    const list = (await call(ada, "/api/admin/billing/workspaces?status=active")).json;
    expect(list.map((w: any) => w.workspaceId)).toEqual([trialWs]);
    // Archive instead of delete while a workspace is on the plan (another paid plan keeps billing on: archiving the last
    // one would turn billing off, see recomputeBillingOn).
    expect((await call(ada, "/api/admin/billing/plans", { body: { name: "Team", priceYear: 49000, position: 5 } })).status).toBe(201);
    expect((await call(ada, `/api/admin/billing/plans/${proId}`, { method: "DELETE" })).json).toEqual({ ok: true, archived: true });
    expect((await billing(bob, trialWs)).json).toMatchObject({ state: "plan", plan: { id: proId } });
    await call(ada, `/api/admin/billing/plans/${proId}`, { method: "PATCH", body: { active: true, isTrialDefault: true } });
  });
});

describe("permissions", () => {
  it("members without billing.manage see the plan but cannot buy; other workspaces are 404", async () => {
    const b = await billing(eve);
    expect(b.status).toBe(200);
    expect(b.json.canManage).toBe(false);
    expect((await call(eve, "/api/billing/checkout", { body: { planId: proId, interval: "month" } })).status).toBe(403);
    expect((await call(eve, "/api/billing/portal", { method: "POST" })).status).toBe(403);
    expect((await billing(bob, adaWs)).status).toBe(404);
    expect((await call({ ...bob, ws: adaWs }, "/api/billing/checkout", { body: { planId: proId, interval: "month" } })).status).toBe(404);
  });
});

describe("checkout and portal", () => {
  it("Polar checkout: products, metadata, return URLs", async () => {
    const calls = mockFetch(() => ({ url: "https://sandbox.polar.sh/checkout/c1" }));
    const c = { ...bob, ws: freeWs };
    const res = await call(c, "/api/billing/checkout", { body: { planId: proId, interval: "month" } });
    expect(res.status, res.text).toBe(200);
    expect(res.json).toEqual({ url: "https://sandbox.polar.sh/checkout/c1" });
    expect(calls[0].url).toBe("https://sandbox-api.polar.sh/v1/checkouts/");
    expect(calls[0].init.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      products: ["prod_m"],
      success_url: `${ORIGIN}/workspace?tab=billing&checkout=success`,
      return_url: `${ORIGIN}/workspace?tab=billing&checkout=canceled`,
      customer_email: "bob@example.com",
      metadata: { workspace_id: freeWs, plan_id: proId, interval: "month" },
    });
    expect((await call(c, "/api/billing/checkout", { body: { planId: proId, interval: "year" } })).status).toBe(400);
    expect((await call(c, "/api/billing/checkout", { body: { planId: freeId, interval: "month" } })).status).toBe(400);
    expect((await call(c, "/api/billing/checkout", { body: { planId: "pln_nope", interval: "month" } })).status).toBe(404);
    expect((await call(bob, "/api/billing/checkout", { body: { planId: proId, interval: "month" } })).status).toBe(409); // exempt
  });

  it("Stripe checkout: form-encoded subscription session", async () => {
    await call(ada, "/api/admin/billing/providers/stripe", { method: "PUT", body: { values: { secretKey: "sk_test_1", webhookSecret: "whsec_s" } } });
    await call(ada, "/api/admin/billing", { method: "PATCH", body: { activeProvider: "stripe" } });
    const calls = mockFetch(() => ({ url: "https://checkout.stripe.com/c/pay/cs_1" }));
    const res = await call({ ...bob, ws: freeWs }, "/api/billing/checkout", { body: { planId: proId, interval: "month" } });
    expect(res.json).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_1" });
    expect(calls[0].url).toBe("https://api.stripe.com/v1/checkout/sessions");
    const h = calls[0].init.headers as Record<string, string>;
    expect(h.authorization).toBe("Bearer sk_test_1");
    expect(h["content-type"]).toBe("application/x-www-form-urlencoded");
    const form = new URLSearchParams(String(calls[0].init.body));
    expect(Object.fromEntries(form)).toMatchObject({
      mode: "subscription",
      "line_items[0][price]": "price_m",
      "line_items[0][quantity]": "1",
      client_reference_id: freeWs,
      "metadata[workspace_id]": freeWs,
      "subscription_data[metadata][workspace_id]": freeWs,
      customer_email: "bob@example.com",
      success_url: `${ORIGIN}/workspace?tab=billing&checkout=success`,
    });
  });

  it("Lemon Squeezy checkout: JSON:API with custom data", async () => {
    await call(ada, "/api/admin/billing/providers/lemonsqueezy", { method: "PUT", body: { values: { apiKey: "ls_key", storeId: "77", webhookSecret: "lssecret" } } });
    const state = await call(ada, "/api/admin/billing", { method: "PATCH", body: { activeProvider: "lemonsqueezy" } });
    expect(state.json.providers[2].fields.find((f: any) => f.key === "storeId")).toMatchObject({ set: true, value: "77" });
    const calls = mockFetch(() => ({ data: { attributes: { url: "https://acme.lemonsqueezy.com/checkout/custom/1" } } }));
    const res = await call({ ...bob, ws: freeWs }, "/api/billing/checkout", { body: { planId: proId, interval: "month" } });
    expect(res.json).toEqual({ url: "https://acme.lemonsqueezy.com/checkout/custom/1" });
    expect(calls[0].url).toBe("https://api.lemonsqueezy.com/v1/checkouts");
    expect((calls[0].init.headers as Record<string, string>)["content-type"]).toBe("application/vnd.api+json");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      data: {
        type: "checkouts",
        attributes: {
          checkout_data: { email: "bob@example.com", custom: { workspace_id: freeWs, plan_id: proId, interval: "month" } },
          product_options: { redirect_url: `${ORIGIN}/workspace?tab=billing&checkout=success` },
        },
        relationships: { store: { data: { type: "stores", id: "77" } }, variant: { data: { type: "variants", id: "123" } } },
      },
    });
  });

  it("portal per provider; a running subscription refuses a second checkout", async () => {
    const c = { ...bob, ws: freeWs };
    expect((await call(c, "/api/billing/portal", { method: "POST" })).status).toBe(409);
    await run("UPDATE workspaces SET billing_provider = 'stripe', billing_customer_id = 'cus_1', billing_subscription_id = 'sub_1', billing_status = 'active', plan_id = ? WHERE id = ?", proId, freeWs);
    expect((await call(c, "/api/billing/checkout", { body: { planId: proId, interval: "month" } })).status).toBe(409);
    let calls = mockFetch(() => ({ url: "https://billing.stripe.com/p/session/1" }));
    expect((await call(c, "/api/billing/portal", { method: "POST" })).json).toEqual({ url: "https://billing.stripe.com/p/session/1" });
    expect(calls[0].url).toBe("https://api.stripe.com/v1/billing_portal/sessions");
    expect(Object.fromEntries(new URLSearchParams(String(calls[0].init.body)))).toEqual({ customer: "cus_1", return_url: `${ORIGIN}/workspace?tab=billing` });
    vi.restoreAllMocks();

    await run("UPDATE workspaces SET billing_provider = 'polar', billing_customer_id = 'cust-uuid' WHERE id = ?", freeWs);
    calls = mockFetch(() => ({ customer_portal_url: "https://polar.sh/acme/portal?token=t" }));
    expect((await call(c, "/api/billing/portal", { method: "POST" })).json).toEqual({ url: "https://polar.sh/acme/portal?token=t" });
    expect(calls[0].url).toBe("https://sandbox-api.polar.sh/v1/customer-sessions/");
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ customer_id: "cust-uuid", return_url: `${ORIGIN}/workspace?tab=billing` });
    vi.restoreAllMocks();

    await run("UPDATE workspaces SET billing_provider = 'lemonsqueezy', billing_customer_id = '9', billing_subscription_id = '42' WHERE id = ?", freeWs);
    calls = mockFetch(() => ({ data: { attributes: { urls: { customer_portal: "https://acme.lemonsqueezy.com/billing?expires=1" } } } }));
    expect((await call(c, "/api/billing/portal", { method: "POST" })).json).toEqual({ url: "https://acme.lemonsqueezy.com/billing?expires=1" });
    expect(calls[0].url).toBe("https://api.lemonsqueezy.com/v1/subscriptions/42");
    expect(calls[0].init.method).toBe("GET");
  });

  it("provider errors answer 502 with the provider's message", async () => {
    await run("UPDATE workspaces SET billing_subscription_id = NULL, billing_status = 'none' WHERE id = ?", freeWs);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({ errors: [{ detail: "The variant is not published." }] }), { status: 422 }));
    const res = await call({ ...bob, ws: freeWs }, "/api/billing/checkout", { body: { planId: proId, interval: "month" } });
    expect(res.status).toBe(502);
    expect(res.json.error).toMatch(/The variant is not published/);
  });

  it("refuses to delete the provider that sells while billing is on", async () => {
    expect((await call(ada, "/api/admin/billing/providers/lemonsqueezy", { method: "DELETE" })).status).toBe(409);
  });
});

describe("admin overview", () => {
  it("counts paying, trialing and exempt workspaces and estimates MRR", async () => {
    await run("UPDATE workspaces SET billing_provider = 'stripe', billing_status = 'active', billing_interval = 'month', plan_id = ? WHERE id = ?", proId, freeWs);
    const o = (await call(ada, "/api/admin/overview")).json;
    expect(o.billing).toMatchObject({ enabled: true, paying: 1, manual: 1, trialing: 0, pastDue: 0, mrrCents: 1900, currency: "USD" });
    expect(o.billing.exempt).toBeGreaterThanOrEqual(2);
    expect(o.counts.users.pending).toBe(0);
  });

  it("turning billing off removes every limit at once", async () => {
    await call(ada, "/api/admin/billing", { method: "PATCH", body: { enabled: false } });
    expect((await billing(bob, trialWs)).json).toMatchObject({ enabled: false, state: "unlimited", limits: null });
    expect((await call({ ...bob, ws: trialWs }, "/api/invitations", { body: { workspaceId: trialWs, workspaceRoleId: "role_ws_viewer" } })).status).toBe(201);
  });
});
