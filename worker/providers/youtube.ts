import { missingScope, ProviderError } from "./errors";
import { googleAppFields, googleAuthorizeUrl, googleClassify, googleDocsUrl, googleExchangeCode, googleReasons, googleRefresh } from "./google-shared";
import { request, requestJson } from "./http";
import { mediaBody } from "./multipart";
import type { MediaItem, MetricValues, PostMetricsResult, Provider, ProviderContext, PublishPost, PublishResult } from "./types";

const API = "https://www.googleapis.com/youtube/v3";
const UPLOAD_API = "https://www.googleapis.com/upload/youtube/v3";
const NAME = "YouTube";

const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube",
  // commentThreads.insert (first comment)
  "https://www.googleapis.com/auth/youtube.force-ssl",
  // videos.list / channels.list statistics (analytics)
  "https://www.googleapis.com/auth/youtube.readonly",
];

/** videos.list accepts at most 50 ids per request. */
const METRICS_BATCH = 50;
const READONLY_SCOPE = "youtube.readonly";
/** Google reasons of a token that lacks the analytics scope (403). */
const SCOPE_REASONS = ["insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"];

/**
 * Resumable upload chunks must be multiples of 256 KiB (except the last one). Each chunk is one PUT streamed
 * straight from R2 (no copy through JS), so big chunks keep the subrequest count low: a 2GB video is 8 PUTs.
 */
const CHUNK = 256 * 1024 * 1024;
/** Per call (workflow step): at most this many PUTs / this much time, then continue in checkStatus. */
const STEP_PUTS = 8;
const STEP_MS = 2 * 60 * 1000;

interface UploadState {
  [key: string]: unknown;
  uploadUrl: string;
  video: MediaItem;
  thumbnail: MediaItem | null;
  playlistId: string | null;
}

const reasonMessages: Record<string, string> = {
  invalidTitle: "The title is invalid or too long (max 100 characters).",
  invalidDescription: "The description is invalid: it may contain < or >, or be longer than 5000 characters.",
  invalidTags: "The tags are invalid: at most 500 characters in total.",
  invalidCategoryId: "The selected video category is invalid.",
  invalidPublishAt: "The scheduled publishing time is invalid (it must be in the future and the video private).",
  uploadLimitExceeded: "The channel reached its daily YouTube upload limit, try again tomorrow.",
  quotaExceeded: "The YouTube API daily quota of this Google Cloud project is exhausted, try again tomorrow.",
  youtubeSignupRequired: "This Google account has no YouTube channel yet: create one first.",
  forbidden: "YouTube refused the request (comments disabled or video not public?).",
};

const classify = googleClassify;

/** Wrap a request so known YouTube reasons produce a readable message. */
async function yt<T = any>(ctx: ProviderContext, url: string, opts: Parameters<typeof requestJson>[2] = {}): Promise<T> {
  try {
    return await requestJson<T>(ctx, url, { classify, ...opts });
  } catch (err) {
    throw readable(err);
  }
}

function readable(err: unknown): unknown {
  if (!(err instanceof ProviderError)) return err;
  const reason = googleReasons(err.body).find((r) => reasonMessages[r]);
  if (reason) return new ProviderError(`YouTube: ${reasonMessages[reason]}`, err.kind, err.status, err.body);
  return err;
}

/**
 * GET for analytics. A token without the read scope (accounts connected before analytics) is a
 * reconnect_required signal for analytics only, never ProviderError("auth") (which would stop publishing).
 */
async function ytRead<T = any>(ctx: ProviderContext, token: string, path: string, query: Record<string, string | number | boolean>): Promise<T> {
  try {
    return await requestJson<T>(ctx, `${API}${path}`, { token, query, classify });
  } catch (err) {
    if (err instanceof ProviderError && err.status !== 401 && googleReasons(err.body).some((r) => SCOPE_REASONS.includes(r)))
      throw missingScope(NAME, READONLY_SCOPE);
    throw readable(err);
  }
}

