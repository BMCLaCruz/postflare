// Types shared by the worker and the web app.

export type FieldType =
  | "text"
  | "textarea"
  | "password"
  | "number"
  | "select"
  | "checkbox"
  | "url"
  | "tags"
  | "datetime";

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  placeholder?: string;
  help?: string;
  /** Static choices for `select`. */
  options?: FieldOption[];
  /** Choices are loaded per account from `GET /api/accounts/:id/options/:key`. */
  dynamicOptions?: boolean;
  default?: string | number | boolean | string[];
  maxLength?: number;
  /** Only show (and validate) the field when another field has a given value. */
  showIf?: { key: string; equals: string | boolean | number };
}

export type ProviderCategory = "social" | "video" | "community" | "blog" | "messaging" | "newsletter";

export interface ProviderCapabilities {
  /** Max characters of the main post text. */
  maxLength: number;
  text: "required" | "optional" | "none";
  media: {
    /** Max images per post (0 = images not supported). */
    images: number;
    /** Max videos per post (0 = videos not supported). */
    videos: number;
    /** Images and videos can be combined in one post. */
    mixed: boolean;
    /** At least one media item is required (Instagram, TikTok, YouTube, Pinterest...). */
    required: boolean;
  };
  /** Follow-up items are supported (reply chain or comments). */
  thread: boolean;
  /** UI label for follow-ups, e.g. "Thread replies" or "First comment". */
  threadLabel?: string;
}

/**
 * How far a provider is proven (README "Platform status"):
 * - verified: publishing confirmed against the live API with a real account.
 * - beta: built against the official API and covered by mocked tests, not yet confirmed with a live account.
 * - experimental: relies on an unofficial API; hidden until an instance admin enables experimental integrations.
 */
export type ProviderStatus = "verified" | "beta" | "experimental";

export interface ProviderInfo {
  id: string;
  name: string;
  /** Brand hex color without '#'. */
  color: string;
  /** simple-icons slug used for the logo, if any. */
  icon?: string;
  category: ProviderCategory;
  auth: "oauth2" | "credentials";
  /** Developer-app fields (client id / secret...) configured once per platform. Empty when none needed. */
  appFields: FieldDef[];
  /** Fields asked when connecting an account with `credentials` auth. */
  credentialFields: FieldDef[];
  /** Per-post settings. */
  settingsFields: FieldDef[];
  capabilities: ProviderCapabilities;
  /** Where to create the developer app. */
  docsUrl?: string;
  /** Markdown shown in the composer next to this platform's settings (legal notices, platform requirements). */
  composerNotice?: string;
  /** Markdown setup steps shown on the Platforms page. `{{redirectUri}}` and `{{baseUrl}}` are substituted. */
  setupNotes?: string;
  /** Which analytics the platform provides (both false when none). */
  analytics: ProviderAnalytics;
  status: ProviderStatus;
  /** Short qualifier of `status` (shown in tooltips and the README table). */
  statusNote?: string;
}

/**
 * `needs_check`: the request that creates the post failed in a way that does not tell whether the platform accepted
 * it (network error, timeout, 5xx after sending). It is never retried automatically; the user checks the profile and
 * resolves it (POST /api/posts/:id/resolve: mark as published, or retry anyway).
 */
export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled" | "needs_check";

export interface ThreadItem {
  content: string;
  media: string[];
}

// ---------------------------------------------------------------------------------------------------------------
// Analytics (worker/lib/metrics.ts, worker/routes/analytics.ts)

/** Normalized metric keys. Platforms fill the ones they offer; everything else goes into `extra`. */
export type MetricKey =
  | "impressions"
  | "reach"
  | "views"
  | "likes"
  | "comments"
  | "shares"
  | "saves"
  | "clicks"
  | "replies"
  | "reposts"
  | "quotes"
  | "followers"
  | "following"
  | "posts";

/** Metric values of a post or an account at one point in time. Missing key = the platform does not report it. */
export type MetricValues = Partial<Record<MetricKey, number>> & {
  /** Platform-specific numbers (e.g. Reddit upvote_ratio, YouTube favorites, Instagram profile_visits). */
  extra?: Record<string, number>;
};

