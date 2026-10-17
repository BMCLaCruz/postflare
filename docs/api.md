# Postflare REST API

Base: `https://<host>/api`. JSON in and out; errors are `{ "error": "message" }` with a 4xx/5xx status (validation
errors also carry `errors: string[]`). Types: [`shared/types.ts`](../shared/types.ts). Authentication: the web app's
session cookie (plus `X-Workspace-Id`), or `Authorization: Bearer pf_...` (an API key bound to one workspace, created in
Profile). Every endpoint is workspace-scoped: ids of other workspaces answer 404. Permissions are listed per endpoint
(catalog: [workspaces-spec.md](workspaces-spec.md)).

This file documents the account group and App Store campaign endpoints in detail and lists the changes they brought to existing
endpoints. The rest of the API (accounts, media, posts, analytics, playbooks, users, workspaces) is summarized in the
README ("API & MCP", "Analytics", "Playbooks") and typed in `shared/types.ts`.

## Account groups

Workspace-scoped "brand / project" folders for accounts (migration `0010_account_groups.sql`). An account is in at most
one group; deleting a group ungroups its accounts. Reading needs `accounts.read`, every change `accounts.manage`. Ids of
other workspaces answer 404, and a group of another workspace can never be assigned.

- `GET /account-groups` → `AccountGroupDTO[]` `{ id, name, color, position, accountCount, createdAt, updatedAt }`, in
  display order.
- `POST /account-groups` `{ name, color? }` → 201 `AccountGroupDTO`. `name`: 1–50 characters, unique per workspace
  (case-insensitive, 409 otherwise). `color`: one of `zinc red orange amber green teal sky indigo violet pink`
  (`shared/accountGroups.ts`); without one the palette is cycled. New groups go last.
- `PATCH /account-groups/:id` `{ name?, color?, position? }` → `AccountGroupDTO`. `position` moves the group to that
  index (clamped) and renumbers the others.
- `DELETE /account-groups/:id` → `{ ok, ungrouped }` (number of accounts that became ungrouped).
- `PATCH /accounts/:id` `{ groupId }` (group id or `null`; `status` still works, alone or together) → `AccountDTO`.
- `POST /accounts/group` `{ accountIds: string[], groupId: string | null }` → `{ ok, updated, groupId }`: bulk move
  (at most 500 ids, one statement). Any id not in the workspace → 404 and nothing changes.
- `AccountDTO.groupId` (`null` = ungrouped). `GET /posts?accountGroupId=<id>|none`: posts of the group's accounts.
- MCP: `list_accounts` returns each account's `group: { id, name }` (absent when ungrouped) and takes `group` (id or
  name, `"none"` = ungrouped); `list_account_groups` lists `{ id, name, accounts }`.
- CLI: `pf groups [create|rename|rm]`, `pf accounts` GROUP column and `--group`, `pf accounts group <account...> --to
  <group|none>`, and the `group:<name|id>` account selector (`pf post -a "group:Party Games"`: every enabled account of
  the group).

## App Store campaign links

Posts about one of your App Store apps get a **tracked link** `https://<host>/a/<code>` (8 base62 characters) that
counts clicks and redirects (302) to Apple's campaign link:

```
https://apps.apple.com/app/apple-store/id<APP_ID>?pt=<PROVIDER_TOKEN>&ct=<CAMPAIGN_TOKEN>&mt=8
```

This is the format Apple documents in App Store Connect Help,
[Campaign links](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links)
(`pt` = provider token, one per developer account; `ct` = campaign token, "up to 30 alphanumeric characters and spaces"
plus some punctuation; `mt=8` = apps).

- **Campaign tokens**: `pf-<platform>-<10 chars derived from the post id>` (e.g. `pf-x-0k3j9a8z1q`, `pf-bsky-…`),
  lowercase `[a-z0-9-]`, at most 18 characters, stable for a post (a post belongs to one account, so one platform).
  Bio links: `pf-<platform>-bio` (`-bio-2`, `-bio-3` for further accounts of the same platform and app).
- **Where links are created**: posts tagged with an app (`appId`) on clickable platforms: X, Threads, Bluesky,
  LinkedIn (profile and page), Facebook, Pinterest (destination link), Reddit, Mastodon, YouTube (description),
  Telegram, Discord, Slack, Tumblr, Lemmy, Farcaster, Nostr, VK. Instagram and TikTok captions are not clickable:
  use the account's bio link (`POST /api/campaigns/bio-links`).
- **Auto-insert** (workspace setting `autoLink`, per post `autoLink: true|false`): when a post is created or updated,
  App Store URLs of its app (`apps.apple.com/…/id<n>…`, without their own `ct=`) in the text and follow-ups are
  replaced by the tracked link, Pinterest's destination link / Reddit's link URL are filled, and the link is appended
  when the post has no link at all. A change that would exceed the platform's limit is skipped (X counts a URL as 23)
  and logged on the post. Rewriting happens at create/update time, so the post shows the exact text that will be
  published; the publish workflow is unchanged.
