import { commandHelp, parseCommand, splitCommand } from "./args.js";
import { accountOptions, accounts, platforms } from "./commands/accounts.js";
import { analytics, analyticsRefresh, analyticsTop } from "./commands/analytics.js";
import { login, logout, whoami, workspaces } from "./commands/auth.js";
import { mediaAlias, mediaImport, mediaList, mediaRm, mediaUpload } from "./commands/media.js";
import { post, posts, postsCancel, postsEdit, postsRetry, postsRm, postsShow } from "./commands/posts.js";
import { uploadLink } from "./commands/uploadlink.js";
import { Ctx, type Command, type Deps } from "./context.js";
import { ApiError, CliError, UsageError } from "./errors.js";
import { c, eprintln, println, setColor, truncate } from "./format.js";
import { VERSION } from "./version.js";

export const COMMANDS: Command[] = [
  login,
  logout,
  whoami,
  workspaces,
  accounts,
  accountOptions,
  platforms,
  mediaUpload,
  mediaList,
  mediaImport,
  mediaRm,
  mediaAlias,
  post,
  posts,
  postsShow,
  postsEdit,
  postsCancel,
  postsRetry,
  postsRm,
  analytics,
  analyticsTop,
  analyticsRefresh,
  uploadLink,
];

const GROUPS: Array<[string, string[]]> = [
  ["Setup", ["login", "logout", "whoami", "workspaces"]],
  ["Accounts & platforms", ["accounts", "accounts options", "platforms"]],
  ["Media", ["media upload", "media list", "media import", "media rm", "upload-link"]],
  ["Posts", ["post", "posts", "posts show", "posts edit", "posts cancel", "posts retry", "posts rm"]],
  ["Analytics", ["analytics", "analytics top", "analytics refresh"]],
];

export function mainHelp(): string {
  const byName = new Map(COMMANDS.map((c) => [c.name, c]));
  const w = Math.max(...COMMANDS.map((c) => (c.name + (c.args ? ` ${c.args}` : "")).length));
  const room = process.stdout.isTTY && process.stdout.columns ? Math.max(process.stdout.columns - w - 4, 30) : Infinity;
  const lines = [
    `postflare ${VERSION}: schedule social posts, upload media and read analytics on your Postflare instance.`,
    "",
    "Usage: postflare <command> [options]",
  ];
  for (const [title, names] of GROUPS) {
    lines.push("", `${title}:`);
    for (const n of names) {
      const cmd = byName.get(n)!;
      lines.push(`  ${(cmd.name + (cmd.args ? ` ${cmd.args}` : "")).padEnd(w)}  ${room === Infinity ? cmd.summary : truncate(cmd.summary, room)}`);
    }
  }
  lines.push(
    "",
    "Global options: --json (machine-readable output on every command), --profile <name>, --no-color, -h/--help, --version",
    "Environment: POSTFLARE_URL, POSTFLARE_API_KEY, POSTFLARE_PROFILE, POSTFLARE_CONFIG (config path), NO_COLOR",
    "Exit codes: 0 ok, 1 error (API errors print the server's message), 2 usage error",
    "",
    "Examples:",
    "  postflare login --url https://postflare.example.com",
    "  postflare accounts",
    "  postflare post -a bluesky -a x --text \"Hello\" --at \"tomorrow 9:00\"",
    "  postflare post -a tiktok -m clip.mp4 --set privacy_level=SELF_ONLY --now",
    "  postflare analytics --range 7d",
    "",
    "Help for a command: postflare <command> --help",
  );
  return lines.join("\n");
}

/** Run the CLI; returns the exit code. */
export async function run(argv: string[], deps: Deps = {}): Promise<number> {
  if (argv.includes("--no-color")) setColor(false);
  if (argv[0] === "--version" || argv[0] === "-v" || argv[0] === "version") {
    println(VERSION);
    return 0;
  }
  const names = COMMANDS.map((c) => c.name);
  let { name, rest, words } = splitCommand(argv, names);
  // `postflare help <command>`
  if (words[0] === "help") {
    const sub = splitCommand(argv.slice(argv.indexOf("help") + 1), names);
    const cmd = COMMANDS.find((c) => c.name === sub.name);
    println(cmd ? commandHelp(cmd) : mainHelp());
    return 0;
  }
  if (!name) {
    if (!words.length) {
      println(mainHelp());
      return argv.some((a) => a === "-h" || a === "--help") || !argv.length ? 0 : 2;
    }
    eprintln(`${c.red("error:")} unknown command "${words[0]}"`);
    eprintln(`Run postflare --help for the list of commands.`);
    return 2;
  }
  const cmd = COMMANDS.find((c) => c.name === name)!;
  try {
    const parsed = parseCommand(cmd, rest);
    if (parsed.values["no-color"]) setColor(false);
    if (parsed.values.help) {
      println(commandHelp(cmd));
      return 0;
    }
    process.exitCode = undefined;
    await cmd.run(new Ctx(parsed, deps), parsed);
    return typeof process.exitCode === "number" ? process.exitCode : 0;
  } catch (err) {
    if (err instanceof UsageError) {
      eprintln(`${c.red("error:")} ${err.message}`);
      eprintln(c.gray(`See: postflare ${cmd.name} --help`));
      return 2;
    }
    if (err instanceof ApiError || err instanceof CliError) {
      eprintln(`${c.red("error:")} ${err.message}`);
      return 1;
    }
    eprintln(`${c.red("error:")} ${(err as Error)?.stack ?? String(err)}`);
    return 1;
  }
}
