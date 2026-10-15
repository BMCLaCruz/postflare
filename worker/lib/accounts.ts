import type { AccountDTO } from "../../shared/types";
import { getProvider, providers, redirectUriFor } from "../providers/registry";
import { ProviderError } from "../providers/errors";
import type { AccountRecord, ConnectedAccount, CredentialsUpdate, Provider, ProviderContext } from "../providers/types";
import { decryptJson, encryptJson } from "./crypto";
import { mediaAccess } from "./media";
import { terminateWorkflow } from "./posts";
import { metricsStatusDto } from "./metrics";
import { baseUrl } from "./settings";
import { newId, now, parseJson } from "./util";

export interface AccountRow {
  id: string;
  provider: string;
  external_id: string;
  name: string;
  username: string | null;
  avatar_url: string | null;
  profile_url: string | null;
  credentials_enc: string;
  expires_at: number | null;
  meta: string;
  status: "active" | "disabled" | "reconnect";
  status_message: string | null;
  created_at: number;
  updated_at: number;
  workspace_id: string | null;
  created_by: string | null;
  metrics?: string | null;
  metrics_status?: string | null;
  metrics_message?: string | null;
  metrics_checked_at?: number | null;
  metrics_next_at?: number | null;
  metrics_fails?: number;
}

/**
 * External id as shown to API clients. A webhook's id is its full URL, which often is the credential itself
 * (Zapier/Make/n8n/Slack hook URLs): only its origin is shown, to every role that can list accounts.
 */
export function publicExternalId(provider: string, externalId: string): string {
  if (provider !== "webhook") return externalId;
  try {
    return `${new URL(externalId).origin}/…`;
  } catch {
    return "…";
  }
}

export function accountDto(row: AccountRow): AccountDTO {
  return {
    id: row.id,
    provider: row.provider,
    externalId: publicExternalId(row.provider, row.external_id),
    name: row.name,
    username: row.username,
    avatarUrl: row.avatar_url,
    profileUrl: row.profile_url,
    status: row.status,
    statusMessage: row.status_message,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    metricsStatus: metricsStatusDto(row),
  };
}

export async function getAppConfig(env: Env, provider: string): Promise<Record<string, string>> {
  const row = await env.DB.prepare("SELECT config_enc FROM platform_apps WHERE provider = ?")
    .bind(provider)
    .first<{ config_enc: string }>();
  return row ? await decryptJson<Record<string, string>>(env, row.config_enc) : {};
}

export async function providerContext(
  env: Env,
  provider: Provider,
  opts: { requestUrl?: string; log?: ProviderContext["log"] } = {},
): Promise<ProviderContext> {
  const base = await baseUrl(env, opts.requestUrl);
  return {
    env,
    fetch: (input, init) => fetch(input, init),
    app: await getAppConfig(env, provider.id),
    redirectUri: redirectUriFor(base, provider),
    baseUrl: base,
    media: mediaAccess(env),
    log: opts.log ?? ((level, message) => console[level === "info" ? "log" : level](`[${provider.id}] ${message}`)),
  };
}

export async function accountRecord(env: Env, row: AccountRow): Promise<AccountRecord> {
  return {
    id: row.id,
    provider: row.provider,
    externalId: row.external_id,
    name: row.name,
    username: row.username,
    credentials: await decryptJson(env, row.credentials_enc),
    expiresAt: row.expires_at,
    meta: parseJson(row.meta, {}),
  };
}

/** Unscoped: only for workflows and cron. Request handlers use `findAccount`. */
export async function getAccountRow(env: Env, id: string): Promise<AccountRow | null> {
  return env.DB.prepare("SELECT * FROM accounts WHERE id = ?").bind(id).first<AccountRow>();
}

/** An account of the given workspace (null for unknown ids and accounts of other workspaces). */
export async function findAccount(env: Env, workspaceId: string, id: string): Promise<AccountRow | null> {
  return env.DB.prepare("SELECT * FROM accounts WHERE id = ? AND workspace_id = ?").bind(id, workspaceId).first<AccountRow>();
}

/**
 * Remove accounts with everything tied to them: their scheduled workflows are stopped, then their posts, post logs,
 * post and account metrics and the account rows (tokens, profile data) are deleted. Unscoped: callers check access.
 * Used by "Remove" on the Accounts page and by the Meta data deletion callback. 2 D1 round trips whatever the count.
 */
