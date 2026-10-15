import { Hono } from "hono";
import type { CreatePostsInput, ResolvePostInput, ThreadItem } from "../../shared/types";
import type { Context } from "hono";
import { forbidInDemoWorkspace, requirePermission, wsId, type AppEnv } from "../lib/auth";
import { findAccount, freshAccount, providerContext, type AccountRow } from "../lib/accounts";
import { DEMO_POSTS_PER_DAY, demoPostsLeft, queueDemoPublish, simulateDueDemoPosts } from "../lib/demo";
import type { MediaRow } from "../lib/media";
import { normalizeVariant, resolveAttribution } from "../lib/playbooks";
import { findPost, logPost, logStatement, postDto, startWorkflow, startWorkflows, terminateWorkflow, workflowInstanceId, type PostRow } from "../lib/posts";
import { errorMessage, newId, now, parseJson } from "../lib/util";
import { validatePost } from "../lib/validate";
import { ProviderError } from "../providers/errors";
import { getProvider } from "../providers/registry";

export const postRoutes = new Hono<AppEnv>();

type Draft = { accountId: string; content: string; media: string[]; settings: Record<string, unknown>; thread: ThreadItem[] };

type Media = Map<string, MediaRow>;

/** Accounts and media of the workspace that the drafts use: two queries whatever the number of drafts. */
async function loadRefs(env: Env, workspaceId: string, drafts: Draft[]): Promise<{ accounts: Map<string, AccountRow>; media: Media }> {
  const accountIds = [...new Set(drafts.map((d) => d.accountId))];
  const mediaIds = [...new Set(drafts.flatMap((d) => [...d.media, ...d.thread.flatMap((t) => t.media)]))];
  const [accounts, media] = await Promise.all([
    accountIds.length
      ? env.DB.prepare(`SELECT * FROM accounts WHERE workspace_id = ? AND id IN (${accountIds.map(() => "?").join(",")})`)
          .bind(workspaceId, ...accountIds)
          .all<AccountRow>()
      : { results: [] as AccountRow[] },
    mediaIds.length
      ? env.DB.prepare(`SELECT * FROM media WHERE workspace_id = ? AND id IN (${mediaIds.map(() => "?").join(",")})`)
          .bind(workspaceId, ...mediaIds)
          .all<MediaRow>()
      : { results: [] as MediaRow[] },
  ]);
  return { accounts: new Map(accounts.results.map((r) => [r.id, r])), media: new Map(media.results.map((r) => [r.id, r])) };
}

/** Media rows in order. Throws for ids that are unknown or belong to another workspace. */
function mediaRows(media: Media, ids: string[]): MediaRow[] {
  return ids.map((id) => {
    const row = media.get(id);
    if (!row) throw new Error(`Media ${id} not found`);
    return row;
  });
}

/** Validate a draft against its account's provider. Returns errors (empty when valid). No D1 query. */
function check(refs: Awaited<ReturnType<typeof loadRefs>>, d: Draft, strict: boolean): string[] {
  const account = refs.accounts.get(d.accountId);
  if (!account) return [`Account ${d.accountId} not found`];
  const provider = getProvider(account.provider);
  if (!provider) return [`Unknown provider ${account.provider}`];
  try {
    // Drafts are not validated against the platform, but their media must belong to this workspace.
    const media = mediaRows(refs.media, d.media);
    const thread = d.thread.map((t) => ({ ...t, mediaRows: mediaRows(refs.media, t.media) }));
    if (!strict) return [];
    if (account.status === "disabled") return [`${account.name} is disabled`];
    return validatePost(provider, { content: d.content, media, settings: d.settings, thread }).map((e) => `${account.name}: ${e}`);
  } catch (err) {
    return [(err as Error).message];
  }
}

async function checkAll(env: Env, workspaceId: string, drafts: Draft[], strict: boolean): Promise<string[]> {
  const refs = await loadRefs(env, workspaceId, drafts);
  return drafts.flatMap((d) => check(refs, d, strict));
}

function normalize(p: CreatePostsInput["posts"][number]): Draft {
  return {
    accountId: p.accountId,
    content: p.content ?? "",
    media: p.media ?? [],
    settings: p.settings ?? {},
    thread: (p.thread ?? []).map((t) => ({ content: t.content ?? "", media: t.media ?? [] })),
  };
}

