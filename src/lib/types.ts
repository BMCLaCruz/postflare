import type { PostDTO, PostLogDTO, PostStatus, ProviderInfo } from "@shared/types";

export type * from "@shared/types";

/**
 * GET /api/providers. `enabled`: new accounts can be connected (false for experimental ones while they are off).
 * `dataDeletionUri`: Meta apps only, the data deletion callback URL to paste in the Meta dashboard.
 */
export type Provider = ProviderInfo & { configured: boolean; redirectUri: string; enabled: boolean; dataDeletionUri?: string };

export interface AuthStatus {
  setup: boolean;
  authenticated: boolean;
  demo?: true;
  setupToken?: true;
  magicLink?: true;
  /** Public sign-up is on: "Create an account" on the sign-in page, /signup. */
  signup?: true;
  /** Cloudflare Turnstile is on: the widget's site key (sign-up, sign-in links, sign-in after failures). */
  turnstileSiteKey?: string;
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
  /** Days before unused media is removed by the daily cleanup; 0 = keep forever. */
  mediaRetentionDays?: number;
}

export interface PlatformConfig {
  values: Record<string, string>;
  redirectUri: string;
}
