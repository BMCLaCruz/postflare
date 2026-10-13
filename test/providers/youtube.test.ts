import { describe, expect, it } from "vitest";
import { youtube } from "../../worker/providers/youtube";
import { MetricsUnavailableError, ProviderError } from "../../worker/providers/errors";
import { hollowMedia, image, json, lazyStream, mockFetch, testAccount, testContext, video } from "../helpers";

const app = { clientId: "CID", clientSecret: "SECRET" };
const SESSION = "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&upload_id=XYZ";
const MiB = 1024 * 1024;

const post = (over: Partial<Parameters<typeof youtube.publish>[2]> = {}) => ({
  id: "p1",
  content: "Description here",
  media: [video({ size: 5 * MiB })],
  settings: { title: "My video", privacy: "public", category: "22", tags: ["a", "b c"], notifySubscribers: false },
  ...over,
});

const sessionRoute: [string, any] = [
  "POST https://www.googleapis.com/upload/youtube/v3/videos",
  () => new Response(null, { status: 200, headers: { location: SESSION } }),
];

/** Fake resumable session: acknowledges chunks; replies 201 with the video once all bytes arrived. */
function fakeSession(total: number, opts: { keepLess?: number } = {}) {
  let received = 0;
  return (req: { headers: Record<string, string> }) => {
    const cr = req.headers["content-range"];
    const probe = cr.match(/^bytes \*\/(\d+)$/);
    if (!probe) {
      const [, start, end] = cr.match(/^bytes (\d+)-(\d+)\/\d+$/)!.map(Number);
      expect(start).toBe(received);
      received = end + 1 - (opts.keepLess ?? 0);
      opts.keepLess = 0;
    }
    if (received >= total) return json({ id: "VID123" }, 201);
    return new Response(null, { status: 308, headers: received ? { range: `bytes=0-${received - 1}` } : {} });
  };
}

