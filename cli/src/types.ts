// API shapes used by the CLI (subset of the repo's shared/types.ts, copied so the package builds on its own).

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "textarea" | "password" | "number" | "select" | "checkbox" | "url" | "tags" | "datetime";
  required?: boolean;
  placeholder?: string;
  help?: string;
  options?: FieldOption[];
  dynamicOptions?: boolean;
  default?: string | number | boolean | string[];
  maxLength?: number;
  showIf?: { key: string; equals: string | boolean | number };
}

export interface ProviderCapabilities {
  maxLength: number;
  text: "required" | "optional" | "none";
  media: { images: number; videos: number; mixed: boolean; required: boolean };
  thread: boolean;
  threadLabel?: string;
}

export interface ProviderInfo {
  id: string;
  name: string;
  category: string;
  auth: "oauth2" | "credentials";
  settingsFields: FieldDef[];
  capabilities: ProviderCapabilities;
  composerNotice?: string;
  docsUrl?: string;
  configured?: boolean;
  /** Server >= the platform-status release; older servers omit it. */
  status?: "verified" | "beta" | "experimental";
  statusNote?: string;
  /** false: an experimental platform that is turned off on the instance (new connections refused). */
  enabled?: boolean;
  analytics?: { post: boolean; account: boolean; metrics: string[] };
}

export type MetricValues = Partial<Record<string, number>> & { extra?: Record<string, number> };

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
  metricsStatus?: { status: string; message: string | null; checkedAt: number | null; metrics: MetricValues | null };
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

export type PostStatus = "draft" | "scheduled" | "publishing" | "published" | "failed" | "cancelled";

export interface ThreadItem {
  content: string;
  media: string[];
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
  logs?: Array<{ id: number; level: string; message: string; createdAt: number }>;
}

export interface CreatePostsInput {
  scheduledAt: number | "now" | null;
  posts: Array<{ accountId: string; content: string; media: string[]; settings: Record<string, unknown>; thread: ThreadItem[] }>;
}

export interface AnalyticsTotals {
  posts: number;
  postsWithMetrics: number;
  views: number;
  impressions: number;
  reach: number;
  engagements: number;
  likes: number;
  comments: number;
  shares: number;
  engagementRate: number | null;
  followers: number | null;
  followersChange: number | null;
}

export interface AnalyticsBreakdown extends AnalyticsTotals {
  key: string;
  provider: string;
  accountId?: string;
  name: string;
  username?: string | null;
}

export interface AnalyticsSummaryDTO {
  from: number;
  to: number;
  tz: string;
  totals: AnalyticsTotals;
  previous: AnalyticsTotals;
  byProvider: AnalyticsBreakdown[];
  byAccount: AnalyticsBreakdown[];
  daily: Array<{ day: string; posts: number; views: number; engagements: number }>;
  followers: Array<{ accountId: string; provider: string; name: string; points: Array<{ day: string; followers: number }> }>;
}

export interface AnalyticsPostDTO {
  id: string;
  groupId: string;
  accountId: string;
  provider: string;
  accountName: string;
  accountUsername: string | null;
  excerpt: string;
  media: string[];
  externalId: string | null;
  externalUrl: string | null;
  publishedAt: number;
  metrics: MetricValues | null;
  metricsAt: number | null;
  metricsNextAt: number | null;
  engagements: number;
  engagementRate: number | null;
}

export interface PostMetricsDTO {
  postId: string;
  publishedAt: number | null;
  metrics: MetricValues | null;
  metricsAt: number | null;
  metricsNextAt: number | null;
  snapshots: Array<{ capturedAt: number; metrics: MetricValues }>;
}

export interface MeDTO {
  user: { id: string; name: string; email: string; role: { id: string; name: string }; demo?: true };
  instancePermissions: string[];
  workspaces: Array<{ id: string; name: string; role: { id: string; name: string }; permissions: string[]; viaAdmin?: true; demo?: true }>;
  currentWorkspaceId: string | null;
}

/** views, else impressions, else reach (what engagement rate is measured against). */
export const exposure = (m: MetricValues | null | undefined): number | null => (m ? m.views ?? m.impressions ?? m.reach ?? null : null);

/** GET /api/version (public). Servers without it answer 404: their version is unknown. */
export interface VersionDTO {
  version: string;
  commit: string;
  apiVersion: number;
}
