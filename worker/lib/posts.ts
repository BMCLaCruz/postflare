import type { PostDTO, PostLogDTO, ThreadItem } from "../../shared/types";
import { now, parseJson } from "./util";

export interface PostRow {
  id: string;
  group_id: string;
  account_id: string;
  status: PostDTO["status"];
  scheduled_at: number | null;
  content: string;
  media: string;
  settings: string;
  thread: string;
  external_id: string | null;
  external_url: string | null;
  error: string | null;
  attempts: number;
  workflow_id: string | null;
  revision: number;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  workspace_id: string | null;
  created_by: string | null;
  external_data?: string | null;
  metrics?: string | null;
  metrics_at?: number | null;
  metrics_next_at?: number | null;
  metrics_fails?: number;
}

export function postDto(row: PostRow): PostDTO {
  return {
    id: row.id,
    groupId: row.group_id,
    accountId: row.account_id,
    status: row.status,
    scheduledAt: row.scheduled_at,
    content: row.content,
    media: parseJson<string[]>(row.media, []),
    settings: parseJson<Record<string, unknown>>(row.settings, {}),
    thread: parseJson<ThreadItem[]>(row.thread, []),
    externalId: row.external_id,
    externalUrl: row.external_url,
    error: row.error,
    attempts: row.attempts,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

export async function logPost(env: Env, postId: string, level: PostLogDTO["level"], message: string) {
  await env.DB.prepare("INSERT INTO post_logs (post_id, level, message, created_at) VALUES (?, ?, ?, ?)")
    .bind(postId, level, message.slice(0, 2000), now())
    .run();
}

/** Unscoped: only for workflows and cron. Request handlers use `findPost`. */
export async function getPostRow(env: Env, id: string): Promise<PostRow | null> {
  return env.DB.prepare("SELECT * FROM posts WHERE id = ?").bind(id).first<PostRow>();
}

/** A post of the given workspace (null for unknown ids and posts of other workspaces). */
export async function findPost(env: Env, workspaceId: string, id: string): Promise<PostRow | null> {
  return env.DB.prepare("SELECT * FROM posts WHERE id = ? AND workspace_id = ?").bind(id, workspaceId).first<PostRow>();
}

/** Start (or restart) the publishing workflow of a scheduled post. */
export async function startWorkflow(env: Env, row: Pick<PostRow, "id" | "revision" | "workflow_id">): Promise<void> {
  if (row.workflow_id) await terminateWorkflow(env, row.workflow_id);
  const instanceId = `${row.id}-${row.revision}`;
  try {
    await env.PUBLISH_WORKFLOW.create({ id: instanceId, params: { postId: row.id, revision: row.revision } });
  } catch (err) {
    // Already exists (e.g. a retry of this request) — keep the existing instance.
    if (!/already exists/i.test(String(err))) throw err;
  }
  await env.DB.prepare("UPDATE posts SET workflow_id = ? WHERE id = ?").bind(instanceId, row.id).run();
}

export async function terminateWorkflow(env: Env, instanceId: string): Promise<void> {
  try {
    const instance = await env.PUBLISH_WORKFLOW.get(instanceId);
    const { status } = await instance.status();
    if (status === "queued" || status === "running" || status === "waiting" || status === "paused") await instance.terminate();
  } catch {
    // Unknown instance or already finished: nothing to stop. The workflow re-checks the revision anyway.
  }
}

/** Posts of demo workspaces have no workflow: lib/demo.ts simulates them. */
const NOT_DEMO = "(workspace_id IS NULL OR workspace_id NOT IN (SELECT id FROM workspaces WHERE is_demo = 1))";

/** Cron safety net: re-arm scheduled posts whose workflow vanished or errored. */
export async function sweepScheduledPosts(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, revision, workflow_id FROM posts WHERE status = 'scheduled' AND scheduled_at < ? AND ${NOT_DEMO} LIMIT 50`,
  )
    .bind(now() - 5 * 60 * 1000)
    .all<Pick<PostRow, "id" | "revision" | "workflow_id">>();
  for (const row of results) {
    let healthy = false;
    if (row.workflow_id) {
      try {
        const { status } = await (await env.PUBLISH_WORKFLOW.get(row.workflow_id)).status();
        healthy = status === "queued" || status === "running" || status === "waiting";
      } catch {}
    }
    if (healthy) continue;
    // Guarded: skip if the post was edited or claimed since we read it.
    const res = await env.DB.prepare(
      "UPDATE posts SET revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND status = 'scheduled'",
    )
      .bind(now(), row.id, row.revision)
      .run();
    if (!res.meta.changes) continue;
    await logPost(env, row.id, "warn", "Publishing job was missing; restarted it");
    await startWorkflow(env, { ...row, revision: row.revision + 1 });
  }
}

/**
 * Cron: a post stuck in "publishing" whose workflow is no longer alive (errored, terminated, gone) is marked
 * failed. It is not retried automatically because it may already be live on the platform.
 */
export async function recoverStuckPosts(env: Env): Promise<void> {
  const { results } = await env.DB.prepare(
    `SELECT id, revision, workflow_id FROM posts WHERE status = 'publishing' AND updated_at < ? AND ${NOT_DEMO} LIMIT 50`,
  )
    .bind(now() - 30 * 60 * 1000)
    .all<Pick<PostRow, "id" | "revision" | "workflow_id">>();
  for (const row of results) {
    let alive = false;
    if (row.workflow_id) {
      try {
        const { status } = await (await env.PUBLISH_WORKFLOW.get(row.workflow_id)).status();
        alive = status === "queued" || status === "running" || status === "waiting" || status === "paused";
      } catch {}
    }
    if (alive) continue;
    const message = "Publishing was interrupted. Check the platform before retrying: the post may already be live.";
    const res = await env.DB.prepare(
      "UPDATE posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ? AND revision = ? AND status = 'publishing'",
    )
      .bind(message, now(), row.id, row.revision)
      .run();
    if (res.meta.changes) await logPost(env, row.id, "error", message);
  }
}