describe("youtube", () => {
  it("builds the Google authorize URL", () => {
    const ctx = testContext(mockFetch([]).fetch, app, "youtube");
    const url = new URL(youtube.authorize!(ctx, { state: "S", codeVerifier: "V", codeChallenge: "CH" }) as string);
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = url.searchParams;
    expect(q.get("client_id")).toBe("CID");
    expect(q.get("redirect_uri")).toBe("https://pf.example.com/oauth/youtube/callback");
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("prompt")).toBe("consent");
    expect(q.get("code_challenge")).toBe("CH");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("scope")).toContain("youtube.upload");
    expect(q.get("scope")).toContain("youtube.force-ssl");
  });

  it("callback returns one account per channel", async () => {
    const m = mockFetch([
      ["POST https://oauth2.googleapis.com/token", () => ({ access_token: "AT", refresh_token: "RT", expires_in: 3600 })],
      [
        "GET https://www.googleapis.com/youtube/v3/channels",
        () => ({
          items: [
            { id: "UC1", snippet: { title: "Main", customUrl: "@main", country: "DE", thumbnails: { default: { url: "https://x/a.jpg" } } } },
            { id: "UC2", snippet: { title: "Brand" } },
          ],
        }),
      ],
    ]);
    const ctx = testContext(m.fetch, app, "youtube");
    const accounts = await youtube.callback!(ctx, { code: "C", codeVerifier: "V", params: new URLSearchParams() });
    expect(m.requests[0].form).toMatchObject({ grant_type: "authorization_code", code: "C", code_verifier: "V", client_secret: "SECRET" });
    expect(m.requests[1].url).toContain("mine=true");
    expect(accounts).toHaveLength(2);
    expect(accounts[0]).toMatchObject({
      externalId: "UC1",
      name: "Main",
      username: "@main",
      profileUrl: "https://www.youtube.com/@main",
      credentials: { accessToken: "AT", refreshToken: "RT" },
      meta: { channelId: "UC1", country: "DE" },
    });
    expect(accounts[0].expiresAt).toBeGreaterThan(Date.now());
    expect(accounts[1].profileUrl).toBe("https://www.youtube.com/channel/UC2");
  });

  it("refresh keeps the refresh token when Google does not rotate it", async () => {
    const m = mockFetch([["POST https://oauth2.googleapis.com/token", () => ({ access_token: "AT2", expires_in: 3600 })]]);
    const update = await youtube.refresh!(testContext(m.fetch, app), testAccount());
    expect(m.requests[0].form).toMatchObject({ grant_type: "refresh_token", refresh_token: "RT" });
    expect(update.credentials).toEqual({ accessToken: "AT2" });
  });

  it("refresh with a revoked token maps to auth", async () => {
    const m = mockFetch([["POST https://oauth2.googleapis.com/token", () => json({ error: "invalid_grant" }, 400)]]);
    await expect(youtube.refresh!(testContext(m.fetch, app), testAccount())).rejects.toMatchObject({ kind: "auth" });
  });

  it("uploads a small video in one chunk and sets metadata", async () => {
    const m = mockFetch([sessionRoute, ["PUT " + SESSION, fakeSession(5 * MiB)]]);
    const res = await youtube.publish(testContext(m.fetch, app), testAccount(), post());
    expect(res).toEqual({ status: "published", externalId: "VID123", url: "https://www.youtube.com/watch?v=VID123" });
    const init = m.requests[0];
    expect(init.url).toContain("uploadType=resumable");
    expect(init.url).toContain("notifySubscribers=false");
    expect(init.headers["x-upload-content-length"]).toBe(String(5 * MiB));
    expect(init.headers.authorization).toBe("Bearer AT");
    expect(init.json).toMatchObject({
      snippet: { title: "My video", description: "Description here", tags: ["a", "b c"], categoryId: "22" },
      status: { privacyStatus: "public", selfDeclaredMadeForKids: false },
    });
    const put = m.requests[1];
    expect(put.headers["content-range"]).toBe(`bytes 0-${5 * MiB - 1}/${5 * MiB}`);
  });

  it("streams 256MiB chunks from R2 following the server's Range offsets", async () => {
    const total = 600 * MiB + 123;
    // The server keeps 1 byte less of the first chunk: the next chunk must restart from its reported offset.
    const m = mockFetch([sessionRoute, ["PUT " + SESSION, fakeSession(total, { keepLess: 1 })]]);
    const ctx = hollowMedia(testContext(m.fetch, app));
    const ranges: Array<[number, number]> = [];
    ctx.media.rangeStream = async (_item, offset, length) => (ranges.push([offset, length]), lazyStream(1));
    ctx.media.range = async () => {
      throw new Error("must not copy video bytes into memory");
    };
    const res = await youtube.publish(ctx, testAccount(), post({ media: [video({ size: total })] }));
    expect(res).toMatchObject({ status: "published", externalId: "VID123" });
    const puts = m.requests.filter((r) => r.method === "PUT").map((r) => r.headers["content-range"]);
    expect(puts).toEqual([
      `bytes 0-${256 * MiB - 1}/${total}`,
      `bytes ${256 * MiB - 1}-${512 * MiB - 2}/${total}`,
      `bytes ${512 * MiB - 1}-${total - 1}/${total}`,
    ]);
    expect(ranges).toEqual([
      [0, 256 * MiB],
      [256 * MiB - 1, 256 * MiB],
      [512 * MiB - 1, total - (512 * MiB - 1)],
    ]);
    // Non-final chunks are multiples of 256KiB.
    expect((256 * MiB) % (256 * 1024)).toBe(0);
  });

  it("uploads a 2GB+ video within the per-call subrequest budget and resumes without a new session", async () => {
    const total = 2048 * MiB + 5 * MiB;
    const m = mockFetch([sessionRoute, ["PUT " + SESSION, fakeSession(total)]]);
    const ctx = hollowMedia(testContext(m.fetch, app));
    const first = await youtube.publish(ctx, testAccount(), post({ media: [video({ size: total })] }));
    expect(first.status).toBe("pending");
    const firstCall = m.requests.length;
    expect(firstCall).toBe(9); // session + 8 PUTs of 256MiB
    expect(firstCall).toBeLessThanOrEqual(40);
    const state = (first as any).state;
    expect(state.uploadUrl).toBe(SESSION);

    const second = await youtube.checkStatus!(ctx, testAccount(), JSON.parse(JSON.stringify(state)));
    expect(second).toMatchObject({ status: "published", externalId: "VID123" });
    const after = m.requests.slice(firstCall);
    expect(after.length).toBeLessThanOrEqual(40);
    expect(after[0].headers["content-range"]).toBe(`bytes */${total}`);
    expect(after[1].headers["content-range"]).toBe(`bytes ${2048 * MiB}-${total - 1}/${total}`);
    // Only one session was ever created.
    expect(m.requests.filter((r) => r.method === "POST")).toHaveLength(1);
  });

  it("checkStatus returns the video when the session already completed", async () => {
    const m = mockFetch([["PUT " + SESSION, () => json({ id: "VIDDONE" }, 200)]]);
    const res = await youtube.checkStatus!(testContext(m.fetch, app), testAccount(), {
      uploadUrl: SESSION,
      video: video(),
      thumbnail: null,
      playlistId: null,
    });
    expect(res).toMatchObject({ status: "published", externalId: "VIDDONE" });
    expect(m.requests).toHaveLength(1);
  });

  it("returns pending (not an error) when a chunk hits a 5xx", async () => {
    const m = mockFetch([sessionRoute, ["PUT " + SESSION, () => json({ error: { message: "backend" } }, 503)]]);
    const res = await youtube.publish(testContext(m.fetch, app), testAccount(), post());
    expect(res.status).toBe("pending");
  });

  it("sets the attached image as thumbnail, adds to playlist and forces private with publishAt", async () => {
    const m = mockFetch([
      sessionRoute,
      ["PUT " + SESSION, fakeSession(5 * MiB)],
      ["POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set", () => ({ items: [] })],
      ["POST https://www.googleapis.com/youtube/v3/playlistItems", () => ({ id: "PI" })],
    ]);
    const res = await youtube.publish(
      testContext(m.fetch, app),
      testAccount(),
      post({
        media: [video({ size: 5 * MiB }), image({ mime: "image/png", size: 3_000_000 })],
        settings: { title: "T", privacy: "public", playlist: "PL1", publishAt: "2030-01-01T10:00:00.000Z", shorts: true },
      }),
    );
    expect(res.status).toBe("published");
    expect(m.requests[0].json.status).toMatchObject({ privacyStatus: "private", publishAt: "2030-01-01T10:00:00.000Z" });
    expect(m.requests[0].json.snippet.title).toBe("T #Shorts");
    const thumb = m.requests.find((r) => r.url.includes("thumbnails/set"))!;
    expect(thumb.url).toContain("videoId=VID123");
    expect(thumb.headers["content-type"]).toBe("image/jpeg"); // re-encoded: >2MB PNG
    const pl = m.requests.find((r) => r.url.includes("playlistItems"))!;
    expect(pl.json).toEqual({ snippet: { playlistId: "PL1", resourceId: { kind: "youtube#video", videoId: "VID123" } } });
  });

  it("a failed thumbnail only warns", async () => {
    const m = mockFetch([
      sessionRoute,
      ["PUT " + SESSION, fakeSession(5 * MiB)],
      ["POST https://www.googleapis.com/upload/youtube/v3/thumbnails/set", () => json({ error: { message: "nope" } }, 403)],
    ]);
    const ctx = testContext(m.fetch, app);
    const res = await youtube.publish(ctx, testAccount(), post({ media: [video({ size: 5 * MiB }), image()] }));
    expect(res.status).toBe("published");
    expect(ctx.logs.some((l) => l.startsWith("warn") && l.includes("thumbnail"))).toBe(true);
  });

  it("posts the first comment on the root video", async () => {
    const m = mockFetch([["POST https://www.googleapis.com/youtube/v3/commentThreads", () => ({ id: "CMT1" })]]);
    const r = await youtube.reply!(testContext(m.fetch, app), testAccount(), { rootId: "VID123", parentId: "VID123" }, {
      id: "p1-r1",
      content: "First!",
      media: [],
      settings: {},
    });
    expect(r).toEqual({ externalId: "CMT1", url: "https://www.youtube.com/watch?v=VID123&lc=CMT1" });
    expect(m.requests[0].json).toEqual({ snippet: { videoId: "VID123", topLevelComment: { snippet: { textOriginal: "First!" } } } });
  });

  it("loads categories and playlists", async () => {
    const m = mockFetch([
      [
        "GET https://www.googleapis.com/youtube/v3/videoCategories",
        () => ({ items: [{ id: "22", snippet: { title: "People & Blogs", assignable: true } }, { id: "18", snippet: { title: "Short Movies", assignable: false } }] }),
      ],
      [/playlists\?.*pageToken=N2/, () => ({ items: [{ id: "PL2", snippet: { title: "Two" } }] })],
      ["GET https://www.googleapis.com/youtube/v3/playlists", () => ({ items: [{ id: "PL1", snippet: { title: "One" } }], nextPageToken: "N2" })],
    ]);
    const ctx = testContext(m.fetch, app);
    const acc = testAccount({ meta: { country: "DE" } });
    expect(await youtube.options!(ctx, acc, "category", {})).toEqual([{ value: "22", label: "People & Blogs" }]);
    expect(m.requests[0].url).toContain("regionCode=DE");
    expect(await youtube.options!(ctx, acc, "playlist", {})).toEqual([
      { value: "", label: "None" },
      { value: "PL1", label: "One" },
      { value: "PL2", label: "Two" },
    ]);
  });

  it("maps 401 to auth and quota errors to readable invalid errors", async () => {
    const m401 = mockFetch([["POST https://www.googleapis.com/upload/youtube/v3/videos", () => json({ error: { message: "Invalid Credentials" } }, 401)]]);
    await expect(youtube.publish(testContext(m401.fetch, app), testAccount(), post())).rejects.toMatchObject({ kind: "auth" });

    const mq = mockFetch([
      [
        "POST https://www.googleapis.com/upload/youtube/v3/videos",
        () => json({ error: { code: 403, message: "quota", errors: [{ reason: "uploadLimitExceeded" }] } }, 403),
      ],
    ]);
    const err = await youtube.publish(testContext(mq.fetch, app), testAccount(), post()).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.kind).toBe("invalid");
    expect(err.message).toContain("daily YouTube upload limit");
  });

  it("validates media and description", () => {
    expect(youtube.validate!(post({ media: [image()] }))).toContain("YouTube: attach exactly one video");
    expect(youtube.validate!(post({ content: "a <b>" }))).toContain("YouTube: the description cannot contain < or >");
    expect(youtube.validate!(post())).toEqual([]);
  });
});

