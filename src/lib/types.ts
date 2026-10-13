import type { PostDTO, PostLogDTO, PostStatus, ProviderInfo } from "@shared/types";

export type * from "@shared/types";

export type Provider = ProviderInfo & { configured: boolean; redirectUri: string };

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
}

export interface PlatformConfig {
  values: Record<string, string>;
  redirectUri: string;
}
