declare module "cloudflare:test" {
  interface ProvidedEnv extends Env {
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
  }
}
