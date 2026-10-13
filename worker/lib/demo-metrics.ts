// Made-up analytics for the sandboxed demo workspace (lib/demo.ts): no provider is ever called. Numbers are
// deterministic (seeded by the post content / account, so a post looks the same after the daily reset), only use
// the keys the platform really reports (`provider.metrics`), and grow with the post's age / the calendar day.

import type { MetricKey, MetricValues } from "../../shared/types";
import type { Provider } from "../providers/types";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
/** Day 0 of the follower curves (any fixed date: keeps follower counts growing day after day, across resets). */
const EPOCH = Date.UTC(2026, 0, 1);

/** FNV-1a: string → 32-bit seed. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Deterministic number in [0, 1) for (seed, salt). */
function rand(seed: number, salt: string): number {
  let x = (seed ^ hash(salt)) >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return (x >>> 0) / 4294967296;
}

/** Typical lifetime views of a post per platform (before the per-post factor). */
const SCALE: Record<string, number> = {
  tiktok: 14000,
  youtube: 3200,
  instagram: 2600,
  instagram_standalone: 2600,
  facebook: 1500,
  x: 2200,
  threads: 1100,
  linkedin_page: 1400,
  pinterest: 2400,
  bluesky: 900,
  mastodon: 500,
  reddit: 3000,
};

/** Share of the exposure each key reaches (before a per-key factor). */
const RATE: Partial<Record<MetricKey, number>> = {
  impressions: 1.35,
  reach: 0.72,
  views: 1,
  likes: 0.055,
  comments: 0.007,
  shares: 0.006,
  saves: 0.009,
  clicks: 0.018,
  replies: 0.008,
  reposts: 0.009,
  quotes: 0.002,
};

/** Share of the lifetime total reached at `age` ms: fast first day, slow tail. Monotonic, 0 → 1. */
function growth(age: number): number {
  const h = Math.max(0, age) / HOUR;
  return 0.85 * (1 - Math.exp(-h / 18)) + 0.15 * Math.min(1, h / (24 * 45));
}

/** Metrics of a demo post at time `t`. */
export function demoPostMetrics(provider: Provider, post: { content: string; published_at: number }, t: number): MetricValues {
  const seed = hash(`${provider.id}:${post.content}`);
  const total = (SCALE[provider.id] ?? 800) * (0.35 + 1.9 * rand(seed, "size"));
  const g = growth(t - post.published_at);
  const out: MetricValues = {};
  for (const k of provider.metrics?.post ?? []) {
    const rate = RATE[k];
    if (rate === undefined) continue;
    out[k] = Math.round(total * rate * (k === "views" || k === "impressions" || k === "reach" ? 1 : 0.5 + rand(seed, k)) * g);
  }
  return out;
}

/** Account metrics of a demo account on the UTC day of `t` (followers grow ~0.3% a day). */
export function demoAccountMetrics(provider: Provider, externalId: string, t: number): MetricValues {
  const seed = hash(`${provider.id}:${externalId}`);
  const day = Math.floor((t - EPOCH) / DAY);
  const base = 800 + Math.round(rand(seed, "followers") * 24000);
  const out: MetricValues = {};
  for (const k of provider.metrics?.account ?? []) {
    if (k === "followers") out.followers = Math.round(base * (1 + 0.003 * day) + rand(seed, `d${day}`) * base * 0.002);
    else if (k === "following") out.following = 60 + Math.round(rand(seed, "following") * 400) + Math.floor(day / 20);
    else if (k === "posts") out.posts = 40 + Math.round(rand(seed, "posts") * 300) + Math.floor(day / 2);
  }
  return out;
}

/** Collection times between publish and `t` (for seeding snapshots), always including `t` itself. */
export function demoSnapshotTimes(checkpoints: number[], publishedAt: number, t: number): number[] {
  const times = checkpoints.map((c) => publishedAt + c).filter((x) => x < t);
  return [...times, t];
}
