import type {
  AccountDTO,
  AccountGroupDTO,
  AccountGroupInput,
  AdminEmailDTO,
  AdminOverviewDTO,
  AppDTO,
  CampaignLinkDTO,
  CampaignSettingsDTO,
  CampaignSettingsInput,
  CampaignSyncDTO,
  PlaybookStatsSort,
  RevflareTestDTO,
  AnalyticsPostDTO,
  AnalyticsRefreshDTO,
  AnalyticsSummaryDTO,
  PostMetricsDTO,
  ApiKeyDTO,
  AppSettings,
  AuthStatus,
  CreatedInvitationDTO,
  CreateInvitationInput,
  CreatePostsInput,
  InvitationDTO,
  InvitationLookupDTO,
  MeDTO,
  MemberDTO,
  PermissionInfo,
  RoleDTO,
  RoleInput,
  SetupInput,
  UserDTO,
  UpdateStatusDTO,
  UserStatus,
  VersionDTO,
  WorkspaceDTO,
  FieldOption,
  MediaDTO,
  MediaUsageDTO,
  Overview,
  PlatformConfig,
  PlaybookDTO,
  PlaybookInput,
  PlaybookStatsDTO,
  PlaybookSummaryDTO,
  PostDTO,
  PostWithLogs,
  Provider,
  ResolvePostInput,
  ThreadItem,
} from "./types";

export class ApiError extends Error {
  status: number;
  errors: string[];
  constructor(message: string, status: number, errors: string[] = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

/** Fired when the session is gone; the app shell listens and sends the user to /login. */
export const UNAUTHORIZED_EVENT = "postflare:unauthorized";
/** Fired when the server does not know (or no longer grants access to) the workspace in `X-Workspace-Id`. */
export const WORKSPACE_NOT_FOUND_EVENT = "postflare:workspace-not-found";

/** Workspace sent as `X-Workspace-Id` with every request (set by the session provider). */
let currentWorkspaceId: string | null = null;

export function setApiWorkspace(id: string | null) {
  currentWorkspaceId = id;
}

export function workspaceHeaders(): Record<string, string> {
  return currentWorkspaceId ? { "x-workspace-id": currentWorkspaceId } : {};
}

export async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: { ...workspaceHeaders(), ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    ...init,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/") && !path.startsWith("/invitations/")) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
    const d = (data ?? {}) as { error?: string; errors?: string[] };
    if (res.status === 404 && d.error === "Workspace not found" && currentWorkspaceId) window.dispatchEvent(new Event(WORKSPACE_NOT_FOUND_EVENT));
    throw new ApiError(d.error || `Request failed (${res.status})`, res.status, d.errors ?? []);
  }
  return data as T;
}

export const get = <T>(path: string) => request<T>("GET", path);

export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}

type PostPatch = Partial<Pick<PostDTO, "content" | "media" | "settings" | "playbookId" | "playbookVersion" | "variant" | "appId" | "autoLink">> & {
  thread?: ThreadItem[];
  scheduledAt?: CreatePostsInput["scheduledAt"];
};

export interface PostQuery {
  from?: number;
  to?: number;
  status?: string;
  accountId?: string;
  /** Posts of the accounts in this account group ("none" = ungrouped accounts). */
  accountGroupId?: string;
  groupId?: string;
  order?: "asc" | "desc";
  limit?: number;
}

export type AnalyticsSort = "views" | "engagements" | "engagementRate" | "publishedAt" | "clicks" | "downloads" | "proceeds";

export interface AnalyticsQuery {
  from: number;
  to: number;
  tz?: string;
  accountId?: string;
  provider?: string;
}

export function qs(params: object): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  const s = q.toString();
  return s ? `?${s}` : "";
}