/** The keys that count as engagements (interactions with a post). */
export const ENGAGEMENT_KEYS = ["likes", "comments", "shares", "saves", "replies", "reposts", "quotes", "clicks"] as const satisfies readonly MetricKey[];

/** likes + comments + shares + saves + replies + reposts + quotes + clicks (missing keys count as 0). */
export function engagements(m: MetricValues | null | undefined): number {
  if (!m) return 0;
  let n = 0;
  for (const k of ENGAGEMENT_KEYS) n += typeof m[k] === "number" ? m[k]! : 0;
  return n;
}

/**
 * What engagement rate is measured against: views, else impressions, else reach (null when the platform reports none
 * of them, e.g. Bluesky: such posts are left out of engagement rates).
 */
export function exposure(m: MetricValues | null | undefined): number | null {
  if (!m) return null;
  return m.views ?? m.impressions ?? m.reach ?? null;
}

/** ProviderInfo.analytics */
export interface ProviderAnalytics {
  /** Per-post metrics are collected. */
  post: boolean;
  /** Account metrics (followers...) are collected daily. */
  account: boolean;
  /** Keys the platform reports (post and account). */
  metrics: MetricKey[];
}

/**
 * Analytics collection state of an account (AccountDTO.metricsStatus). Independent of the publishing `status`: an
 * account can publish fine while analytics need a reconnect (the token predates the analytics permissions).
 * - pending: not collected yet. ok: last collection worked.
 * - reconnect_required: the token lacks the analytics permissions; reconnect the account to grant them.
 * - not_supported: the platform (or this account type) offers no analytics. error: the last collection failed.
 */
export type MetricsStatus = "pending" | "ok" | "reconnect_required" | "not_supported" | "error";

export interface AccountMetricsStatusDTO {
  status: MetricsStatus;
  message: string | null;
  /** Last collection attempt (ms). */
  checkedAt: number | null;
  /** Latest account metrics (followers...), null when none collected. */
  metrics: MetricValues | null;
}

export interface AccountDTO {
  id: string;
  provider: string;
  externalId: string;
  name: string;
  username: string | null;
  avatarUrl: string | null;
  profileUrl: string | null;
  status: "active" | "disabled" | "reconnect";
  statusMessage: string | null;
  expiresAt: number | null;
  createdAt: number;
  /** Analytics collection state. */
  metricsStatus: AccountMetricsStatusDTO;
}

export interface MediaDTO {
  id: string;
  filename: string;
  mime: string;
  size: number;
  kind: "image" | "video";
  width: number | null;
  height: number | null;
  duration: number | null;
  alt: string | null;
  url: string;
  createdAt: number;
}

export interface PostDTO {
  id: string;
  groupId: string;
  accountId: string;
  status: PostStatus;
  scheduledAt: number | null;
  content: string;
  media: string[];
  settings: Record<string, unknown>;
  thread: ThreadItem[];
  externalId: string | null;
  externalUrl: string | null;
  error: string | null;
  attempts: number;
  createdAt: number;
  updatedAt: number;
  publishedAt: number | null;
  /** Playbook the post was written with (built-in id or custom pbk_ id), its version and A/B variant label. */
  playbookId: string | null;
  playbookVersion: number | null;
  variant: string | null;
}

/** Body of POST /api/posts/:id/resolve (only for `needs_check` posts). */
export interface ResolvePostInput {
  /** true: it is live, mark it published (optionally with its URL). false: it is not live, publish it again now. */
  published: boolean;
  /** Link to the live post (published: true only). */
  url?: string | null;
}

/** GET /api/media/usage: bytes of stored media (ready and in-progress uploads). */
export interface MediaUsageDTO {
  workspace: { bytes: number; count: number };
  /** Whole instance, all workspaces: instance admins only. */
  instance: { bytes: number; count: number } | null;
  /** R2 Free plan storage (10 GB), for reference. */
  freeTierBytes: number;
  /** Instance setting: media older than this is removed when no longer needed; 0 = keep forever. */
  retentionDays: number;
}

