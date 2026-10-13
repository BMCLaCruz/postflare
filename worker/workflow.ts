import { WorkflowEntrypoint, type WorkflowEvent, type WorkflowStep, type WorkflowStepConfig } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";
import { freshAccount, getAccountRow, markReconnect, providerContext } from "./lib/accounts";
import { isDemoPost, publishDemoPosts } from "./lib/demo";
import { loadMediaItems } from "./lib/media";
import { nextCheckpoint } from "./lib/metrics";
import { ensureSchema } from "./lib/migrate";
import { getPostRow, logPost, type PostRow } from "./lib/posts";
import { baseUrl } from "./lib/settings";
import { errorMessage, now, parseJson } from "./lib/util";
import { ProviderError } from "./providers/errors";
import { getProvider } from "./providers/registry";
import type { PublishPost, PublishResult } from "./providers/types";
import type { ThreadItem } from "../shared/types";

export interface PublishParams {
  postId: string;
  revision: number;
}

type Done = { externalId: string; url: string | null; data: Record<string, unknown> };

const MAX_STATUS_CHECKS = 120;

export class PublishWorkflow extends WorkflowEntrypoint<Env, PublishParams> {
  async run(event: WorkflowEvent<PublishParams>, step: WorkflowStep) {
    const { postId, revision } = event.payload;
    await ensureSchema(this.env.DB);
    // step.do's Serializable<T> typing rejects Record<string, unknown>; our values are plain JSON.
    const run = <T>(name: string, config: WorkflowStepConfig, fn: () => Promise<T>) =>
      step.do(name, config, fn as () => Promise<any>) as Promise<T>;

    const scheduledAt = await step.do("load", async () => {
      const row = await getPostRow(this.env, postId);
      if (!row || row.revision !== revision || row.status !== "scheduled") return null;
      return row.scheduled_at ?? now();
    });
    if (scheduledAt === null) return { skipped: true };

    if (scheduledAt > Date.now()) await step.sleepUntil("wait for schedule", new Date(scheduledAt));

    const claimed = await step.do("claim", async () => {
      const res = await this.env.DB.prepare(
        "UPDATE posts SET status = 'publishing', attempts = attempts + 1, error = NULL, updated_at = ? WHERE id = ? AND revision = ? AND status = 'scheduled'",
      )
        .bind(now(), postId, revision)
        .run();
      if (res.meta.changes > 0) return true;
      // Step retried after its UPDATE already committed: only this instance can claim this revision.
      const row = await getPostRow(this.env, postId);
      return !!row && row.revision === revision && row.status === "publishing";
    });
    if (!claimed) return { skipped: true };

    // Demo workspace (sandboxed): simulate, never call the platform. Demo posts normally get no workflow at all.
    const demo = await step.do("sandbox check", async () => isDemoPost(this.env.DB, postId));
    if (demo) {
      await step.sleep("simulated publish", "2 seconds");
      await step.do("simulate publish", async () => {
        await publishDemoPosts(this.env, [postId]);
      });
      return { published: true, simulated: true };
    }

    let root: Done;
    try {
      let result: PublishResult = await run(
        "publish",
        { retries: { limit: 3, delay: "30 seconds", backoff: "exponential" }, timeout: "15 minutes" },
        () => this.attempt(postId, async (ctx) => ctx.provider.publish(ctx.pctx, ctx.account, ctx.post)),
      );
      for (let i = 0; result.status === "pending"; i++) {
        if (i >= MAX_STATUS_CHECKS) throw new Error("The platform did not finish processing the post in time");
        await step.sleep(`processing ${i + 1}`, `${Math.min(Math.max(result.retryAfterSeconds ?? 10, 5), 600)} seconds`);
        const state = result.state;
        result = await run(
          `check status ${i + 1}`,
          { retries: { limit: 3, delay: "20 seconds", backoff: "exponential" }, timeout: "5 minutes" },
          () =>
            this.attempt(postId, async (ctx) => {
              if (!ctx.provider.checkStatus) throw new NonRetryableError("Provider returned pending without checkStatus");
              return ctx.provider.checkStatus(ctx.pctx, ctx.account, state);
            }),
        );
      }
      root = { externalId: result.externalId, url: result.url ?? null, data: result.data ?? {} };
    } catch (err) {
      await step.do("mark failed", async () => {
        const message = errorMessage(err);
        await this.env.DB.prepare("UPDATE posts SET status = 'failed', error = ?, updated_at = ? WHERE id = ?")
          .bind(message.slice(0, 2000), now(), postId)
          .run();
        await logPost(this.env, postId, "error", `Publishing failed: ${message}`);
      });
      return { failed: true };
    }

    await step.do("mark published", async () => {
      await this.env.DB.prepare(
        // Analytics start an hour after publishing (lib/metrics.ts); `external_data` is passed to postMetrics.
        "UPDATE posts SET status = 'published', external_id = ?, external_url = ?, external_data = ?, published_at = ?, updated_at = ?, metrics_next_at = ?, metrics_fails = 0 WHERE id = ?",
      )
        .bind(root.externalId, root.url, Object.keys(root.data).length ? JSON.stringify(root.data) : null, now(), now(), nextCheckpoint(now(), now()), postId)
        .run();
      await logPost(this.env, postId, "info", `Published${root.url ? `: ${root.url}` : ` (id ${root.externalId})`}`);
    });

    const thread = await step.do("load thread", async () => {
      const row = await getPostRow(this.env, postId);
      return parseJson<ThreadItem[]>(row?.thread, []).filter((t) => t.content.trim() || t.media.length);
    });
    let parent = root;
    for (let i = 0; i < thread.length; i++) {
      try {
        parent = await run(
          `reply ${i + 1}`,
          { retries: { limit: 2, delay: "30 seconds", backoff: "exponential" }, timeout: "10 minutes" },
          () =>
            this.attempt(postId, async (ctx) => {
              if (!ctx.provider.reply) throw new NonRetryableError(`${ctx.provider.name} does not support follow-ups`);
              const item: PublishPost = {
                id: `${postId}-r${i + 1}`,
                content: thread[i].content,
                media: await loadMediaItems(this.env, ctx.pctx.baseUrl, thread[i].media),
                settings: ctx.post.settings,
              };
              const r = await ctx.provider.reply(
                ctx.pctx,
                ctx.account,
                { rootId: root.externalId, parentId: parent.externalId, rootData: root.data, parentData: parent.data },
                item,
              );
              return { externalId: r.externalId, url: r.url ?? null, data: r.data ?? {} };
            }),
        );
      } catch (err) {
        await step.do(`reply ${i + 1} failed`, async () => {
          const message = `Follow-up ${i + 1} failed: ${errorMessage(err)}`;
          await this.env.DB.prepare("UPDATE posts SET error = ?, updated_at = ? WHERE id = ?").bind(message, now(), postId).run();
          await logPost(this.env, postId, "warn", message);
        });
        break;
      }
    }
    return { published: true, externalId: root.externalId };
  }