export async function removeAccounts(env: Env, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const list = ids.map(() => "?").join(",");
  const { results } = await env.DB.prepare(
    `SELECT workflow_id FROM posts WHERE account_id IN (${list}) AND status = 'scheduled' AND workflow_id IS NOT NULL`,
  )
    .bind(...ids)
    .all<{ workflow_id: string }>();
  await Promise.all(results.map((r) => terminateWorkflow(env, r.workflow_id)));
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM post_logs WHERE post_id IN (SELECT id FROM posts WHERE account_id IN (${list}))`).bind(...ids),
    env.DB.prepare(`DELETE FROM post_metrics WHERE post_id IN (SELECT id FROM posts WHERE account_id IN (${list}))`).bind(...ids),
    env.DB.prepare(`DELETE FROM account_metrics WHERE account_id IN (${list})`).bind(...ids),
    env.DB.prepare(`DELETE FROM posts WHERE account_id IN (${list})`).bind(...ids),
    env.DB.prepare(`DELETE FROM accounts WHERE id IN (${list})`).bind(...ids),
  ]);
}

/** Thrown when a social account is already connected in another workspace (it is never moved silently). */
export class AccountElsewhereError extends Error {}

/**
 * Insert or update connected accounts (matching provider + external id) in a workspace. Returns their ids.
 * All-or-nothing: if any account is already connected in another workspace, nothing is saved.
 */
export async function saveConnectedAccounts(
  env: Env,
  providerId: string,
  accounts: ConnectedAccount[],
  owner: { workspaceId: string; userId: string },
): Promise<string[]> {
  const existing = new Map<string, { id: string; workspace_id: string | null }>();
  if (accounts.length) {
    const { results } = await env.DB.prepare(
      `SELECT id, external_id, workspace_id FROM accounts WHERE provider = ? AND external_id IN (${accounts.map(() => "?").join(",")})`,
    )
      .bind(providerId, ...accounts.map((a) => a.externalId))
      .all<{ id: string; external_id: string; workspace_id: string | null }>();
    for (const r of results) existing.set(r.external_id, r);
  }
  const elsewhere = accounts.filter((a) => {
    const e = existing.get(a.externalId);
    return e && e.workspace_id !== owner.workspaceId;
  });
  if (elsewhere.length) {
    const names = elsewhere.map((a) => (a.username ? `${a.name} (@${a.username})` : a.name)).join(", ");
    throw new AccountElsewhereError(
      `${names} ${elsewhere.length > 1 ? "are" : "is"} already connected in another workspace. Remove ${elsewhere.length > 1 ? "them" : "it"} there first.`,
    );
  }
  // One batch whatever the number of accounts (a Facebook login may return dozens of pages): D1 query budget.
  const ids: string[] = [];
  const statements: D1PreparedStatement[] = [];
  const t = now();
  for (const a of accounts) {
    const id = existing.get(a.externalId)?.id ?? newId("acc_");
    const enc = await encryptJson(env, a.credentials);
    statements.push(
      env.DB.prepare(
        `INSERT INTO accounts (id, provider, external_id, name, username, avatar_url, profile_url, credentials_enc, expires_at, refresh_expires_at, meta, status, status_message, created_at, updated_at, workspace_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET name = excluded.name, username = excluded.username, avatar_url = excluded.avatar_url,
           profile_url = excluded.profile_url, credentials_enc = excluded.credentials_enc, expires_at = excluded.expires_at,
           refresh_expires_at = excluded.refresh_expires_at, meta = excluded.meta, status = 'active', status_message = NULL, updated_at = excluded.updated_at,
           metrics_status = NULL, metrics_message = NULL, metrics_next_at = NULL, metrics_fails = 0
         WHERE accounts.workspace_id = excluded.workspace_id`,
      ).bind(
        id,
        providerId,
        a.externalId,
        a.name,
        a.username ?? null,
        a.avatarUrl ?? null,
        a.profileUrl ?? null,
        enc,
        a.expiresAt ?? null,
        a.refreshExpiresAt ?? null,
        JSON.stringify(a.meta ?? {}),
        t,
        t,
        owner.workspaceId,
        owner.userId,
      ),
    );
    ids.push(id);
  }
  if (statements.length) await env.DB.batch(statements);
  return ids;
}

async function applyUpdate(env: Env, account: AccountRecord, update: CredentialsUpdate): Promise<AccountRecord> {
  const merged: AccountRecord = {
    ...account,
    credentials: { ...account.credentials, ...update.credentials },
    expiresAt: update.expiresAt === undefined ? account.expiresAt : update.expiresAt,
    meta: update.meta ? { ...account.meta, ...update.meta } : account.meta,
  };
  const refreshExpires = update.refreshExpiresAt === undefined ? null : update.refreshExpiresAt;
  await env.DB.prepare(
    // Keep an account the user disabled disabled; a successful refresh only clears 'reconnect'.
    `UPDATE accounts SET credentials_enc = ?, expires_at = ?, meta = ?, ${update.refreshExpiresAt === undefined ? "" : "refresh_expires_at = ?, "}status = CASE WHEN status = 'disabled' THEN status ELSE 'active' END, status_message = CASE WHEN status = 'disabled' THEN status_message ELSE NULL END, updated_at = ? WHERE id = ?`,
  )
    .bind(
      ...[await encryptJson(env, merged.credentials), merged.expiresAt, JSON.stringify(merged.meta)],
      ...(update.refreshExpiresAt === undefined ? [] : [refreshExpires]),
      now(),
      account.id,
    )
    .run();
  return merged;
}

export async function markReconnect(env: Env, accountId: string, message: string) {
  await env.DB.prepare("UPDATE accounts SET status = 'reconnect', status_message = ?, updated_at = ? WHERE id = ?")
    .bind(message.slice(0, 500), now(), accountId)
    .run();
}

const REFRESH_MARGIN_MS = 10 * 60 * 1000;

/** Returns the account with fresh credentials, refreshing when the token expires soon (or `force`). */
export async function freshAccount(
  env: Env,
  provider: Provider,
  ctx: ProviderContext,
  row: AccountRow,
  opts: { force?: boolean; withinMs?: number } = {},
): Promise<AccountRecord> {
  const account = await accountRecord(env, row);
  if (!provider.refresh) return account;
  const due = account.expiresAt !== null && account.expiresAt - (opts.withinMs ?? REFRESH_MARGIN_MS) < now();
  if (!due && !opts.force) return account;
  try {
    return await applyUpdate(env, account, await provider.refresh(ctx, account));
  } catch (err) {
    if (err instanceof ProviderError && err.kind === "auth") {
      // A concurrent refresh (another workflow, cron) may have rotated the refresh token we just used: use its result.
      const latest = await getAccountRow(env, row.id);
      if (latest && latest.credentials_enc !== row.credentials_enc && latest.status !== "reconnect") {
        return accountRecord(env, latest);
      }
      await markReconnect(env, row.id, `Token refresh failed: ${err.message}`);
    }
    throw err;
  }
}

const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;
/** Cron refreshes access tokens expiring before the next 15-minute tick plus a margin (publishing refreshes on demand). */
export const REFRESH_WINDOW_MS = 45 * MINUTE;
/** Refresh credentials that expire themselves (refresh tokens, Instagram/Threads long-lived tokens) this early. */
export const REFRESH_TOKEN_WINDOW_MS = 7 * DAY;
/** ...at most this often per account (a refresh that does not extend the refresh token would repeat every tick). */
const REFRESH_TOKEN_RETRY_MS = 12 * 60 * MINUTE;
/**
 * Accounts refreshed per cron tick: about 1 fetch and 2 D1 queries each, so the tick stays within the Free plan's
 * 50 subrequests / 50 D1 queries next to analytics. The rest is handled by the next tick (oldest first).
 */
export const REFRESHES_PER_TICK = 5;

/**
 * Cron: keep idle accounts connected without refreshing every short-lived token on every tick. Refreshes, oldest
 * first and at most REFRESHES_PER_TICK:
 * - access tokens expiring within REFRESH_WINDOW_MS;
 * - accounts whose refresh credential (`refresh_expires_at`) expires within REFRESH_TOKEN_WINDOW_MS.
 * Publishing and analytics refresh on demand anyway (`freshAccount`). Returns the number of accounts tried.
 */
export async function refreshExpiringAccounts(env: Env, opts: { limit?: number } = {}): Promise<number> {
  const refreshable = providers.filter((p) => p.refresh).map((p) => p.id);
  const t = now();
  const { results } = await env.DB.prepare(
    // Demo workspaces hold fake tokens: never refresh them.
    `SELECT * FROM accounts WHERE status = 'active' AND provider IN (${refreshable.map(() => "?").join(",")})
       AND ((expires_at IS NOT NULL AND expires_at < ?) OR (refresh_expires_at IS NOT NULL AND refresh_expires_at < ? AND updated_at < ?))
       AND (workspace_id IS NULL OR workspace_id NOT IN (SELECT id FROM workspaces WHERE is_demo = 1))
     ORDER BY updated_at LIMIT ?`,
  )
    .bind(...refreshable, t + REFRESH_WINDOW_MS, t + REFRESH_TOKEN_WINDOW_MS, t - REFRESH_TOKEN_RETRY_MS, opts.limit ?? REFRESHES_PER_TICK)
    .all<AccountRow>();
  const contexts = new Map<string, Promise<ProviderContext>>();
  for (const row of results) {
    const provider = getProvider(row.provider);
    if (!provider?.refresh) continue;
    try {
      let ctx = contexts.get(provider.id);
      if (!ctx) contexts.set(provider.id, (ctx = providerContext(env, provider)));
      await freshAccount(env, provider, await ctx, row, { force: true });
    } catch (err) {
      console.error(`refresh ${row.provider}/${row.id} failed`, err);
      // Move it to the back of the queue so one failing account does not take every tick's slots.
      await env.DB.prepare("UPDATE accounts SET updated_at = ? WHERE id = ?").bind(now(), row.id).run().catch(() => {});
    }
  }
  return results.length;
}