export interface PostLogDTO {
  id: number;
  level: "info" | "warn" | "error";
  message: string;
  createdAt: number;
}

/** Body of POST /api/posts. One entry per target account; all share a group id. */
export interface CreatePostsInput {
  /** "now" publishes immediately, a ms timestamp or ISO date schedules, null saves drafts. */
  scheduledAt: number | string | null;
  posts: Array<{
    accountId: string;
    content: string;
    media?: string[];
    settings?: Record<string, unknown>;
    thread?: ThreadItem[];
  }>;
  /** Playbook the posts were written with (attribution for the playbook ranking). Built-in id, custom id or slug. */
  playbookId?: string | null;
  /** Version used (default: the latest). */
  playbookVersion?: number | null;
  /** A/B label, e.g. "A" or "short-hook" (at most 32 characters). */
  variant?: string | null;
}

// ---------------------------------------------------------------------------------------------------------------
// Users, workspaces and roles (docs/workspaces-spec.md)

export type InstancePermission =
  | "instance.platforms.manage"
  | "instance.users.manage"
  | "instance.settings.manage"
  | "instance.workspaces.create"
  | "instance.overview.view";

export type WorkspacePermission =
  | "workspace.manage"
  | "workspace.delete"
  | "members.manage"
  | "accounts.read"
  | "accounts.manage"
  | "posts.read"
  | "posts.write"
  | "media.read"
  | "media.write"
  | "playbooks.manage"
  | "apikeys.manage";

export type PermissionKey = InstancePermission | WorkspacePermission;

export type RoleScope = "instance" | "workspace";

/** GET /api/permissions: the permission catalog. */
export interface PermissionInfo {
  key: PermissionKey;
  scope: RoleScope;
  /** Short UI label, e.g. "Write posts". */
  label: string;
  description: string;
}

export interface RoleRef {
  id: string;
  name: string;
}

/** GET /api/roles */
export interface RoleDTO {
  id: string;
  scope: RoleScope;
  name: string;
  description: string | null;
  permissions: PermissionKey[];
  /** Built-in roles cannot be edited or deleted. */
  builtin: boolean;
  createdAt: number;
  /** Users (instance roles) or memberships (workspace roles) using this role. */
  assigned: number;
}

/** Body of POST /api/roles (PATCH takes the same fields minus `scope`, all optional). */
export interface RoleInput {
  scope: RoleScope;
  name: string;
  description?: string | null;
  permissions: PermissionKey[];
}

export type UserStatus = "active" | "disabled";

/** A workspace as seen by the current user (GET /api/me `workspaces`). */
export interface MeWorkspace {
  id: string;
  name: string;
  /** The user's membership role. Instance admins who are not members get Owner with `viaAdmin: true`. */
  role: RoleRef;
  /** Effective workspace permissions (all of them for instance admins). */
  permissions: WorkspacePermission[];
  /** Listed only because the user is an instance admin (not a member). */
  viaAdmin?: true;
  /** Sandboxed live-demo workspace: publishing is simulated, no accounts can be connected, no media uploaded. */
  demo?: true;
}

/** GET /api/me */
export interface MeDTO {
  /** `demo`: the shared live-demo visitor (read-only profile, no API keys, demo workspace only). */
  user: { id: string; name: string; email: string; role: RoleRef; demo?: true };
  instancePermissions: InstancePermission[];
  workspaces: MeWorkspace[];
  /** Workspace used for scoped requests without an `X-Workspace-Id` header; null when the user has none. */
  currentWorkspaceId: string | null;
}

/** GET /api/workspaces, POST /api/workspaces, PATCH /api/workspaces/:id */
export interface WorkspaceDTO extends MeWorkspace {
  createdAt: number;
  memberCount: number;
}