  /** Load everything a provider call needs, run it, and translate errors into retry semantics. */
  private async attempt<T extends PublishResult | Done>(
    postId: string,
    fn: (c: {
      provider: NonNullable<ReturnType<typeof getProvider>>;
      pctx: Awaited<ReturnType<typeof providerContext>>;
      account: Awaited<ReturnType<typeof freshAccount>>;
      post: PublishPost;
      row: PostRow;
    }) => Promise<T>,
  ): Promise<T> {
    const env = this.env;
    const row = await getPostRow(env, postId);
    if (!row) throw new NonRetryableError("Post was deleted");
    const accountRow = await getAccountRow(env, row.account_id);
    if (!accountRow) throw new NonRetryableError("Account was removed");
    if (await isDemoPost(env.DB, postId)) throw new NonRetryableError("Demo workspace: publishing is simulated, nothing is sent to the platform");
    if (accountRow.status === "disabled") throw new NonRetryableError("Account is disabled");
    const provider = getProvider(accountRow.provider);
    if (!provider) throw new NonRetryableError(`Unknown provider ${accountRow.provider}`);
    const pctx = await providerContext(env, provider, {
      log: (level, message) => void logPost(env, postId, level, message).catch(() => {}),
    });
    try {
      const account = await freshAccount(env, provider, pctx, accountRow);
      const post: PublishPost = {
        id: row.id,
        content: row.content,
        media: await loadMediaItems(env, await baseUrl(env), parseJson<string[]>(row.media, [])),
        settings: parseJson(row.settings, {}),
      };
      return await fn({ provider, pctx, account, post, row });
    } catch (err) {
      if (err instanceof NonRetryableError) throw err;
      const message = errorMessage(err);
      await logPost(env, postId, err instanceof ProviderError && err.retryable ? "warn" : "error", message).catch(() => {});
      if (err instanceof ProviderError) {
        if (err.kind === "auth") {
          await markReconnect(env, accountRow.id, message);
          throw new NonRetryableError(`Account needs to be reconnected: ${message}`);
        }
        if (!err.retryable) throw new NonRetryableError(message);
      }
      throw err;
    }
  }
}