/** YouTube statistics are decimal strings ("123"); missing/invalid → undefined (not reported). */
function count(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/** Drop undefined keys (and an empty `extra`): only reported numbers are set. */
function compact(m: MetricValues): MetricValues {
  const out: MetricValues = {};
  for (const [k, v] of Object.entries(m)) {
    if (k === "extra") {
      const extra = Object.fromEntries(Object.entries(v as Record<string, number | undefined>).filter(([, x]) => x !== undefined)) as Record<string, number>;
      if (Object.keys(extra).length) out.extra = extra;
    } else if (v !== undefined) (out as any)[k] = v;
  }
  return out;
}

const bool = (v: unknown, dflt: boolean) => (v === undefined || v === null || v === "" ? dflt : v === true || v === "true" || v === "yes" || v === 1);

function toIso(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  const d = typeof v === "number" ? new Date(v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function tagsOf(v: unknown): string[] {
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(",") : [];
  return list.map((t) => String(typeof t === "object" && t ? ((t as any).label ?? (t as any).value) : t).trim()).filter(Boolean);
}

/** Metadata of the videos.insert call. */
export function videoResource(post: PublishPost) {
  const s = post.settings;
  let title = String(s.title ?? "").trim();
  if (bool(s.shorts, false) && !/#shorts/i.test(title) && !/#shorts/i.test(post.content)) {
    title = title.length + 8 <= 100 ? `${title} #Shorts` : title;
  }
  const publishAt = toIso(s.publishAt);
  const privacy = publishAt ? "private" : ["public", "unlisted", "private"].includes(s.privacy) ? s.privacy : "private";
  const tags = tagsOf(s.tags);
  return {
    snippet: {
      title,
      description: post.content,
      ...(tags.length ? { tags } : {}),
      categoryId: String(s.category || "22"),
      ...(s.language ? { defaultLanguage: String(s.language), defaultAudioLanguage: String(s.language) } : {}),
    },
    status: {
      privacyStatus: privacy,
      ...(publishAt ? { publishAt } : {}),
      selfDeclaredMadeForKids: bool(s.madeForKids, false),
      embeddable: bool(s.embeddable, true),
      license: s.license === "creativeCommon" ? "creativeCommon" : "youtube",
      containsSyntheticMedia: bool(s.syntheticMedia, false),
    },
  };
}

/** Send one PUT to the resumable session. Returns the next offset, or the created video. */
async function putSession(
  ctx: ProviderContext,
  token: string,
  uploadUrl: string,
  headers: Record<string, string>,
  body: ReadableStream | null,
): Promise<{ offset: number } | { videoId: string }> {
  let res: Response;
  try {
    res = await ctx.fetch(uploadUrl, {
      method: "PUT",
      // 308 "Resume Incomplete" must not be treated as a redirect.
      redirect: "manual",
      headers: { authorization: `Bearer ${token}`, ...headers },
      body,
      // Required by Node/undici for stream bodies; ignored by Workers.
      ...(body ? { duplex: "half" } : {}),
    } as RequestInit);
  } catch (err) {
    throw new ProviderError(`Network error uploading to YouTube: ${(err as Error).message}`, "transient");
  }
  if (res.status === 308) {
    const range = res.headers.get("range");
    const m = range?.match(/bytes=\d+-(\d+)/);
    return { offset: m ? Number(m[1]) + 1 : 0 };
  }
  if (res.status === 200 || res.status === 201) {
    const video = await res.json<{ id: string }>();
    return { videoId: video.id };
  }
  const text = await res.text().catch(() => "");
  let parsed: any = text;
  try {
    parsed = JSON.parse(text);
  } catch {}
  if (res.status === 404 || res.status === 410)
    throw new ProviderError("YouTube upload session expired before the video was uploaded; publish the post again", "invalid", res.status, parsed);
  const kind = classify(res.status, parsed) ?? (res.status >= 500 ? "transient" : "invalid");
  throw readable(new ProviderError(`YouTube upload failed (${res.status}): ${parsed?.error?.message ?? text.slice(0, 300)}`, kind, res.status, parsed));
}

/** Ask the session how many bytes it has (`Content-Range: bytes * /total`). */
function probe(ctx: ProviderContext, token: string, state: UploadState) {
  return putSession(ctx, token, state.uploadUrl, { "content-range": `bytes */${state.video.size}` }, null);
}

/**
 * Upload chunks from `offset` until done or the step budget is used.
 * Returns the video id when YouTube created the video, otherwise the next offset.
 */
async function uploadChunks(
  ctx: ProviderContext,
  token: string,
  state: UploadState,
  offset: number,
): Promise<{ offset: number } | { videoId: string }> {
  const total = state.video.size;
  const started = Date.now();
  let puts = 0;
  while (offset < total) {
    if (puts >= STEP_PUTS || Date.now() - started > STEP_MS) return { offset };
    const length = Math.min(CHUNK, total - offset);
    const r = await putSession(
      ctx,
      token,
      state.uploadUrl,
      {
        "content-type": state.video.mime || "video/mp4",
        "content-range": `bytes ${offset}-${offset + length - 1}/${total}`,
      },
      await ctx.media.rangeStream(state.video, offset, length),
    );
    if ("videoId" in r) return r;
    puts++;
    // Always trust the server's offset: it may have kept fewer bytes than we sent.
    offset = r.offset;
  }
  // Every byte acknowledged without a final 200: ask the session for the result.
  return probe(ctx, token, state);
}

/** Thumbnail + playlist after the upload. Failures only warn: the video is already live. */
async function finish(ctx: ProviderContext, token: string, state: UploadState, videoId: string): Promise<PublishResult> {
  if (state.thumbnail) {
    try {
      const t = state.thumbnail;
      // Small JPEG/PNG: streamed from R2 as is; anything else is re-encoded (a small in-memory Blob).
      const raw = t.size <= 2_000_000 && (t.mime === "image/jpeg" || t.mime === "image/png");
      const body = raw ? await mediaBody(ctx, t) : await ctx.media.image(t, { maxWidth: 1280, maxHeight: 1280, format: "image/jpeg", quality: 85 });
      await yt(ctx, `${UPLOAD_API}/thumbnails/set`, {
        method: "POST",
        token,
        query: { videoId, uploadType: "media" },
        headers: { "content-type": raw ? t.mime : "image/jpeg" },
        body,
        duplex: "half",
      } as Parameters<typeof yt>[2]);
    } catch (err) {
      ctx.log("warn", `YouTube: video uploaded but the custom thumbnail failed (custom thumbnails need a verified channel): ${(err as Error).message}`);
    }
  }
  if (state.playlistId) {
    try {
      await yt(ctx, `${API}/playlistItems`, {
        method: "POST",
        token,
        query: { part: "snippet" },
        json: { snippet: { playlistId: state.playlistId, resourceId: { kind: "youtube#video", videoId } } },
      });
    } catch (err) {
      ctx.log("warn", `YouTube: video uploaded but adding it to the playlist failed: ${(err as Error).message}`);
    }
  }
  return { status: "published", externalId: videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
}

/** Upload as far as the budget allows; transient failures become "pending" so checkStatus resumes the same session. */
async function advance(ctx: ProviderContext, token: string, state: UploadState, offset: number | null): Promise<PublishResult> {
  try {
    const r = offset === null ? await probe(ctx, token, state) : { offset };
    const done = "videoId" in r ? r : await uploadChunks(ctx, token, state, r.offset);
    if ("videoId" in done) return finish(ctx, token, state, done.videoId);
    ctx.log("info", `YouTube: uploaded ${Math.round((done.offset / state.video.size) * 100)}% of ${state.video.filename}`);
    return { status: "pending", state, retryAfterSeconds: 5 };
  } catch (err) {
    if (err instanceof ProviderError && err.retryable) {
      ctx.log("warn", `YouTube upload interrupted, will resume: ${err.message}`);
      return { status: "pending", state, retryAfterSeconds: 30 };
    }
    throw err;
  }
}

export const youtube: Provider = {
  id: "youtube",
  name: NAME,
  color: "FF0000",
  icon: "youtube",
  category: "video",
  auth: "oauth2",
  docsUrl: googleDocsUrl,
  setupNotes: [
    "1. In the [Google Cloud console](https://console.cloud.google.com/) create a project and enable **YouTube Data API v3**.",
    "2. Configure the **OAuth consent screen** (External), add the scopes `youtube.upload`, `youtube`, `youtube.force-ssl` and `youtube.readonly` (analytics), and add your Google account as a test user.",
    "3. Create an **OAuth client ID** of type *Web application* with the authorized redirect URI `{{redirectUri}}`.",
    "4. Paste the client ID and secret here, then connect a channel (pick the brand channel on Google's account chooser).",
    "",
    "Notes: videos uploaded by an **unverified API project** (created after July 2020 and not audited) are locked to **private** by YouTube until the project passes the [API audit](https://support.google.com/youtube/contact/yt_api_form). " +
      "While the consent screen is in *Testing*, refresh tokens expire after 7 days: publish the app to *Production* to stay connected. " +
      "Custom thumbnails require a verified channel. Each upload costs ~1600 quota units of the default 10,000/day. " +
      "Analytics read video and channel statistics (1 quota unit per 50 videos); channels connected before analytics existed must be **reconnected** to grant `youtube.readonly`.",
  ].join("\n"),
  appFields: googleAppFields,
  credentialFields: [],
  settingsFields: [
    { key: "title", label: "Title", type: "text", required: true, maxLength: 100 },
    {
      key: "privacy",
      label: "Privacy",
      type: "select",
      default: "private",
      options: [
        { value: "public", label: "Public" },
        { value: "unlisted", label: "Unlisted" },
        { value: "private", label: "Private" },
      ],
    },
    {
      key: "publishAt",
      label: "Go public at (optional)",
      type: "datetime",
      help: "Uploads now as private and lets YouTube make it public at this time.",
    },
    { key: "category", label: "Category", type: "select", dynamicOptions: true, default: "22" },
    { key: "playlist", label: "Add to playlist", type: "select", dynamicOptions: true, default: "" },
    { key: "tags", label: "Tags", type: "tags", help: "At most 500 characters in total." },
    { key: "madeForKids", label: "Made for kids", type: "checkbox", default: false },
    { key: "notifySubscribers", label: "Notify subscribers", type: "checkbox", default: true },
    { key: "shorts", label: "Short", type: "checkbox", default: false, help: "Adds #Shorts to the title. Vertical videos up to 3 minutes become Shorts automatically." },
    { key: "syntheticMedia", label: "Contains altered or synthetic content", type: "checkbox", default: false },
    { key: "embeddable", label: "Allow embedding", type: "checkbox", default: true },
    {
      key: "license",
      label: "License",
      type: "select",
      default: "youtube",
      options: [
        { value: "youtube", label: "Standard YouTube License" },
        { value: "creativeCommon", label: "Creative Commons - Attribution" },
      ],
    },
  ],
  capabilities: {
    maxLength: 5000,
    text: "optional",
    // The optional image is used as the custom thumbnail.
    media: { images: 1, videos: 1, mixed: true, required: true },
    thread: true,
    threadLabel: "First comment",
  },

  metrics: {
    post: ["views", "likes", "comments"],
    account: ["followers", "posts"],
    batch: METRICS_BATCH,
    scopes: ["https://www.googleapis.com/auth/youtube.readonly"],
  },

  authorize(ctx, p) {
    return googleAuthorizeUrl(ctx, NAME, SCOPES, p);
  },

  async callback(ctx, { code, codeVerifier }) {
    const tok = await googleExchangeCode(ctx, NAME, code, codeVerifier);
    const token = tok.credentials.accessToken;
    const res = await yt<{ items?: any[] }>(ctx, `${API}/channels`, { token, query: { part: "snippet", mine: true, maxResults: 50 } });
    const channels = res.items ?? [];
    if (!channels.length) throw new ProviderError("This Google account has no YouTube channel", "invalid");
    return channels.map((c) => ({
      externalId: c.id,
      name: c.snippet?.title ?? "YouTube channel",
      username: c.snippet?.customUrl ?? null,
      avatarUrl: c.snippet?.thumbnails?.default?.url ?? null,
      profileUrl: c.snippet?.customUrl ? `https://www.youtube.com/${c.snippet.customUrl}` : `https://www.youtube.com/channel/${c.id}`,
      credentials: tok.credentials,
      expiresAt: tok.expiresAt,
      meta: { channelId: c.id, country: c.snippet?.country ?? null },
    }));
  },

  refresh(ctx, account) {
    return googleRefresh(ctx, NAME, account);
  },

  validate(post) {
    const errors: string[] = [];
    if (post.media.filter((m) => m.kind === "video").length !== 1) errors.push("YouTube: attach exactly one video");
    if (/[<>]/.test(post.content)) errors.push("YouTube: the description cannot contain < or >");
    if (tagsOf(post.settings.tags).join(",").length > 500) errors.push("YouTube: tags are limited to 500 characters in total");
    return errors;
  },

  async publish(ctx, account, post) {
    const video = post.media.find((m) => m.kind === "video");
    if (!video) throw new ProviderError("YouTube needs a video", "invalid");
    if (!String(post.settings.title ?? "").trim()) throw new ProviderError("YouTube: a title is required", "invalid");
    const token = String(account.credentials.accessToken);
    const res = await request(ctx, `${UPLOAD_API}/videos`, {
      method: "POST",
      token,
      query: { uploadType: "resumable", part: "snippet,status", notifySubscribers: bool(post.settings.notifySubscribers, true) },
      headers: { "x-upload-content-type": video.mime || "video/mp4", "x-upload-content-length": String(video.size) },
      json: videoResource(post),
      classify,
    }).catch((err) => {
      throw readable(err);
    });
    const uploadUrl = res.headers.get("location");
    if (!uploadUrl) throw new ProviderError("YouTube did not return an upload session", "transient");
    const state: UploadState = {
      uploadUrl,
      video,
      thumbnail: post.media.find((m) => m.kind === "image") ?? null,
      playlistId: post.settings.playlist ? String(post.settings.playlist) : null,
    };
    return advance(ctx, token, state, 0);
  },

  async checkStatus(ctx, account, state) {
    // Never starts a new upload: resumes the stored session from the offset YouTube reports.
    return advance(ctx, String(account.credentials.accessToken), state as UploadState, null);
  },

  async reply(ctx, account, target, post) {
    if (!post.content.trim()) throw new ProviderError("YouTube comments must contain text", "invalid");
    if (post.media.length) ctx.log("warn", "YouTube comments cannot contain media; attachments were ignored");
    const res = await yt<{ id: string }>(ctx, `${API}/commentThreads`, {
      method: "POST",
      token: String(account.credentials.accessToken),
      query: { part: "snippet" },
      json: { snippet: { videoId: target.rootId, topLevelComment: { snippet: { textOriginal: post.content } } } },
    });
    return { externalId: res.id, url: `https://www.youtube.com/watch?v=${target.rootId}&lc=${res.id}` };
  },

  async options(ctx, account, key) {
    const token = String(account.credentials.accessToken);
    if (key === "category") {
      const res = await yt<{ items?: any[] }>(ctx, `${API}/videoCategories`, {
        token,
        query: { part: "snippet", regionCode: (account.meta.country as string) || "US" },
      });
      return (res.items ?? []).filter((c) => c.snippet?.assignable).map((c) => ({ value: String(c.id), label: c.snippet.title }));
    }
    if (key === "playlist") {
      const out = [{ value: "", label: "None" }];
      let pageToken: string | undefined;
      do {
        const res: { items?: any[]; nextPageToken?: string } = await yt(ctx, `${API}/playlists`, {
          token,
          query: { part: "snippet", mine: true, maxResults: 50, pageToken },
        });
        for (const p of res.items ?? []) out.push({ value: p.id, label: p.snippet?.title ?? p.id });
        pageToken = res.nextPageToken;
      } while (pageToken && out.length < 500);
      return out;
    }
    return [];
  },
  /** One videos.list call for the whole batch. Videos missing from the response (deleted, private, unknown) → null. */
  async postMetrics(ctx, account, items) {
    const ids = [...new Set(items.map((i) => i.externalId))].slice(0, METRICS_BATCH);
    if (!ids.length) return {};
    const res = await ytRead<{ items?: any[] }>(ctx, String(account.credentials.accessToken), "/videos", {
      part: "statistics",
      id: ids.join(","),
      maxResults: METRICS_BATCH,
    });
    const found = new Map((res?.items ?? []).map((v) => [String(v.id), v.statistics ?? {}]));
    const out: PostMetricsResult = {};
    for (const id of ids) {
      const st = found.get(id);
      out[id] = st
        ? compact({
            views: count(st.viewCount),
            likes: count(st.likeCount),
            comments: count(st.commentCount),
            extra: { favorites: count(st.favoriteCount) } as Record<string, number>,
          })
        : null;
    }
    return out;
  },

  /** channels.list statistics of the connected channel. Hidden subscriber counts are left out. */
  async accountMetrics(ctx, account) {
    const channelId = String(account.meta.channelId ?? account.externalId);
    const res = await ytRead<{ items?: any[] }>(ctx, String(account.credentials.accessToken), "/channels", { part: "statistics", id: channelId });
    const st = res?.items?.[0]?.statistics;
    if (!st) throw new ProviderError(`YouTube channel ${channelId} was not found`, "invalid");
    return compact({
      followers: st.hiddenSubscriberCount ? undefined : count(st.subscriberCount),
      posts: count(st.videoCount),
      extra: { channel_views: count(st.viewCount) } as Record<string, number>,
    });
  },
};