/** GET /api/workspaces/:id/members */
export interface MemberDTO {
  userId: string;
  name: string;
  email: string;
  status: UserStatus;
  role: RoleRef;
  joinedAt: number;
  lastLoginAt: number | null;
}

/** GET /api/users (instance admins) */
export interface UserDTO {
  id: string;
  name: string;
  email: string;
  status: UserStatus;
  role: RoleRef;
  workspaces: Array<{ id: string; name: string; role: RoleRef }>;
  createdAt: number;
  lastLoginAt: number | null;
}

/** Body of POST /api/invitations */
export interface CreateInvitationInput {
  /** Optional: when set, only this email can accept. */
  email?: string | null;
  /** Instance role of a new user (forced to Member for non-admins). */
  instanceRoleId: string;
  /** Existing workspace to join, or null/omitted to create a new workspace for the invitee (admins only). */
  workspaceId?: string | null;
  /** Required with `workspaceId`. */
  workspaceRoleId?: string | null;
  /** Name of the workspace created on acceptance when `workspaceId` is null. */
  newWorkspaceName?: string | null;
}

/** Response of POST /api/invitations. The url (with its token) is only returned here. */
export interface CreatedInvitationDTO {
  id: string;
  url: string;
  expiresAt: number;
}

/** GET /api/invitations (pending only) */
export interface InvitationDTO {
  id: string;
  email: string | null;
  instanceRole: RoleRef;
  workspaceId: string | null;
  workspaceName: string | null;
  workspaceRole: RoleRef | null;
  newWorkspaceName: string | null;
  invitedBy: { id: string; name: string } | null;
  createdAt: number;
  expiresAt: number;
}

/** GET /api/invitations/lookup/:token (public) */
export interface InvitationLookupDTO {
  email: string | null;
  /** Existing workspace the invitee joins (null when a new workspace is created). */
  workspaceName: string | null;
  workspaceRole: RoleRef | null;
  /** Workspace created for the invitee (null when joining an existing one). */
  newWorkspaceName: string | null;
  /** Name of the inviter. */
  invitedBy: string;
  expired: boolean;
  accepted: boolean;
}

/** Body of POST /api/invitations/accept (name/email/password ignored when a signed-in user accepts). */
export interface AcceptInvitationInput {
  token: string;
  name?: string;
  email?: string;
  password?: string;
}

/** GET /api/auth/status */
export interface AuthStatusDTO {
  setup: boolean;
  authenticated: boolean;
  /** Present (true) when the instance runs the public live demo (DEMO_MODE). */
  demo?: true;
  /** Present (true) before setup when the deployment has a SETUP_TOKEN secret: the setup form must send it. */
  setupToken?: true;
}

/** Body of POST /api/auth/setup */
export interface SetupInput {
  name: string;
  email: string;
  password: string;
  workspaceName?: string;
  /** Required when the deployment sets the SETUP_TOKEN secret. */
  setupToken?: string;
}

/** GET /api/keys: own keys in the current workspace (all keys of the workspace for instance admins). */
export interface ApiKeyDTO {
  id: string;
  name: string;
  prefix: string;
  createdAt: number;
  lastUsedAt: number | null;
  userId: string | null;
  userName: string | null;
}

