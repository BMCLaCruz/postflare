// Test-only bindings (test/workers/wrangler.test.jsonc), merged into the `env` of "cloudflare:test" / "cloudflare:workers".
// Worker code types its bindings with the global `Env`, which does not see these.
declare namespace Cloudflare {
  interface Env {
    /** Second D1 used to test migrating a legacy (single password) install. */
    LEGACY_DB: D1Database;
    /** Own instance for the live demo tests (they need DEMO_MODE and their own first user). */
    DEMO_DB: D1Database;
    /** Own instance for the analytics tests (they seed posts/metrics directly). */
    ANALYTICS_DB: D1Database;
    /** Own instance for the security hardening tests (SETUP_TOKEN needs a fresh instance). */
    SECURITY_DB: D1Database;
    /** Own instance for publishing safety, token refresh, D1 budget and media lifecycle tests. */
    PUBLISH_DB: D1Database;
    /** Own instance for the playbook tests (library, attribution, ranking, D1 query counts). */
    PLAYBOOKS_DB: D1Database;
    /** Own instance for the Meta data deletion callback tests (they configure Meta app secrets). */
    DELETION_DB: D1Database;
    /** Own instance for the App Store campaign tests (links, clicks, Revflare sync with mocked fetch). */
    CAMPAIGNS_DB: D1Database;
    /** Own instance for the email sign-in link tests (they configure EMAIL_FROM and a fake EMAIL binding). */
    EMAIL_LOGIN_DB: D1Database;
  }
}
