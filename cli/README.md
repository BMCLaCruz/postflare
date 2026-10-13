# postflare (CLI)

Command line client for Postflare, the self-hosted social media scheduler on Cloudflare: schedule
posts to 36 platforms, upload media, and read analytics from your terminal or from an AI agent (Claude Code...).

- Node.js 20+, no runtime dependencies.
- Human-friendly tables by default, `--json` on every command for scripts and agents.
- Exit codes: `0` ok, `1` error (API errors print the server's message), `2` usage error.

## Install

```bash
npm i -g postflare
postflare --help       # `pf` is a short alias: pf posts --upcoming
```

From a clone of the repo instead: `npm run cli:build && npm i -g ./cli`.

## Log in

Create an API key in Postflare → **Profile → API keys**. A key belongs to one workspace and acts with your
permissions there.

```bash
postflare login --url https://postflare.example.com    # asks for the key without echoing it
echo "$KEY" | postflare login --url https://postflare.example.com
postflare whoami
```

Credentials are saved to `~/.config/postflare/config.json` (mode 0600; `$XDG_CONFIG_HOME` is honored,
`POSTFLARE_CONFIG` overrides the path). Several instances/workspaces: `postflare login --profile work ...`, then
`--profile work` on any command or `POSTFLARE_PROFILE=work`. `POSTFLARE_URL` + `POSTFLARE_API_KEY` override the saved
profile (handy in CI). `postflare logout [--profile x | --all]`.

## Commands

| Command | |
|---|---|
| `whoami`, `workspaces` | User, workspace and permissions of the key |
| `accounts [--platform id]` | Connected accounts, status, followers, analytics state |
| `accounts options <account> <key>` | Choices of a dynamic setting (Pinterest boards, subreddits, TikTok privacy...) |
| `platforms [id] [--connected]` | Limits and per-post settings of each platform (`platforms tiktok` lists every field and option) |
| `media upload <files...> [--alt]` | Upload (streamed; >90MB uses multipart, up to 5GB, with a progress bar) |
| `media list`, `media import <url>`, `media rm <ids...>` | Media library |
| `upload-link [--note] [--wait]` | One-time upload page (send photos from a phone); `--wait` prints the media ids |
| `post ...` | Create posts (see below) |
| `posts [--status] [--upcoming] [--from] [--to] [-a]` | List posts |
| `posts show <id>` | Post with its publishing log and metrics |
| `posts edit <id> [--text] [--at] [--set] [--media] [--thread]` | Edit / reschedule |
| `posts cancel\|retry\|rm <ids...>` | |
| `analytics [--range 7d\|30d\|90d \| --from --to] [-a] [--platform]` | KPIs vs the previous period, per platform/account, top posts |
| `analytics top [--sort views\|engagements\|engagementRate\|publishedAt] [--limit]` | Best posts |
| `analytics refresh --post <id> \| --account <selector>` | Collect metrics now |

`postflare <command> --help` shows every option with examples.

### Creating posts

```bash
# Same text to X and Bluesky tomorrow at 9:00 (local time)
postflare post -a x -a bluesky --text "Shipping v2 today" --at "tomorrow 9:00"

# A Reel to Instagram + TikTok, uploading the file first
postflare post -a instagram_standalone -a tiktok -m reel.mp4 --text-file caption.txt --at "fri 18:00" \
  --set tiktok.privacy_level=PUBLIC_TO_EVERYONE --set tiktok.allowComment=true

# A thread, published now
postflare post -a x --text "1/ How we cut our build time" --thread "2/ ..." --thread "3/ ..." --now

# Validate only
postflare post -a youtube -m video.mp4 --set title="Launch" --draft --dry-run
```

- `--account/-a` (repeatable or comma separated): account id, `@username`, a platform id when you have one account
  there, an account name, or `platform:@username`. Ambiguous or unknown selectors list the candidates.
- Text: `--text`, `--text-file <path>`, `--text -` / `--text-file -` (stdin), or just pipe it.
- `--media/-m`: media ids (`med_...`) or local files (uploaded first; width/height/duration are read from the file).
- When: exactly one of `--at <when>`, `--now`, `--draft`. `--at` understands `"2026-10-14 09:00"`, `"tomorrow 9am"`,
  `"mon 18:00"`, `"next fri 10:00"`, `"18:00"`, `"in 2h"`, `"in 30m"`, ISO dates with an offset, ms timestamps. Times are
  local unless the ISO date has an offset.
- `--set key=value` fills a platform setting for every selected platform that has it; `--set tiktok.key=value` or
  `--set acc_xxx.key=value` targets one. Values are checked against the field type and options (`postflare platforms <id>`).
  Field defaults are filled in like in the web composer. Required settings that are missing are reported with the
  `--set` to add before anything is uploaded.
- `--thread "text"` (repeatable): follow-ups (thread replies, first comment) for platforms that support them.

### Scripting

```bash
id=$(postflare media upload clip.mp4 --json | jq -r '.[0].id')
postflare post -a tiktok -m "$id" --set privacy_level=SELF_ONLY --now --json | jq -r '.[].id'
postflare analytics --range 7d --json | jq '.summary.totals'
```

## Development

```bash
npm run cli:build       # tsc → cli/dist
npm run cli:typecheck   # src + tests
npx vitest run --project cli
```

Sources are in `cli/src` (TypeScript, ESM, only Node built-ins), tests in `cli/test` (part of the repo's vitest
projects).

## License

AGPL-3.0-only