/** Response of POST /api/keys (the token is only shown once). */
export interface CreatedApiKeyDTO {
  id: string;
  token: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Analytics API

/** Totals over a range of published posts. Engagement rate = engagements / exposure of the posts that report one. */
export interface AnalyticsTotals {
  /** Posts published in the range. */
  posts: number;
  /** Posts that have metrics. */
  postsWithMetrics: number;
  views: number;
  impressions: number;
  reach: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  /** engagements / exposure (views, else impressions, else reach) over posts reporting an exposure; null if none. */
  engagementRate: number | null;
  /** Sum of the latest follower counts of the accounts (at the end of the range). */
  followers: number | null;
  /** Followers at the end minus followers at the start of the range (accounts with both values). */
  followersChange: number | null;
}

export interface AnalyticsBreakdown extends AnalyticsTotals {
  /** Provider id (provider breakdown) or account id (account breakdown). */
  key: string;
  provider: string;
  /** Account breakdown only. */
  accountId?: string;
  name: string;
  username?: string | null;
}

/**
 * One day of the daily series (day = YYYY-MM-DD in `tz`). The latest metrics of each post count for the day it was
 * published on (not the days the views happened: platforms only report lifetime totals per post).
 */
export interface AnalyticsDay {
  day: string;
  /** Posts published that day. */
  posts: number;
  /** Exposure of those posts: views, else impressions, else reach (per post). */
  views: number;
  engagements: number;
}

export interface FollowerSeries {
  accountId: string;
  provider: string;
  name: string;
  /** One point per collected UTC day. */
  points: Array<{ day: string; followers: number }>;
}

/** GET /api/analytics/summary */
export interface AnalyticsSummaryDTO {
  from: number;
  to: number;
  tz: string;
  totals: AnalyticsTotals;
  /** The same totals for the period of equal length right before `from`. */
  previous: AnalyticsTotals;
  byProvider: AnalyticsBreakdown[];
  byAccount: AnalyticsBreakdown[];
  daily: AnalyticsDay[];
  followers: FollowerSeries[];
}

/** GET /api/analytics/posts item */
export interface AnalyticsPostDTO {
  id: string;
  groupId: string;
  accountId: string;
  provider: string;
  accountName: string;
  accountUsername: string | null;
  /** First 280 characters of the content. */
  excerpt: string;
  /** Media ids (thumbnails: /api/media/:id). */
  media: string[];
  externalId: string | null;
  externalUrl: string | null;
  publishedAt: number;
  /** Latest metrics, null when none collected yet. */
  metrics: MetricValues | null;
  metricsAt: number | null;
  /** Next scheduled collection, null when collection stopped (older than 90 days, or too many failures). */
  metricsNextAt: number | null;
  engagements: number;
  engagementRate: number | null;
}

/** GET /api/posts/:id/metrics */
export interface PostMetricsDTO {
  postId: string;
  publishedAt: number | null;
  metrics: MetricValues | null;
  metricsAt: number | null;
  metricsNextAt: number | null;
  snapshots: Array<{ capturedAt: number; metrics: MetricValues }>;
}

/** Body of POST /api/analytics/refresh: exactly one of them. */
export interface AnalyticsRefreshInput {
  postId?: string;
  accountId?: string;
}

/** Response of POST /api/analytics/refresh */
export interface AnalyticsRefreshDTO {
  /** postId refresh: the post with its updated metrics. */
  post?: AnalyticsPostDTO;
  /** accountId refresh: the account's analytics state, and how many of its posts were refreshed. */
  account?: { id: string; metricsStatus: AccountMetricsStatusDTO; postsRefreshed: number };
}

/** GET /api/version (public). `apiVersion` changes only on breaking REST API changes. */
export interface VersionDTO {
  version: string;
  commit: string;
  apiVersion: number;
}

/** GET /api/updates (instance admins): the running version and the newest server release on GitHub. */
export interface UpdateStatusDTO {
  current: string;
  commit: string;
  latest: string | null;
  updateAvailable: boolean;
  /** Release notes of `latest`. */
  url: string | null;
  publishedAt: number | null;
  checkedAt: number | null;
  /** Last check failed (rate limit, network...); `latest` is then the last known value. */
  error: string | null;
  /** False with UPDATE_CHECK="false". */
  enabled: boolean;
  /** GitHub repository checked (owner/name, UPDATE_REPO). */
  repo: string;
}

// ---------------------------------------------------------------------------------------------------------------
// Admin → Overview (GET /api/admin/overview?days=30, permission instance.overview.view). Days are UTC.

export type QuotaLevel = "ok" | "warning" | "critical";

export interface AdminQuotaDTO {
  key: "workflow_steps" | "d1_rows_written" | "r2_storage" | "images_transformations";
  label: string;
  /** Measured or estimated usage (see `estimate`). */
  used: number;
  /** Projection to the end of the period (e.g. steps incl. posts still scheduled today), when meaningful. */
  projected: number | null;
  limit: number;
  unit: "count" | "bytes";
  /** "day" (UTC), "month" (UTC calendar month) or "total" (storage). */
  period: "day" | "month" | "total";
  /** True when the figure is derived from counts × typical costs rather than measured. */
  estimate: boolean;
  /** ok < 70 % ≤ warning < 90 % ≤ critical (of the larger of used / projected). */
  level: QuotaLevel;
  note: string;
}

export interface AdminProviderStatsDTO {
  provider: string;
  /** Posts published in the range (posts table). */
  published: number;
  /** Posts currently failed or needing a check (posts table, opened in the range). */
  failed: number;
  /** Publish attempts in the range (usage_events): outcomes. */
  attempts: { published: number; failed: number; needsCheck: number };
  /** published / all attempts (usage_events), null without attempts. */
  successRate: number | null;
  /** Attempts whose text had a URL (X bills these ~13x). */
  withUrl: number;
}

export interface AdminWorkspaceRowDTO {
  id: string;
  name: string;
  isDemo: boolean;
  members: number;
  accounts: number;
  apiKeys: number;
  /** Published in the range. */
  published: number;
  publishedAllTime: number;
  scheduled: number;
  failed: number;
  needsCheck: number;
  storageBytes: number;
  createdAt: number;
  /** Latest post change (null without posts). */
  lastActivity: number | null;
}

export interface AdminCronDTO {
  name: "frequent" | "metrics" | "daily";
  schedule: string;
  lastRunAt: number | null;
  durationMs: number | null;
  /** No run for more than twice the interval. */
  stale: boolean;
}

export interface AdminOverviewDTO {
  generatedAt: number;
  range: { days: number; from: number; to: number };
  counts: {
    /** Excluding demo workspaces. */
    workspaces: number;
    demoWorkspaces: number;
    users: { active: number; disabled: number; demo: number };
    apiKeys: number;
    accounts: { total: number; byStatus: { active: number; reconnect: number; disabled: number }; byProvider: Array<{ provider: string; active: number; reconnect: number; disabled: number }> };
  };
  /** Non-demo workspaces. */
  posts: {
    publishedAllTime: number;
    publishedToday: number;
    published7d: number;
    publishedRange: number;
    /** Still scheduled for today (UTC), overdue ones included. */
    scheduledToday: number;
    scheduledNext24h: number;
    failed: number;
    needsCheck: number;
    drafts: number;
    publishing: number;
    /** One entry per day of the range: published (posts) and failed attempts (usage_events: failed + needs_check). */
    daily: Array<{ day: string; published: number; failed: number }>;
    byProvider: AdminProviderStatsDTO[];
    topWorkspaces: Array<{ id: string; name: string; published: number }>;
  };
  /** The demo workspace(s), apart from the totals above. */
  demo: { enabled: boolean; publishedRange: number; publishedToday: number; scheduled: number };
  health: {
    lastErrors: Array<{ provider: string | null; workspaceId: string | null; workspaceName: string | null; postId: string | null; kind: string; outcome: string; message: string | null; at: number }>;
  };
  quotas: AdminQuotaDTO[];
  system: {
    update: UpdateStatusDTO;
    crons: AdminCronDTO[];
    demoMode: boolean;
    mediaRetentionDays: number;
    experimentalIntegrations: boolean;
    /** Usage metering keeps this many days. */
    usageRetentionDays: number;
    /** First day with usage_events (metering started), null when empty. */
    meteringSince: string | null;
  };
  workspaces: AdminWorkspaceRowDTO[];
}

// ---------------------------------------------------------------------------------------------------------------
// Playbooks (worker/lib/playbooks.ts, shared/playbooks.ts)

export type PlaybookGoal = "engagement" | "reach" | "clicks" | "followers" | "conversions";
export type PlaybookFormat = "text" | "thread" | "image" | "carousel" | "video";

/** A playbook in lists and searches (no body). */
export interface PlaybookSummaryDTO {
  /** Built-in: its kebab id (e.g. "launch-announcement"). Custom: pbk_... */
  id: string;
  /** Kebab-case handle (built-ins: the id). */
  slug: string;
  /** Latest version. */
  version: number;
  name: string;
  summary: string;
  goal: PlaybookGoal;
  /** Provider ids and groups (short-video, microblog, professional, visual, all). */
  platforms: string[];
  formats: PlaybookFormat[];
  tags: string[];
  /** What the writer must know (or ask) before writing. */
  inputs: string[];
  builtin: boolean;
  /** Custom playbooks duplicated from a built-in: "<id>@<version>". */
  basedOn: string | null;
  archived: boolean;
  updatedAt: number | null;
  /** Search relevance (GET /api/playbooks?q=). */
  score?: number;
}

/** GET /api/playbooks/:id */
export interface PlaybookDTO extends PlaybookSummaryDTO {
  /** The version returned (latest unless ?version=). */
  version: number;
  latestVersion: number;
  /** Every version that can be fetched with ?version= (built-ins: only the bundled one). */
  versions: number[];
  /** Markdown body (When to use, Structure, Platform notes, Hooks, Examples, Avoid, Checklist). */
  body: string;
  /** The playbook as a Markdown file with frontmatter (duplicate, export, `pf playbooks show`). */
  markdown: string;
  /** Items of the Checklist section. */
  checklist: string[];
  /** Ready-to-use prompt for an AI agent: the playbook, this workspace's target accounts and limits, attribution. */
  prompt: string;
}

/** Body of POST /api/playbooks and PATCH /api/playbooks/:id (PATCH: every field optional). Or `markdown` with frontmatter. */
export interface PlaybookInput {
  slug?: string;
  name?: string;
  summary?: string;
  goal?: PlaybookGoal;
  platforms?: string[];
  formats?: PlaybookFormat[];
  tags?: string[];
  inputs?: string[];
  body?: string;
  /** A whole playbook file (frontmatter + body); its fields are used when the others are absent. */
  markdown?: string;
}

/** insufficient: < 5 posts, low: 5–19, ok: ≥ 20. */
export type PlaybookConfidence = "insufficient" | "low" | "ok";

/** One row of the playbook ranking (a playbook, one of its versions or variants, or the no-playbook baseline). */
export interface PlaybookStatsRow {
  /** null: posts without a playbook. */
  playbookId: string | null;
  name: string;
  builtin: boolean;
  /** Version rows only. */
  version?: number | null;
  /** Variant rows only (null = posts of the playbook without a variant label). */
  variant?: string | null;
  /** Published posts with metrics in the range. */
  posts: number;
  accounts: number;
  /** Median / mean engagement rate (engagements ÷ views, else impressions, else reach) of posts that report an exposure. */
  medianEngagementRate: number | null;
  meanEngagementRate: number | null;
  /** Median exposure (views, else impressions, else reach). */
  medianViews: number | null;
  /**
   * Median of (post metric ÷ the same account's baseline median) − 1: 0.25 = 25 % above the account's usual.
   * Metric: engagement rate (engagements for accounts whose platform reports no exposure).
   */
  lift: number | null;
  /** Posts that have a lift value (account baseline available). */
  liftPosts: number;
  confidence: PlaybookConfidence;
}

/** GET /api/playbooks/stats */
export interface PlaybookStatsDTO {
  from: number;
  to: number;
  days: number;
  platform: string | null;
  accountId: string | null;
  /** Published posts with metrics that were analyzed. */
  postsAnalyzed: number;
  /** True when the range had more posts than the cap (the most recent ones were analyzed). */
  capped: boolean;
  /** Posts without a playbook. */
  baseline: PlaybookStatsRow;
  /** Best first (rows with enough posts before insufficient ones, then by lift). */
  playbooks: Array<PlaybookStatsRow & { versions: PlaybookStatsRow[]; variants: PlaybookStatsRow[] }>;
  /** How the numbers are computed (shown as a disclaimer: correlation, not causation). */
  method: string;
}
