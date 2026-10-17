/**
 * Postflare's side of worker/billing/ (docs/hosted-spec.md "Host hooks"): the limit keys, their labels and counters.
 * Everything else in worker/billing/ is product-neutral; a port to Adsflare or Revflare rewrites this file, the
 * `PlanLimitKey` / `PlanLimits` / `BillingUsageDTO` types in shared/types.ts and the call sites of `enforce()`.
 *
 * Counters are one indexed COUNT/SUM each and only run when billing is on and the workspace is not exempt.
 */
import type { BillingUsageDTO, PlanLimitInfo, PlanLimitKey } from "../../shared/types";

/** The product's name in emails and provider checkouts. */
export const PRODUCT_NAME = "Postflare";

/** Where 402 answers and checkout returns send the user (the web app's Workspace settings → Billing tab). */
export const BILLING_PATH = "/workspace?tab=billing";

export const LIMITS: ReadonlyArray<PlanLimitInfo & { noun: string }> = [
  { key: "accounts", label: "Connected accounts", kind: "count", description: "Social accounts connected in the workspace (disabled ones don't count).", noun: "connected accounts" },
  { key: "posts_per_month", label: "Posts per month", kind: "count", description: "Posts created this UTC calendar month (one per account, drafts included).", noun: "posts this month" },
  { key: "x_posts_per_month", label: "X posts per month", kind: "count", description: "Posts to X created this month (the X API charges per post).", noun: "X posts this month" },
  { key: "members", label: "Members", kind: "count", description: "Workspace members plus pending invitations.", noun: "members (including pending invitations)" },
  { key: "storage_mb", label: "Media storage (MB)", kind: "count", description: "Size of the media library.", noun: "MB of media storage" },
  { key: "api", label: "API and MCP", kind: "boolean", description: "API keys, the CLI and MCP (AI agents).", noun: "API access" },
];

export const LIMIT_KEYS = LIMITS.map((l) => l.key);
export const limitInfo = (key: PlanLimitKey) => LIMITS.find((l) => l.key === key)!;

/** Start of the current UTC calendar month (ms). */
export function monthStart(t: number): number {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}

const MB = 1024 * 1024;

/**
 * Current usage of one limit key in a workspace (one query; `api` has no counter). storage_mb is reported in bytes
 * here (limits compare bytes against max * 1 MiB), the DTO rounds to MB.
 */
export async function countUsage(db: D1Database, workspaceId: string, key: PlanLimitKey, t: number): Promise<number> {
  const one = async (sql: string, ...binds: unknown[]) => (await db.prepare(sql).bind(...binds).first<{ n: number | null }>())?.n ?? 0;
  switch (key) {
    case "accounts":
      return one("SELECT COUNT(*) AS n FROM accounts WHERE workspace_id = ? AND status != 'disabled'", workspaceId);
    case "posts_per_month":
      return one("SELECT COUNT(*) AS n FROM posts WHERE workspace_id = ? AND created_at >= ?", workspaceId, monthStart(t));
    case "x_posts_per_month":
      return one(
        "SELECT COUNT(*) AS n FROM posts p JOIN accounts a ON a.id = p.account_id WHERE p.workspace_id = ? AND p.created_at >= ? AND a.provider = 'x'",
        workspaceId,
        monthStart(t),
      );
    case "members":
      return one(
        `SELECT (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?1)
           + (SELECT COUNT(*) FROM invitations WHERE workspace_id = ?1 AND accepted_at IS NULL AND expires_at > ?2) AS n`,
        workspaceId,
        t,
      );
    case "storage_mb":
      return one("SELECT COALESCE(SUM(size), 0) AS n FROM media WHERE workspace_id = ?", workspaceId);
    case "api":
      return 0;
  }
}

/** Amount of `adding` in the limit's unit (bytes for storage). */
export const limitMax = (key: PlanLimitKey, max: number) => (key === "storage_mb" ? max * MB : max);

/** Usage meters of GET /api/billing: one query. */
export async function usageSummary(db: D1Database, workspaceId: string, t: number): Promise<BillingUsageDTO> {
  const m = monthStart(t);
  const r = await db
      .prepare(
        `SELECT (SELECT COUNT(*) FROM accounts WHERE workspace_id = ?1 AND status != 'disabled') AS accounts,
           (SELECT COUNT(*) FROM posts WHERE workspace_id = ?1 AND created_at >= ?2) AS posts,
           (SELECT COUNT(*) FROM posts p JOIN accounts a ON a.id = p.account_id WHERE p.workspace_id = ?1 AND p.created_at >= ?2 AND a.provider = 'x') AS x_posts,
           (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = ?1)
             + (SELECT COUNT(*) FROM invitations WHERE workspace_id = ?1 AND accepted_at IS NULL AND expires_at > ?3) AS members,
           (SELECT COALESCE(SUM(size), 0) FROM media WHERE workspace_id = ?1) AS bytes`,
      )
      .bind(workspaceId, m, t)
      .first<{ accounts: number; posts: number; x_posts: number; members: number; bytes: number }>();
  return {
    accounts: r?.accounts ?? 0,
    postsThisMonth: r?.posts ?? 0,
    xPostsThisMonth: r?.x_posts ?? 0,
    members: r?.members ?? 0,
    storageMb: Math.round(((r?.bytes ?? 0) / MB) * 10) / 10,
  };
}

/** Starting plans for "Create suggested plans" (never seeded automatically). Prices in cents. */
export const SUGGESTED_PLANS = [
  {
    name: "Free",
    description: "Try Postflare with a few accounts.",
    features: ["3 connected accounts", "30 posts per month", "500 MB media storage"],
    limits: { accounts: 3, posts_per_month: 30, x_posts_per_month: 0, members: 1, storage_mb: 500, api: false },
    priceMonth: null,
    priceYear: null,
    isFree: true,
    position: 0,
  },
  {
    name: "Creator",
    description: "For creators and solo founders.",
    features: ["10 connected accounts", "300 posts per month", "50 X posts per month", "3 members", "5 GB media storage"],
    limits: { accounts: 10, posts_per_month: 300, x_posts_per_month: 50, members: 3, storage_mb: 5 * 1024, api: false },
    priceMonth: 1900,
    priceYear: 19000,
    isTrialDefault: true,
    highlight: true,
    position: 1,
  },
  {
    name: "Team",
    description: "For teams and agencies, with the API and MCP.",
    features: ["30 connected accounts", "1,500 posts per month", "300 X posts per month", "10 members", "20 GB media storage", "API, CLI and MCP"],
    limits: { accounts: 30, posts_per_month: 1500, x_posts_per_month: 300, members: 10, storage_mb: 20 * 1024, api: true },
    priceMonth: 4900,
    priceYear: 49000,
    position: 2,
  },
] as const;
