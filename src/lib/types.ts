import type { PostDTO, PostLogDTO, PostStatus, ProviderInfo } from "@shared/types";

export type * from "@shared/types";

/** GET /api/providers. `enabled`: new accounts can be connected (false for experimental ones while they are off). */
export type Provider = ProviderInfo & { configured: boolean; redirectUri: string; enabled: boolean };

export interface AuthStatus {
  setup: boolean;
  authenticated: boolean;
  demo?: true;
  setupToken?: true;
}

export interface Overview {
  counts: Partial<Record<PostStatus, number>>;
  upcoming: PostDTO[];
  recent: PostDTO[];
  accounts: { total: number; reconnect: number };
}

export interface PostWithLogs extends PostDTO {
  logs: PostLogDTO[];
}

export interface AppSettings {
  publicUrl: string;
  publicUrlLocked: boolean;
  timezone: string | null;
  encryptionKeyFromSecret?: boolean;
  /** "Enable experimental integrations" (providers on unofficial APIs). */
  experimentalIntegrations?: boolean;
}

export interface PlatformConfig {
  values: Record<string, string>;
  redirectUri: string;
}