export const api = {
  auth: {
    status: () => get<AuthStatus>("/auth/status"),
    setup: (input: SetupInput) => request<{ ok: true }>("POST", "/auth/setup", input),
    login: (email: string, password: string) => request<{ ok: true }>("POST", "/auth/login", { email, password }),
    logout: () => request<{ ok: true }>("POST", "/auth/logout"),
    magicLink: (email: string) => request<{ ok: true }>("POST", "/auth/magic-link", { email }),
    verifyMagicLink: (token: string) => request<{ ok: true }>("POST", "/auth/magic-link/verify", { token }),
  },
  me: {
    get: () => get<MeDTO>("/me"),
    update: (body: { name?: string; email?: string }) => request<MeDTO["user"]>("PATCH", "/me", body),
    changePassword: (current: string, next: string) => request<{ ok: true }>("POST", "/me/password", { current, next }),
    setWorkspace: (workspaceId: string) => request<{ ok: true; currentWorkspaceId: string }>("POST", "/me/workspace", { workspaceId }),
  },
  workspaces: {
    list: () => get<WorkspaceDTO[]>("/workspaces"),
    create: (name: string) => request<WorkspaceDTO>("POST", "/workspaces", { name }),
    rename: (id: string, name: string) => request<WorkspaceDTO>("PATCH", `/workspaces/${id}`, { name }),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/workspaces/${id}`),
    members: (id: string) => get<MemberDTO[]>(`/workspaces/${id}/members`),
    setMemberRole: (id: string, userId: string, roleId: string) => request<MemberDTO>("PATCH", `/workspaces/${id}/members/${userId}`, { roleId }),
    removeMember: (id: string, userId: string) => request<{ ok: true }>("DELETE", `/workspaces/${id}/members/${userId}`),
  },
  roles: {
    list: () => get<RoleDTO[]>("/roles"),
    permissions: () => get<PermissionInfo[]>("/permissions"),
    create: (input: RoleInput) => request<RoleDTO>("POST", "/roles", input),
    update: (id: string, input: Partial<Omit<RoleInput, "scope">>) => request<RoleDTO>("PATCH", `/roles/${id}`, input),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/roles/${id}`),
  },
  users: {
    list: () => get<UserDTO[]>("/users"),
    update: (id: string, body: { roleId?: string; status?: UserStatus; name?: string }) => request<UserDTO>("PATCH", `/users/${id}`, body),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/users/${id}`),
  },
  invitations: {
    create: (input: CreateInvitationInput) => request<CreatedInvitationDTO>("POST", "/invitations", input),
    list: (workspaceId?: string) => get<InvitationDTO[]>(`/invitations${qs({ workspaceId })}`),
    revoke: (id: string) => request<{ ok: true }>("DELETE", `/invitations/${id}`),
    lookup: (token: string) => get<InvitationLookupDTO>(`/invitations/lookup/${encodeURIComponent(token)}`),
    accept: (body: { token: string; name?: string; email?: string; password?: string }) =>
      request<{ ok: true; workspaceId: string }>("POST", "/invitations/accept", body),
  },
  providers: () => get<Provider[]>("/providers"),
  platforms: {
    get: (id: string) => get<PlatformConfig>(`/platforms/${id}`),
    save: (id: string, values: Record<string, string>) => request<{ ok: true }>("PUT", `/platforms/${id}`, { values }),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/platforms/${id}`),
  },
  accounts: {
    list: () => get<AccountDTO[]>("/accounts"),
    setStatus: (id: string, status: "active" | "disabled") => request<AccountDTO>("PATCH", `/accounts/${id}`, { status }),
    setGroup: (id: string, groupId: string | null) => request<AccountDTO>("PATCH", `/accounts/${id}`, { groupId }),
    /** Move many accounts at once (one request); `groupId: null` ungroups them. */
    moveToGroup: (accountIds: string[], groupId: string | null) =>
      request<{ ok: true; updated: number; groupId: string | null }>("POST", "/accounts/group", { accountIds, groupId }),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/accounts/${id}`),
    refresh: (id: string) => request<AccountDTO>("POST", `/accounts/${id}/refresh`),
    options: (id: string, key: string, settings: Record<string, unknown>) =>
      get<FieldOption[]>(`/accounts/${id}/options/${encodeURIComponent(key)}?settings=${encodeURIComponent(JSON.stringify(settings))}`),
  },
  connect: {
    url: (provider: string) => get<{ url: string }>(`/connect/${provider}/url`),
    credentials: (provider: string, values: Record<string, string>) =>
      request<{ ids: string[] }>("POST", `/connect/${provider}`, { values }),
  },
  media: {
    list: (limit = 60, before?: number) => get<MediaDTO[]>(`/media${qs({ limit, before })}`),
    usage: () => get<MediaUsageDTO>("/media/usage"),
    setAlt: (id: string, alt: string | null) => request<MediaDTO>("PATCH", `/media/${id}`, { alt }),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/media/${id}`),
    fromUrl: (url: string) => request<MediaDTO>("POST", "/media/from-url", { url }),
  },
  posts: {
    list: (q: PostQuery = {}) => get<PostDTO[]>(`/posts${qs(q)}`),
    get: (id: string) => get<PostWithLogs>(`/posts/${id}`),
    validate: (input: CreatePostsInput) => request<{ errors: string[] }>("POST", "/posts/validate", input),
    create: (input: CreatePostsInput) => request<PostDTO[]>("POST", "/posts", input),
    update: (id: string, patch: PostPatch) => request<PostDTO>("PATCH", `/posts/${id}`, patch),
    retry: (id: string) => request<PostDTO>("POST", `/posts/${id}/retry`),
    /** needs_check only: mark it published (optionally with the live URL) or publish it again. */
    resolve: (id: string, input: ResolvePostInput) => request<PostDTO>("POST", `/posts/${id}/resolve`, input),
    cancel: (id: string) => request<PostDTO>("POST", `/posts/${id}/cancel`),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/posts/${id}`),
  },
  accountGroups: {
    list: () => get<AccountGroupDTO[]>("/account-groups"),
    create: (input: AccountGroupInput) => request<AccountGroupDTO>("POST", "/account-groups", input),
    update: (id: string, input: AccountGroupInput) => request<AccountGroupDTO>("PATCH", `/account-groups/${encodeURIComponent(id)}`, input),
    remove: (id: string) => request<{ ok: true; ungrouped: number }>("DELETE", `/account-groups/${encodeURIComponent(id)}`),
  },
  overview: () => get<Overview>("/overview"),
  playbooks: {
    list: (q: { q?: string; platform?: string; goal?: string; format?: string; source?: "builtin" | "custom" } = {}) => get<PlaybookSummaryDTO[]>(`/playbooks${qs(q)}`),
    get: (id: string, q: { version?: number; accountId?: string } = {}) => get<PlaybookDTO>(`/playbooks/${encodeURIComponent(id)}${qs(q)}`),
    create: (input: PlaybookInput) => request<PlaybookDTO>("POST", "/playbooks", input),
    update: (id: string, input: PlaybookInput) => request<PlaybookDTO>("PATCH", `/playbooks/${encodeURIComponent(id)}`, input),
    duplicate: (id: string, body: { name?: string; slug?: string } = {}) => request<PlaybookDTO>("POST", `/playbooks/${encodeURIComponent(id)}/duplicate`, body),
    archive: (id: string) => request<{ ok: true }>("DELETE", `/playbooks/${encodeURIComponent(id)}`),
    stats: (q: { days?: number; platform?: string; accountId?: string; sort?: PlaybookStatsSort } = {}) => get<PlaybookStatsDTO>(`/playbooks/stats${qs(q)}`),
  },
  analytics: {
    summary: (q: AnalyticsQuery) => get<AnalyticsSummaryDTO>(`/analytics/summary${qs(q)}`),
    posts: (q: AnalyticsQuery & { sort?: AnalyticsSort; limit?: number; offset?: number }) => get<AnalyticsPostDTO[]>(`/analytics/posts${qs(q)}`),
    postMetrics: (id: string) => get<PostMetricsDTO>(`/posts/${id}/metrics`),
    refresh: (body: { postId: string } | { accountId: string }) => request<AnalyticsRefreshDTO>("POST", "/analytics/refresh", body),
  },
  apps: {
    list: () => get<AppDTO[]>("/apps"),
    add: (appStoreId: string, name?: string) => request<AppDTO>("POST", "/apps", { appStoreId, ...(name ? { name } : {}) }),
    import: () => request<{ imported: number; apps: AppDTO[] }>("POST", "/apps/import", {}),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/apps/${id}`),
  },
  campaigns: {
    settings: () => get<CampaignSettingsDTO>("/campaigns/settings"),
    save: (input: CampaignSettingsInput) => request<CampaignSettingsDTO>("PUT", "/campaigns/settings", input),
    test: (input: CampaignSettingsInput = {}) => request<RevflareTestDTO>("POST", "/campaigns/test", input),
    sync: () => request<CampaignSyncDTO>("POST", "/campaigns/sync", {}),
    links: (q: { postId?: string; accountId?: string; appId?: string; kind?: "post" | "bio"; limit?: number } = {}) => get<CampaignLinkDTO[]>(`/campaigns/links${qs(q)}`),
    bioLink: (accountId: string, appId: string) => request<CampaignLinkDTO>("POST", "/campaigns/bio-links", { accountId, appId }),
  },
  settings: {
    get: () => get<AppSettings>("/settings"),
    save: (body: { publicUrl?: string; timezone?: string; experimentalIntegrations?: boolean; mediaRetentionDays?: number }) => request<{ ok: true }>("PUT", "/settings", body),
  },
  version: () => get<VersionDTO>("/version"),
  admin: {
    overview: (days: number) => get<AdminOverviewDTO>(`/admin/overview?days=${days}`),
    email: () => get<AdminEmailDTO>("/admin/email"),
    setEmail: (enabled: boolean) => request<AdminEmailDTO>("PATCH", "/admin/email", { enabled }),
    testEmail: () => request<{ ok: true; to: string }>("POST", "/admin/email/test", {}),
  },
  updates: {
    get: () => get<UpdateStatusDTO>("/updates"),
    check: () => request<UpdateStatusDTO>("POST", "/updates/check"),
  },
  keys: {
    list: () => get<ApiKeyDTO[]>("/keys"),
    create: (name: string) => request<{ id: string; token: string }>("POST", "/keys", { name }),
    remove: (id: string) => request<{ ok: true }>("DELETE", `/keys/${id}`),
  },
};
