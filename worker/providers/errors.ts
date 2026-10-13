export type ProviderErrorKind =
  /** Token revoked/expired and cannot be refreshed: the account must be reconnected. Not retried. */
  | "auth"
  /** The post itself is invalid (too long, bad media, missing setting...). Not retried. */
  | "invalid"
  /** Rate limited. Retried with backoff. */
  | "rate_limit"
  /** Network/5xx. Retried with backoff. */
  | "transient";

export class ProviderError extends Error {
  constructor(
    message: string,
    public kind: ProviderErrorKind = "invalid",
    public status?: number,
    public body?: unknown,
  ) {
    super(message);
    this.name = "ProviderError";
  }

  get retryable() {
    return this.kind === "transient" || this.kind === "rate_limit";
  }
}

export function kindForStatus(status: number): ProviderErrorKind {
  if (status === 401) return "auth";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "transient";
  return "invalid";
}

export type MetricsUnavailableReason = "reconnect_required" | "not_supported";

/**
 * Analytics cannot be read for this account: the token lacks the analytics permission (reconnect to grant it) or the
 * platform / account type has none. Only changes the account's analytics status, never its publishing status.
 */
export class MetricsUnavailableError extends Error {
  constructor(
    public reason: MetricsUnavailableReason,
    message: string,
  ) {
    super(message);
    this.name = "MetricsUnavailableError";
  }
}

/** Shorthand: the analytics permission is missing from the stored token. */
export const missingScope = (platform: string, scopes: string | string[], detail?: string) =>
  new MetricsUnavailableError(
    "reconnect_required",
    `${platform} analytics need the ${[scopes].flat().join(", ")} permission${[scopes].flat().length > 1 ? "s" : ""}: reconnect the account to grant ${[scopes].flat().length > 1 ? "them" : "it"}${detail ? ` (${detail})` : ""}`,
  );
