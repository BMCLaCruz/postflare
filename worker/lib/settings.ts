export async function getSetting(db: D1Database, key: string): Promise<string | null> {
  const row = await db.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value ?? null;
}

export async function setSetting(db: D1Database, key: string, value: string): Promise<void> {
  await db
    .prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .bind(key, value)
    .run();
}

/** Public base URL used for OAuth redirects and media links outside of a request (workflows, cron). */
export async function baseUrl(env: Env, requestUrl?: string): Promise<string> {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, "");
  const stored = await getSetting(env.DB, "public_url");
  if (stored) return stored;
  if (requestUrl) {
    const origin = new URL(requestUrl).origin;
    await setSetting(env.DB, "public_url", origin);
    return origin;
  }
  throw new Error("Public URL unknown: open the app once in the browser or set PUBLIC_URL");
}