describe("youtube metrics", () => {
  const API = "https://www.googleapis.com/youtube/v3";
  const acc = () => testAccount({ externalId: "UC1", meta: { channelId: "UC1" } });
  const item = (externalId: string) => ({ externalId, publishedAt: 0 });

  it("requests youtube.readonly and describes the metrics", () => {
    const url = new URL(youtube.authorize!(testContext(mockFetch([]).fetch, app, "youtube"), { state: "S", codeVerifier: "V", codeChallenge: "C" }) as string);
    expect(url.searchParams.get("scope")).toContain("https://www.googleapis.com/auth/youtube.readonly");
    expect(youtube.metrics).toMatchObject({ batch: 50, post: ["views", "likes", "comments"], account: ["followers", "posts"] });
  });

  it("fetches a batch in one videos.list call; missing videos are null", async () => {
    const m = mockFetch([
      [
        `GET ${API}/videos`,
        () => ({
          items: [
            { id: "A", statistics: { viewCount: "100", likeCount: "7", commentCount: "2", favoriteCount: "0" } },
            // likes hidden by the owner: likeCount absent
            { id: "B", statistics: { viewCount: "5", commentCount: "0", favoriteCount: "0" } },
          ],
        }),
      ],
    ]);
    const ids = Array.from({ length: 50 }, (_, i) => (i === 0 ? "A" : i === 1 ? "B" : `X${i}`));
    const res = await youtube.postMetrics!(testContext(m.fetch, app), acc(), ids.map(item));
    expect(m.requests).toHaveLength(1);
    const q = new URL(m.requests[0].url).searchParams;
    expect(q.get("part")).toBe("statistics");
    expect(q.get("id")).toBe(ids.join(","));
    expect(m.requests[0].headers.authorization).toBe("Bearer AT");
    expect(res.A).toEqual({ views: 100, likes: 7, comments: 2, extra: { favorites: 0 } });
    expect(res.B).toEqual({ views: 5, comments: 0, extra: { favorites: 0 } });
    expect(res.X2).toBeNull();
    expect(Object.keys(res)).toHaveLength(50);
  });

  it("a 403 scope error means reconnect for analytics, not auth", async () => {
    const m = mockFetch([
      [
        `GET ${API}/videos`,
        () => json({ error: { code: 403, message: "Request had insufficient authentication scopes.", status: "PERMISSION_DENIED", details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } }, 403),
      ],
      [`GET ${API}/channels`, () => json({ error: { code: 403, errors: [{ reason: "insufficientPermissions" }] } }, 403)],
    ]);
    const err = await youtube.postMetrics!(testContext(m.fetch, app), acc(), [item("A")]).catch((e) => e);
    expect(err).toBeInstanceOf(MetricsUnavailableError);
    expect(err.reason).toBe("reconnect_required");
    await expect(youtube.accountMetrics!(testContext(m.fetch, app), acc())).rejects.toMatchObject({ reason: "reconnect_required" });
  });

  it("quota errors stay ProviderErrors", async () => {
    const m = mockFetch([[`GET ${API}/videos`, () => json({ error: { code: 403, errors: [{ reason: "quotaExceeded" }] } }, 403)]]);
    const err = await youtube.postMetrics!(testContext(m.fetch, app), acc(), [item("A")]).catch((e) => e);
    expect(err).toBeInstanceOf(ProviderError);
    expect(err.message).toMatch(/quota/);
  });

  it("account metrics from channels.list; hidden subscriber counts are left out", async () => {
    const m = mockFetch([
      [`GET ${API}/channels`, () => ({ items: [{ id: "UC1", statistics: { viewCount: "9000", subscriberCount: "120", hiddenSubscriberCount: false, videoCount: "33" } }] })],
    ]);
    expect(await youtube.accountMetrics!(testContext(m.fetch, app), acc())).toEqual({ followers: 120, posts: 33, extra: { channel_views: 9000 } });
    const q = new URL(m.requests[0].url).searchParams;
    expect(q.get("id")).toBe("UC1");
    expect(q.get("part")).toBe("statistics");

    const hidden = mockFetch([[`GET ${API}/channels`, () => ({ items: [{ id: "UC1", statistics: { viewCount: "1", subscriberCount: "0", hiddenSubscriberCount: true, videoCount: "2" } }] })]]);
    expect(await youtube.accountMetrics!(testContext(hidden.fetch, app), acc())).toEqual({ posts: 2, extra: { channel_views: 1 } });
  });
});