/**
 * Playbook attribution of a create/update body: `undefined` when the body has none of the fields, else the values to
 * store (`playbookId: null` clears it). The playbook must be built-in or belong to this workspace (else "not found").
 */
async function attribution(
  env: Env,
  workspaceId: string,
  body: { playbookId?: string | null; playbookVersion?: number | null; variant?: string | null },
  current?: { id: string | null; version: number | null; variant: string | null },
): Promise<{ id: string | null; version: number | null; variant: string | null } | { error: string } | undefined> {
  if (body.playbookId === undefined && body.playbookVersion === undefined && body.variant === undefined) return undefined;
  const variant = body.variant === undefined ? (current?.variant ?? null) : normalizeVariant(body.variant);
  if (variant && typeof variant === "object") return variant;
  // Only the variant changes: keep the playbook as it is.
  if (current && body.playbookId === undefined && body.playbookVersion === undefined) return { id: current.id, version: current.version, variant };
  const ref = body.playbookId === undefined ? (current?.id ?? null) : body.playbookId;
  if (ref === null || ref === "") {
    if (body.playbookVersion != null) return { error: "playbookVersion needs a playbookId" };
    return { id: null, version: null, variant };
  }
  if (typeof ref !== "string") return { error: "playbookId must be a string" };
  const version = body.playbookVersion === undefined || body.playbookVersion === null ? null : Number(body.playbookVersion);
  const res = await resolveAttribution(env.DB, workspaceId, ref, version);
  if ("error" in res) return res;
  return { id: res.id, version: res.version, variant };
}

/** Returns null for an unparseable `scheduledAt` (NaN would otherwise be stored as NULL and publish immediately). */
function resolveSchedule(scheduledAt: CreatePostsInput["scheduledAt"]): { status: PostRow["status"]; at: number | null } | null {
  if (scheduledAt === null || scheduledAt === undefined) return { status: "draft", at: null };
  if (scheduledAt === "now") return { status: "scheduled", at: now() };
  // A ms timestamp or an ISO date string.
  const at = typeof scheduledAt === "string" ? Date.parse(scheduledAt) : Number(scheduledAt);
  // Workflows can sleep for at most a year.
  if (!Number.isFinite(at) || at > now() + 360 * 24 * 60 * 60 * 1000) return null;
  return { status: "scheduled", at: Math.max(at, now()) };
}

/**
 * Demo workspace: posts never get a Workflow. Immediate ones are "published" a few seconds later in the background,
 * later ones when they are due (`simulateDueDemoPosts`: cron, and whenever the demo's posts are listed).
 */
const isDemo = (c: Context<AppEnv>) => !!c.var.workspace?.demo;
const isImmediate = (at: number | null) => at !== null && at <= now() + 5000;
const demoPublish = (c: Context<AppEnv>, ids: string[]) => queueDemoPublish(c.env, (p) => c.executionCtx.waitUntil(p), ids);

