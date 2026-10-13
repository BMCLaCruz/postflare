---
name: postflare
description: Schedule and publish social media posts (Instagram, TikTok, X, Bluesky, Threads, YouTube, LinkedIn, Facebook, Pinterest, Reddit, Mastodon and more) and read post analytics with the `postflare` CLI for a self-hosted Postflare instance. Use when the user wants to post, schedule, cross-post, draft, reschedule or cancel social posts, upload media for them, check why a post failed, or report on post/account performance (views, engagement, followers, top posts) in Postflare.
---

# Postflare CLI

`postflare` talks to the user's Postflare instance with an API key bound to one workspace. Add `--json` to any command
for machine-readable output (prefer it when you need ids or numbers). Exit codes: 0 ok, 1 error (message from the
server), 2 usage error (bad flag/argument; the message says what to fix). `postflare <command> --help` has examples.

## 1. Check access first

```bash
postflare whoami
```
"Not logged in" → ask the user to run `postflare login --url https://<their-postflare>` (it prompts for the API key from
Postflare → Profile → API keys). Never ask them to paste the key into the chat. Check the permissions line: posting
needs `posts.write`, uploading `media.write`. A `warning:` on stderr about the server's API version means the CLI and
the server are out of step: relay its suggestion (update the CLI or the server); `postflare version` shows both.

## 2. Learn the targets before writing

```bash
postflare accounts                 # ids, platform, @username, status, followers, analytics state
postflare platforms --connected    # limits: max length, media, threads, settings (* = required)
postflare platforms tiktok         # every setting of a platform with its options and defaults
postflare accounts options <account> <key>   # choices of dynamic settings (Pinterest board, subreddit, TikTok privacy)
```
Accounts with STATUS `reconnect` or `disabled` cannot publish: tell the user to reconnect in the app.
Write text per platform limits (X 280 unless the account has Premium, Bluesky 300, Threads 500, Instagram/TikTok
2200 with ≤30 hashtags on Instagram). If texts must differ per platform, create one post per platform.

## 3. Media

```bash
postflare media upload clip.mp4 cover.jpg --alt "What the image shows" --json   # → ids med_...
postflare media import https://example.com/photo.jpg
postflare upload-link --note "Photos for Friday" --wait   # user uploads from a phone; prints media ids
```
`post --media` also accepts local paths directly (uploaded first). Files >90MB use multipart automatically.

## 4. Create the post

```bash
postflare post -a <account> [-a <account>...] --text "..." [-m <id|path>...] \
  (--at "<when>" | --now | --draft) [--set key=value | --set <platform>.key=value ...] [--thread "..."...] [--dry-run]
```
- `-a`: account id (safest), `@username`, platform id (if only one account there), or `platform:@username`.
- `--at`: user's local time: `"2026-10-14 09:00"`, `"tomorrow 9:00"`, `"fri 18:00"`, `"in 2h"`, or ISO with offset.
  Confirm the date/time with the user when ambiguous; never publish `--now` unless they asked to publish immediately.
- Long or multi-line text: write it to a file and use `--text-file caption.txt` (avoids shell quoting issues).
- Run with `--dry-run` first when unsure; it validates against every platform's rules.
- Missing required settings are reported with the exact `--set` to add.

## 5. Verify

```bash
postflare posts show <id>        # status, schedule, publishing log, error, URL, metrics
postflare posts --upcoming       # what is queued
postflare posts --status failed  # then: posts show <id>, fix with posts edit, posts retry <id>
```
`posts edit <id> --at ... --text ... --set ...` reschedules/changes draft, scheduled, failed or cancelled posts.
`posts cancel <id>` unschedules; `posts rm <id>` deletes from Postflare only (not from the platform).
`needs_check` status: the publish request failed in a way that does not tell whether the platform accepted the post
(timeout, network error, 5xx). It is never retried automatically. Ask the user to check the profile (or check it yourself),
then `posts resolve <id> --published [--url URL]` if it is live, or `posts resolve <id> --retry` if it is not
(retrying a post that did go through publishes a duplicate). List them with `posts --status needs_check`.

## Recipes

**Reel to Instagram + TikTok** (a single video on Instagram is posted as a Reel):
```bash
postflare platforms tiktok    # check privacy options
postflare post -a instagram_standalone -a tiktok -m reel.mp4 --text-file caption.txt --at "fri 18:00" \
  --set tiktok.privacy_level=PUBLIC_TO_EVERYONE --set tiktok.allowComment=true --dry-run
# then the same command without --dry-run; then postflare posts show <id>
```
(`instagram` = Instagram via Facebook login, `instagram_standalone` = Instagram login; use whichever the account has.)

**Thread on X and Bluesky:**
```bash
postflare post -a x -a bluesky --text "1/ We rebuilt our onboarding" \
  --thread "2/ The old flow lost 40% of users at step 3" --thread "3/ Here is what we changed..." --at "tomorrow 9:00"
```
Each part must fit the smallest limit (Bluesky 300).

**YouTube:** `--set title="..."` is required; privacy defaults to `private` (`--set privacy=public`), Shorts:
`--set shorts=true`.

**Weekly performance report:**
```bash
postflare analytics --range 7d --json        # totals vs previous 7 days, byProvider, byAccount, followers
postflare analytics top --range 7d --sort engagementRate --limit 5 --json
postflare accounts --json                    # analytics status per account
```
Report: posts published, views/impressions, engagements, engagement rate (and change vs the previous period), follower
change, best/worst posts with links, and what to repeat. Metrics are collected ~1h, 24h, 3d, 7d, 30d after publishing,
so the newest posts are incomplete; `postflare analytics refresh --post <id>` collects one now.

## Pitfalls

- **TikTok privacy must be chosen** (`privacy_level`, no default; options per account: `postflare accounts options
  tiktok privacy_level`). Unaudited TikTok apps can only post `SELF_ONLY` ("Only me") and the TikTok account itself
  must be private; such posts have no public URL and no metrics. `--set postMode=inbox` sends a draft to the TikTok app
  instead.
- **Instagram needs media** (JPEG images only, convert PNG/WebP/HEIC first; carousels up to 10). Stories:
  `--set post_type=story`. TikTok, YouTube and Pinterest need media too; Pinterest needs `--set board=<id>`.
- Mixing images and videos is not allowed on X, Bluesky, TikTok, LinkedIn, Facebook (check `platforms`).
- Analytics `reconnect_required`: the account was connected before analytics permissions existed; the user must
  add the scope to their developer app and reconnect the account in the app (publishing still works). TikTok analytics
  also need the app-reviewed scopes; X analytics need a paid X API plan; `not_supported` platforms have none.
- Engagement rate = engagements / views (else impressions, else reach); metrics count for the day a post was published.
- The live demo workspace (whoami says demo) only simulates publishing.
- Do not delete or cancel posts the user did not mention; confirm bulk changes first.
