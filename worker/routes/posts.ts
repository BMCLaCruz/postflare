import { Hono } from "hono";
import type { CreatePostsInput, ThreadItem } from "../../shared/types";
import type { Context } from "hono";
import { requirePermission, wsId, type AppEnv } from "../lib/auth";
import { findAccount } from "../lib/accounts";
import { DEMO_POSTS_PER_DAY, demoPostsLeft, queueDemoPublish, simulateDueDemoPosts } from "../lib/demo";
import type { MediaRow } from "../lib/media";
import { findPost, logPost, postDto, startWorkflow, terminateWorkflow, type PostRow } from "../lib/posts";
import { newId, now, parseJson } from "../lib/util";
import { validatePost } from "../lib/validate";
import { getProvider } from "../providers/registry";

export const postRoutes = new Hono<AppEnv>();

type Draft = { accountId: string; content: string; media: string[]; settings: Record<string, unknown>; thread: ThreadItem[] };

/** Media of the workspace, in order. Throws for ids that are unknown or belong to another workspace. */
async function mediaRows(env: Env, workspaceId: string, ids: string[]): Promise<MediaRow[]> {
  if (!ids.length) return [];
  const { results } = await env.DB.prepare(`SELECT * FROM media WHERE workspace_id = ? AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(workspaceId, ...ids)
    .all<MediaRow>();
  const byId = new Map(results.map((r) => [r.id, r]));
  return ids.map((id) => {
    const row = byId.get(id);
    if (!row) throw new Error(`Media ${id} not found`);
    return row;
  });
}

/** Validate a draft against its account's provider. Returns errors (empty when valid). */
async function check(env: Env, workspaceId: string, d: Draft, strict: boolean): Promise<string[]> {
  const account = await findAccount(env, workspaceId, d.accountId);
  if (!account) return [`Account ${d.accountId} not found`];
  const provider = getProvider(account.provider);
  if (!provider) return [`Unknown provider ${account.provider}`];
  try {
    // Drafts are not validated against the platform, but their media must belong to this workspace.
    const media = await mediaRows(env, workspaceId, d.media);
    const thread = await Promise.all(d.thread.map(async (t) => ({ ...t, mediaRows: await mediaRows(env, workspaceId, t.media) })));
    if (!strict) return [];
    if (account.status === "disabled") return [`${account.name} is disabled`];
    return validatePost(provider, { content: d.content, media, settings: d.settings, thread }).map((e) => `${account.name}: ${e}`);
  } catch (err) {
    return [(err as Error).message];
  }
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
  const errors = (await Promise.all((body.posts ?? []).map((p) => check(c.env, wsId(c), normalize(p), true)))).flat();
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
  const errors = (await Promise.all(drafts.map((d) => check(c.env, workspaceId, d, status !== "draft")))).flat();
  if (errors.length) return c.json({ error: errors.join("\n"), errors }, 400);
  if (isDemo(c) && (await demoPostsLeft(c.env, workspaceId)) < drafts.length) {
    return c.json(
      { error: `The live demo has reached today's limit of ${DEMO_POSTS_PER_DAY} new posts. It resets daily: come back tomorrow, or deploy your own Postflare.` },
      429,
    );
  }

  const groupId = newId("grp_");
  const t = now();
  const rows: PostRow[] = drafts.map((d) => ({
    id: newId("pst_"),
    group_id: groupId,
    account_id: d.accountId,
    status,
    scheduled_at: at,
    content: d.content,
    media: JSON.stringify(d.media),
    settings: JSON.stringify(d.settings),
    thread: JSON.stringify(d.thread),
    external_id: null,
    external_url: null,
    error: null,
    attempts: 0,
    workflow_id: null,
    revision: 0,
    created_at: t,
    updated_at: t,
    published_at: null,
    workspace_id: workspaceId,
    created_by: c.var.user.id,
  }));
  await c.env.DB.batch(
    rows.map((r) =>
      c.env.DB.prepare(
        `INSERT INTO posts (id, group_id, account_id, status, scheduled_at, content, media, settings, thread, attempts, revision, created_at, updated_at, workspace_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)`,
      ).bind(r.id, r.group_id, r.account_id, r.status, r.scheduled_at, r.content, r.media, r.settings, r.thread, t, t, workspaceId, c.var.user.id),
    ),
  );
  if (status === "scheduled") {
    const message = body.scheduledAt === "now" ? "Queued for immediate publishing" : `Scheduled for ${new Date(at!).toISOString()}`;
    if (isDemo(c)) {
      for (const r of rows) await logPost(c.env, r.id, "info", message);
      if (isImmediate(at)) await demoPublish(c, rows.map((r) => r.id));
    } else {
      for (const r of rows) {
        await startWorkflow(c.env, r);
        await logPost(c.env, r.id, "info", message);
      }
    }
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
  const body = await c.req.json<Partial<Draft> & { scheduledAt?: CreatePostsInput["scheduledAt"] }>();
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
  const errors = await check(c.env, wsId(c), draft, sched.status === "scheduled");
  if (errors.length) return c.json({ error: errors.join("\n"), errors }, 400);

  // Guarded on the revision/status we read: if the workflow claimed the post meanwhile, it is publishing and must
  // not be rescheduled (that would publish it twice). Bump first, then stop the old workflow: its claim now fails.
  const revision = row.revision + 1;
  const res = await c.env.DB.prepare(
    `UPDATE posts SET content = ?, media = ?, settings = ?, thread = ?, status = ?, scheduled_at = ?, error = NULL,
       revision = ?, workflow_id = NULL, updated_at = ? WHERE id = ? AND workspace_id = ? AND revision = ? AND status = ?`,
  )
    .bind(draft.content, JSON.stringify(draft.media), JSON.stringify(draft.settings), JSON.stringify(draft.thread), sched.status, sched.at, revision, now(), row.id, wsId(c), row.revision, row.status)
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
    "SELECT * FROM posts WHERE workspace_id = ? AND status = 'scheduled' ORDER BY scheduled_at LIMIT 10",
  )
    .bind(ws)
    .all<PostRow>();
  const { results: recent } = await c.env.DB.prepare(
    "SELECT * FROM posts WHERE workspace_id = ? AND status IN ('published', 'failed') ORDER BY updated_at DESC LIMIT 10",
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