postRoutes.get("/posts", requirePermission("posts.read"), async (c) => {
  if (isDemo(c)) await simulateDueDemoPosts(c.env, wsId(c));
  const where: string[] = ["workspace_id = ?"];
  const binds: unknown[] = [wsId(c)];
  const { from, to, status, accountId, groupId } = c.req.query();
  if (from) where.push("COALESCE(scheduled_at, created_at) >= ?") && binds.push(Number(from));
  if (to) where.push("COALESCE(scheduled_at, created_at) < ?") && binds.push(Number(to));
  if (status) {
    const list = status.split(",");
    where.push(`status IN (${list.map(() => "?").join(",")})`);
    binds.push(...list);
  }
  if (accountId) where.push("account_id = ?") && binds.push(accountId);
  if (groupId) where.push("group_id = ?") && binds.push(groupId);
  const playbookId = c.req.query("playbookId");
  if (playbookId === "none") where.push("playbook_id IS NULL");
  else if (playbookId === "any") where.push("playbook_id IS NOT NULL");
  else if (playbookId) where.push("playbook_id = ?") && binds.push(playbookId);
  const variant = c.req.query("variant");
  if (variant) where.push("variant = ?") && binds.push(variant);
  const limit = Math.min(Number(c.req.query("limit")) || 500, 1000);
  const order = c.req.query("order") === "desc" ? "DESC" : "ASC";
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM posts WHERE ${where.join(" AND ")} ORDER BY COALESCE(scheduled_at, created_at) ${order} LIMIT ?`,
  )
    .bind(...binds, limit)
    .all<PostRow>();
  return c.json(results.map(postDto));
});

postRoutes.get("/posts/:id", requirePermission("posts.read"), async (c) => {
  const row = await findPost(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  const { results } = await c.env.DB.prepare(
    "SELECT id, level, message, created_at AS createdAt FROM post_logs WHERE post_id = ? ORDER BY id",
  )
    .bind(row.id)
    .all();
  return c.json({ ...postDto(row), logs: results });
});

postRoutes.post("/posts/validate", requirePermission("posts.write"), async (c) => {
  const body = await c.req.json<CreatePostsInput>();
  const errors = await checkAll(c.env, wsId(c), (body.posts ?? []).map(normalize), true);
  return c.json({ errors });
});

postRoutes.post("/posts", requirePermission("posts.write"), async (c) => {
  const workspaceId = wsId(c);
  const body = await c.req.json<CreatePostsInput>();
  if (!body.posts?.length) return c.json({ error: "Select at least one account" }, 400);
  const drafts = body.posts.map(normalize);
  const schedule = resolveSchedule(body.scheduledAt);
  if (!schedule) return c.json({ error: "Invalid scheduledAt" }, 400);
  const { status, at } = schedule;
  const errors = await checkAll(c.env, workspaceId, drafts, status !== "draft");
  if (errors.length) return c.json({ error: errors.join("\n"), errors }, 400);
  const pb = await attribution(c.env, workspaceId, body);
  if (pb && "error" in pb) return c.json({ error: pb.error }, pb.error.endsWith("not found") ? 404 : 400);
  if (isDemo(c) && (await demoPostsLeft(c.env, workspaceId)) < drafts.length) {
    return c.json(
      { error: `The live demo has reached today's limit of ${DEMO_POSTS_PER_DAY} new posts. It resets daily: come back tomorrow, or deploy your own Postflare.` },
      429,
    );
  }

  const groupId = newId("grp_");
  const t = now();
  const demo = isDemo(c);
  // Real workspaces start one workflow per scheduled post; its instance id is known up front (`${id}-0`).
  const withWorkflow = status === "scheduled" && !demo;
  const rows = drafts.map((d) => {
    const id = newId("pst_");
    return { id, revision: 0, d, workflowId: withWorkflow ? workflowInstanceId({ id, revision: 0 }) : null };
  });
  const message = status === "scheduled" ? (body.scheduledAt === "now" ? "Queued for immediate publishing" : `Scheduled for ${new Date(at!).toISOString()}`) : null;
  // One batch (one transaction) for every row and log line: the D1 query count does not grow with the accounts.
  await c.env.DB.batch([
    ...rows.map((r) =>
      c.env.DB.prepare(
        `INSERT INTO posts (id, group_id, account_id, status, scheduled_at, content, media, settings, thread, attempts, revision, workflow_id, created_at, updated_at, workspace_id, created_by, playbook_id, playbook_version, variant)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(r.id, groupId, r.d.accountId, status, at, r.d.content, JSON.stringify(r.d.media), JSON.stringify(r.d.settings), JSON.stringify(r.d.thread), r.workflowId, t, t, workspaceId, c.var.user.id, pb?.id ?? null, pb?.version ?? null, pb?.variant ?? null),
    ),
    ...(message ? rows.map((r) => logStatement(c.env.DB, r.id, "info", message)) : []),
  ]);
  if (withWorkflow) {
    // If this fails, the posts keep their workflow ids and the cron sweep (sweepScheduledPosts) re-arms them.
    await startWorkflows(c.env, rows);
  } else if (demo && status === "scheduled" && isImmediate(at)) {
    await demoPublish(c, rows.map((r) => r.id));
  }
  const { results } = await c.env.DB.prepare("SELECT * FROM posts WHERE group_id = ? AND workspace_id = ?")
    .bind(groupId, workspaceId)
    .all<PostRow>();
  return c.json(results.map(postDto), 201);
});

/** Edit a draft/scheduled/failed post. Changing `scheduledAt` reschedules; null turns it into a draft. */
postRoutes.patch("/posts/:id", requirePermission("posts.write"), async (c) => {
  const row = await findPost(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (!["draft", "scheduled", "failed", "cancelled"].includes(row.status))
    return c.json({ error: `A ${row.status} post cannot be edited` }, 409);
  const body = await c.req.json<Partial<Draft> & Pick<CreatePostsInput, "playbookId" | "playbookVersion" | "variant"> & { scheduledAt?: CreatePostsInput["scheduledAt"] }>();
  const draft: Draft = {
    accountId: row.account_id,
    content: body.content ?? row.content,
    media: body.media ?? parseJson(row.media, []),
    settings: body.settings ?? parseJson(row.settings, {}),
    thread: body.thread ? body.thread.map((t) => ({ content: t.content ?? "", media: t.media ?? [] })) : parseJson(row.thread, []),
  };
  const sched =
    body.scheduledAt !== undefined
      ? resolveSchedule(body.scheduledAt)
      : { status: row.status === "scheduled" ? "scheduled" : ("draft" as PostRow["status"]), at: row.scheduled_at };
  if (!sched) return c.json({ error: "Invalid scheduledAt" }, 400);
  const errors = await checkAll(c.env, wsId(c), [draft], sched.status === "scheduled");
  if (errors.length) return c.json({ error: errors.join("\n"), errors }, 400);
  const pb = (await attribution(c.env, wsId(c), body, { id: row.playbook_id ?? null, version: row.playbook_version ?? null, variant: row.variant ?? null })) ?? {
    id: row.playbook_id ?? null,
    version: row.playbook_version ?? null,
    variant: row.variant ?? null,
  };
  if ("error" in pb) return c.json({ error: pb.error }, pb.error.endsWith("not found") ? 404 : 400);

  // Guarded on the revision/status we read: if the workflow claimed the post meanwhile, it is publishing and must
  // not be rescheduled (that would publish it twice). Bump first, then stop the old workflow: its claim now fails.
  const revision = row.revision + 1;
  const res = await c.env.DB.prepare(
    `UPDATE posts SET content = ?, media = ?, settings = ?, thread = ?, status = ?, scheduled_at = ?, error = NULL,
       revision = ?, workflow_id = NULL, updated_at = ?, playbook_id = ?, playbook_version = ?, variant = ? WHERE id = ? AND workspace_id = ? AND revision = ? AND status = ?`,
  )
    .bind(draft.content, JSON.stringify(draft.media), JSON.stringify(draft.settings), JSON.stringify(draft.thread), sched.status, sched.at, revision, now(), pb.id, pb.version, pb.variant, row.id, wsId(c), row.revision, row.status)
    .run();
  if (!res.meta.changes) return c.json({ error: "The post changed while saving (it may be publishing), reload and try again" }, 409);
  if (row.workflow_id) await terminateWorkflow(c.env, row.workflow_id);
  if (sched.status === "scheduled") {
    if (isDemo(c)) {
      await logPost(c.env, row.id, "info", `Rescheduled for ${new Date(sched.at!).toISOString()}`);
      if (isImmediate(sched.at)) await demoPublish(c, [row.id]);
    } else {
      await startWorkflow(c.env, { id: row.id, revision, workflow_id: null });
      await logPost(c.env, row.id, "info", `Rescheduled for ${new Date(sched.at!).toISOString()}`);
    }
  }
  return c.json(postDto((await findPost(c.env, wsId(c), row.id))!));
});

postRoutes.post("/posts/:id/retry", requirePermission("posts.write"), async (c) => {
  const row = await findPost(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status !== "failed" && row.status !== "cancelled") return c.json({ error: "Only failed or cancelled posts can be retried" }, 409);
  const revision = row.revision + 1;
  const res = await c.env.DB.prepare(
    "UPDATE posts SET status = 'scheduled', scheduled_at = ?, error = NULL, revision = ?, workflow_id = NULL, updated_at = ? WHERE id = ? AND revision = ? AND status = ?",
  )
    .bind(now(), revision, now(), row.id, row.revision, row.status)
    .run();
  if (!res.meta.changes) return c.json({ error: "The post changed meanwhile, reload and try again" }, 409);
  if (isDemo(c)) {
    await logPost(c.env, row.id, "info", "Retry requested");
    await demoPublish(c, [row.id]);
  } else {
    await startWorkflow(c.env, { id: row.id, revision, workflow_id: null });
    await logPost(c.env, row.id, "info", "Retry requested");
  }
  return c.json(postDto((await findPost(c.env, wsId(c), row.id))!));
});

/**
 * Adds a follow-up (comment / thread reply) under an already published post, published right away. Not part of the
 * post's thread: it is logged on the post.
 */
postRoutes.post("/posts/:id/comments", requirePermission("posts.write"), forbidInDemoWorkspace("Commenting on live posts"), async (c) => {
  const row = await findPost(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status !== "published" || !row.external_id) return c.json({ error: "Only published posts can get a comment" }, 409);
  const { content } = await c.req.json<{ content?: string }>().catch(() => ({ content: undefined }));
  const text = content?.trim();
  if (!text) return c.json({ error: "content is required" }, 400);
  const accountRow = await findAccount(c.env, wsId(c), row.account_id);
  const provider = accountRow && getProvider(accountRow.provider);
  if (!accountRow || !provider) return c.json({ error: "The post's account no longer exists" }, 409);
  if (!provider.reply || !provider.capabilities.thread) return c.json({ error: `${provider.name} does not support comments or replies` }, 400);
  const settings = parseJson<Record<string, unknown>>(row.settings, {});
  try {
    const ctx = await providerContext(c.env, provider, { requestUrl: c.req.url });
    const account = await freshAccount(c.env, provider, ctx, accountRow);
    const data = parseJson<Record<string, unknown>>(row.external_data, {});
    const r = await provider.reply(ctx, account, { rootId: row.external_id, parentId: row.external_id, rootData: data, parentData: data }, {
      id: `${row.id}-c${now()}`,
      content: text,
      media: [],
      settings,
      scheduledAt: row.scheduled_at ?? now(),
      createdAt: row.created_at,
    });
    await logPost(c.env, row.id, "info", `Comment added${r.url ? `: ${r.url}` : ""}`);
    return c.json({ externalId: r.externalId, url: r.url ?? null }, 201);
  } catch (err) {
    await logPost(c.env, row.id, "warn", `Comment failed: ${errorMessage(err)}`);
    return c.json({ error: errorMessage(err) }, err instanceof ProviderError && err.kind === "auth" ? 401 : 502);
  }
});

/**
 * A needs_check post (the platform may or may not have it): the user checked the profile.
 * published: true marks it published (with the URL of the live post, if given); false publishes it again now.
 */
postRoutes.post("/posts/:id/resolve", requirePermission("posts.write"), async (c) => {
  const row = await findPost(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status !== "needs_check") return c.json({ error: "Only posts that need a check can be resolved" }, 409);
  const body = await c.req.json<ResolvePostInput>().catch(() => null);
  if (!body || typeof body.published !== "boolean") return c.json({ error: "published (boolean) is required" }, 400);
  const revision = row.revision + 1;
  const t = now();
  if (body.published) {
    let url: string | null = null;
    if (body.url) {
      try {
        const u = new URL(String(body.url));
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error();
        url = u.toString();
      } catch {
        return c.json({ error: "Invalid url" }, 400);
      }
    }
    // Guarded on the revision we read; the bump makes any instance still holding this post stale.
    const res = await c.env.DB.prepare(
      `UPDATE posts SET status = 'published', external_url = COALESCE(?, external_url), error = NULL, published_at = ?, revision = ?, updated_at = ?
       WHERE id = ? AND workspace_id = ? AND revision = ? AND status = 'needs_check'`,
    )
      .bind(url, t, revision, t, row.id, wsId(c), row.revision)
      .run();
    if (!res.meta.changes) return c.json({ error: "The post changed meanwhile, reload and try again" }, 409);
    await logPost(c.env, row.id, "info", `Marked as published by ${c.var.user.name ?? "a user"}${url ? `: ${url}` : ""}`);
  } else {
    const res = await c.env.DB.prepare(
      "UPDATE posts SET status = 'scheduled', scheduled_at = ?, error = NULL, revision = ?, workflow_id = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND revision = ? AND status = 'needs_check'",
    )
      .bind(t, revision, t, row.id, wsId(c), row.revision)
      .run();
    if (!res.meta.changes) return c.json({ error: "The post changed meanwhile, reload and try again" }, 409);
    const message = `Retry requested by ${c.var.user.name ?? "a user"} after a check (the platform may now have it twice)`;
    if (isDemo(c)) {
      await logPost(c.env, row.id, "info", message);
      await demoPublish(c, [row.id]);
    } else {
      await startWorkflow(c.env, { id: row.id, revision, workflow_id: null });
      await logPost(c.env, row.id, "info", message);
    }
  }
  return c.json(postDto((await findPost(c.env, wsId(c), row.id))!));
});

postRoutes.post("/posts/:id/cancel", requirePermission("posts.write"), async (c) => {
  const row = await findPost(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status !== "scheduled") return c.json({ error: "Only scheduled posts can be cancelled" }, 409);
  // Only cancel if the workflow has not claimed it yet; then stop the workflow (its claim fails on the new revision).
  const res = await c.env.DB.prepare(
    "UPDATE posts SET status = 'cancelled', revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'scheduled'",
  )
    .bind(now(), row.id, row.revision)
    .run();
  if (!res.meta.changes) return c.json({ error: "The post is already being published" }, 409);
  if (row.workflow_id) await terminateWorkflow(c.env, row.workflow_id);
  await logPost(c.env, row.id, "info", "Cancelled");
  return c.json(postDto((await findPost(c.env, wsId(c), row.id))!));
});

postRoutes.delete("/posts/:id", requirePermission("posts.write"), async (c) => {
  const row = await findPost(c.env, wsId(c), c.req.param("id"));
  if (!row) return c.json({ error: "Not found" }, 404);
  if (row.status === "publishing") return c.json({ error: "The post is being published right now" }, 409);
  // Guarded so a post claimed by its workflow since we read it is not deleted (and its workflow killed) mid-publish.
  const [res] = await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM posts WHERE id = ? AND workspace_id = ? AND status != 'publishing'").bind(row.id, wsId(c)),
    c.env.DB.prepare("DELETE FROM post_logs WHERE post_id = ? AND NOT EXISTS (SELECT 1 FROM posts WHERE id = ?)").bind(row.id, row.id),
    c.env.DB.prepare("DELETE FROM post_metrics WHERE post_id = ? AND NOT EXISTS (SELECT 1 FROM posts WHERE id = ?)").bind(row.id, row.id),
  ]);
  if (!res.meta.changes && (await findPost(c.env, wsId(c), row.id))) return c.json({ error: "The post is being published right now" }, 409);
  if (row.workflow_id && row.status === "scheduled") await terminateWorkflow(c.env, row.workflow_id);
  return c.json({ ok: true });
});

postRoutes.get("/overview", requirePermission("posts.read"), async (c) => {
  const ws = wsId(c);
  if (isDemo(c)) await simulateDueDemoPosts(c.env, ws);
  const { results: counts } = await c.env.DB.prepare("SELECT status, COUNT(*) AS n FROM posts WHERE workspace_id = ? GROUP BY status")
    .bind(ws)
    .all<{ status: string; n: number }>();
  const { results: upcoming } = await c.env.DB.prepare(
    // Posts being published right now stay listed (first) until they have a result.
    "SELECT * FROM posts WHERE workspace_id = ? AND status IN ('publishing', 'scheduled') ORDER BY status = 'publishing' DESC, scheduled_at LIMIT 10",
  )
    .bind(ws)
    .all<PostRow>();
  const { results: recent } = await c.env.DB.prepare(
    "SELECT * FROM posts WHERE workspace_id = ? AND status IN ('published', 'failed', 'needs_check') ORDER BY updated_at DESC LIMIT 10",
  )
    .bind(ws)
    .all<PostRow>();
  const accounts = await c.env.DB.prepare(
    "SELECT COUNT(*) AS total, SUM(status = 'reconnect') AS reconnect FROM accounts WHERE workspace_id = ?",
  )
    .bind(ws)
    .first<{ total: number; reconnect: number }>();
  return c.json({
    counts: Object.fromEntries(counts.map((r) => [r.status, r.n])),
    upcoming: upcoming.map(postDto),
    recent: recent.map(postDto),
    accounts: { total: accounts?.total ?? 0, reconnect: accounts?.reconnect ?? 0 },
  });
});