- **Results**: clicks are counted by Postflare (one counter per link and UTC day; crawlers, link-preview bots, HTTP
  libraries and HEAD requests are redirected but not counted). Downloads, redownloads, purchases, proceeds and sales
  per campaign token come from Apple App Analytics through an optional [Revflare](https://github.com/FerdiKT/revflare)
  connection, synced every 6 hours per workspace by the hourly analytics cron tick. Apple's numbers lag 2–3 days,
  campaign rows with fewer than 5 users are withheld (Detailed reports) and proceeds are Apple's estimate.

### Public redirect

`GET /a/<code>` (no auth): 302 to the App Store campaign link (`Cache-Control: private, no-store`,
`Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex`); unknown or malformed codes answer a 404 HTML page. One D1
read, plus one upsert per counted click. Nothing about the post, account or workspace is exposed.

### Settings (`posts.read` to read, `workspace.manage` to change)

- `GET /campaigns/settings` → `CampaignSettingsDTO`
  `{ providerToken, autoLink, revflare: { url, keyConfigured, status, message, syncedAt, nextSyncAt, currency }, linkBase }`.
  The Revflare API key is never returned.
- `PUT /campaigns/settings` `{ providerToken?, autoLink?, revflareUrl?, revflareKey? }` → `CampaignSettingsDTO`.
  `revflareUrl`: https only, public hosts only (no localhost, private/link-local IPs, `.internal`/`.local` names;
  `http://localhost` is accepted only when Postflare itself runs on localhost); a trailing `/api/v1` is removed.
  `revflareKey`: `rf_...`, stored encrypted (AES-GCM, like platform credentials). `revflareKey: null` (or `""`)
  disconnects (synced numbers stay). New connection details schedule a sync on the next hourly tick.
- `POST /campaigns/test` `{ revflareUrl?, revflareKey? }` → `{ ok, error?, apps?, currency? }`: tests the given or stored
  connection (`GET /api/v1/apps` on Revflare, 10 s timeout, redirects not followed).
- `POST /campaigns/sync` → `{ ok, error?, campaigns?, currency?, asOf? }` (502 on failure): sync now
  (`GET /api/v1/acquisition/campaigns` and `GET /api/v1/acquisition?by=app,campaign&range=all`).

### Apps (`posts.read` to read, `workspace.manage` to change)

- `GET /apps` → `AppDTO[]` `{ id, appStoreId, name, iconUrl, revflareAppId, createdAt }`.
- `POST /apps` `{ appStoreId, name?, iconUrl? }` → 201 `AppDTO`. Without a name, name and icon come from the public
  iTunes lookup (`https://itunes.apple.com/lookup?id=<id>`). Adding an existing App Store id updates it.
- `POST /apps/import` → `{ imported, apps }`: apps with an App Store id from Revflare (`GET /api/v1/apps`).
- `DELETE /apps/:id`: posts lose the tag; tracked links already published keep redirecting.

### Links

- `GET /campaigns/links?postId&accountId&appId&kind=post|bio&limit` (`posts.read`) → `CampaignLinkDTO[]`
  `{ code, kind, trackedUrl, appStoreUrl, ct, postId, accountId, provider, appId, appStoreId, createdAt, clicks,
  downloads, redownloads, purchases, proceeds, sales, currency, asOf }` (App Store numbers `null` until reported).
- `POST /campaigns/bio-links` `{ accountId, appId }` (`posts.write`) → 201 `CampaignLinkDTO`: the account's bio link for
  the app, created on first use (needs the provider token).

### Changes to existing endpoints

- `POST /posts`: `appId` (workspace app id, App Store id or app name; 404 when not in the workspace) and `autoLink`
  (`true`/`false`, absent = workspace default). `PATCH /posts/:id`: the same; `appId: null` removes the tag. Edits keep
  the post's code and token; a new app points the same token at the new app. The text is rewritten only when the edit
  touches the text, settings, app or `autoLink` (a reschedule leaves it alone).
- `PostDTO`: `appId`, `autoLink`; `GET /posts/:id` adds `campaign: CampaignLinkDTO | null`.
- `GET /posts/:id/metrics` and `GET /analytics/posts` items: `campaign: { clicks, downloads, redownloads, purchases,
  proceeds, sales, currency, asOf } | null`. `GET /analytics/posts?sort=` also takes `clicks`, `downloads` (alias
  `installs`) and `proceeds`.
- `GET /analytics/summary`: totals, `byProvider` and `byAccount` rows add `campaignPosts`, `clicks`, `downloads`,
  `redownloads`, `proceeds` (posts published in the range); the summary adds `currency`.
- `GET /playbooks/stats?sort=lift|downloads|proceeds|downloadsPerPost|proceedsPerPost` (aliases `installs`, `revenue`):
  rows add `campaignPosts`, `clicks`, `downloads`, `proceeds`, `downloadsPerPost`, `proceedsPerPost`; the response adds
  `sort` and `currency`. Still one aggregate query.

### MCP

`create_post` / `update_post` take `appId` and `autoLink`; new tools `list_apps` and `get_bio_link`;
`get_post_metrics`, `get_top_posts` (sort `clicks`, `installs`, `proceeds`), `get_analytics_summary` and
`get_playbook_stats` (sort `installs`, `proceeds`, `installsPerPost`, `proceedsPerPost`) include clicks, installs and
proceeds.

### Revflare key permissions

Any Revflare workspace API key whose user can read the workspace (role viewer or above) works: Postflare only reads
`/apps`, `/acquisition` and `/acquisition/campaigns`. Revflare must import Apple's App Analytics reports for the apps
(App Store Connect key with the Admin role to create the report requests, see Revflare's docs).
