interface Env {
  /** Optional encryption secret. When unset, a key is generated on first run and kept in D1. */
  SECRET_KEY?: string;
  /** Optional public base URL (e.g. https://social.example.com). Defaults to the request origin. */
  PUBLIC_URL?: string;
  /** Optional secret: when set, creating the first user (POST /api/auth/setup) requires it (fresh-deploy takeover guard). */
  SETUP_TOKEN?: string;
  /** "true" turns on the public live demo (GET /demo, POST /api/auth/demo, sandboxed demo workspace). Off by default. */
  DEMO_MODE?: string;
  /** "false" turns off the daily check for new Postflare releases on GitHub (one request a day). On by default. */
  UPDATE_CHECK?: string;
  /** GitHub repository (owner/name) whose releases the update check reads. Default: FerdiKT/postflare. */
  UPDATE_REPO?: string;
  /** Sender of sign-in link emails, e.g. "Postflare <login@example.com>" or a bare address. */
  EMAIL_FROM?: string;
  /** Optional Cloudflare `send_email` binding (Email Sending) for sign-in link emails; an instance admin turns them on. */
  EMAIL?: SendEmail;
}
