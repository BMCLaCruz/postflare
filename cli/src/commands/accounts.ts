import { list, str } from "../args.js";
import type { Command } from "../context.js";
import { UsageError } from "../errors.js";
import { c, fmtNum, fmtStatus, println, printJson, table, truncate } from "../format.js";
import { buildSettings, resolveAccounts } from "../resolve.js";
import type { FieldDef, ProviderInfo } from "../types.js";

export const accounts: Command = {
  name: "accounts",
  summary: "List connected accounts with their status, followers and analytics state.",
  description:
    "STATUS is the publishing state (reconnect = token expired: reconnect it in the app). ANALYTICS: ok, pending (not\n" +
    "collected yet), reconnect_required (reconnect to grant the analytics permissions), not_supported, error.",
  options: { platform: { type: "string", arg: "<id>", description: "Only accounts of this platform" } },
  max: 0,
  examples: ["postflare accounts", "postflare accounts --platform tiktok --json"],
  async run(ctx, { values }) {
    let rows = await ctx.accounts();
    const platform = str(values.platform);
    if (platform) rows = rows.filter((a) => a.provider === platform);
    if (ctx.json) return printJson(rows);
    if (!rows.length) return println("No connected accounts. Connect them in the Postflare app (Accounts page).");
    println(
      table(
        [{ header: "ID" }, { header: "PLATFORM" }, { header: "NAME", flex: true }, { header: "USERNAME" }, { header: "STATUS" }, { header: "FOLLOWERS", align: "right" }, { header: "ANALYTICS" }],
        rows.map((a) => [
          a.id,
          a.provider,
          a.name,
          a.username ? `@${a.username.replace(/^@/, "")}` : "",
          fmtStatus(a.status),
          fmtNum(a.metricsStatus?.metrics?.followers),
          a.metricsStatus ? fmtStatus(a.metricsStatus.status) : "",
        ]),
      ),
    );
    const notes = rows.filter((a) => a.statusMessage || (a.metricsStatus && ["reconnect_required", "error"].includes(a.metricsStatus.status) && a.metricsStatus.message));
    for (const a of notes) {
      const msg = a.statusMessage ?? a.metricsStatus?.message;
      println(c.yellow(`  ${a.id}: ${truncate(msg, 160)}`));
    }
  },
};

export const accountOptions: Command = {
  name: "accounts options",
  args: "<account> <key>",
  summary: "Choices of a dynamic setting of an account (Pinterest boards, subreddits, Discord channels, TikTok privacy...).",
  options: { set: { type: "string", multiple: true, arg: "<key=value>", description: "Other settings the choices depend on" } },
  min: 2,
  max: 2,
  examples: ["postflare accounts options tiktok privacy_level", "postflare accounts options @myboards board --json"],
  async run(ctx, { values, positionals }) {
    const [account] = resolveAccounts([positionals[0]], await ctx.accounts());
    const provider = await ctx.provider(account.provider);
    const settings = buildSettings([{ account, provider }], list(values.set)).get(account.id) ?? {};
    const res = await ctx.api.get<Array<{ value: string; label: string }>>(`/accounts/${account.id}/options/${encodeURIComponent(positionals[1])}`, {
      settings: JSON.stringify(settings),
    });
    if (ctx.json) return printJson(res);
    if (!res.length) return println("No choices.");
    println(table([{ header: "VALUE" }, { header: "LABEL", flex: true }], res.map((o) => [o.value, o.label])));
    println(c.gray(`Use: --set ${provider.id}.${positionals[1]}=<VALUE>`));
  },
};

function fieldLine(f: FieldDef): string {
  const bits = [c.bold(f.key), c.gray(f.type)];
  if (f.required) bits.push(c.yellow("required"));
  if (f.default !== undefined && f.default !== "") bits.push(`default ${JSON.stringify(f.default)}`);
  if (f.showIf) bits.push(c.gray(`only if ${f.showIf.key}=${f.showIf.equals}`));
  if (f.maxLength) bits.push(`max ${f.maxLength} chars`);
  let s = `  ${bits.join("  ")}\n      ${f.label}${f.help ? c.gray(` — ${truncate(f.help, 160)}`) : ""}`;
  if (f.options?.length) s += `\n      options: ${f.options.map((o) => (o.label && o.label !== o.value ? `${o.value} (${o.label})` : o.value)).join(", ")}`;
  if (f.dynamicOptions) s += c.gray(`\n      choices per account: postflare accounts options <account> ${f.key}`);
  return s;
}

function mediaSummary(p: ProviderInfo): string {
  const m = p.capabilities.media;
  const parts: string[] = [];
  if (m.images) parts.push(`${m.images} img`);
  if (m.videos) parts.push(`${m.videos} vid`);
  if (!parts.length) return "none";
  return parts.join(" / ") + (m.required ? " (required)" : "");
}

export const platforms: Command = {
  name: "platforms",
  args: "[id]",
  summary: "Platforms with their limits and per-post settings; `platforms <id>` for every settings field and option.",
  options: { connected: { type: "boolean", description: "Only platforms with a connected account" } },
  max: 1,
  examples: ["postflare platforms --connected", "postflare platforms tiktok", "postflare platforms instagram_standalone --json"],
  async run(ctx, { values, positionals }) {
    const all = await ctx.providers();
    if (positionals[0]) {
      const p = all.find((x) => x.id === positionals[0] || x.name.toLowerCase() === positionals[0].toLowerCase());
      if (!p) throw new UsageError(`Unknown platform "${positionals[0]}". Platforms: ${all.map((x) => x.id).join(", ")}`);
      if (ctx.json) return printJson(p);
      const cap = p.capabilities;
      println(`${c.bold(p.name)} ${c.gray(`(${p.id}, ${p.category})`)}${p.configured === false ? c.yellow("  developer app not configured") : ""}`);
      if (p.status) println(`  Status:    ${p.status}${p.statusNote ? ` (${p.statusNote})` : ""}`);
      println(`  Text:      ${cap.text}, max ${cap.maxLength.toLocaleString("en-US")} characters`);
      println(`  Media:     ${mediaSummary(p)}${cap.media.mixed ? ", images and videos can be mixed" : ""}`);
      if (cap.mediaNote) println(`             ${cap.mediaNote}`);
      println(`  Follow-up: ${cap.thread ? `${cap.threadLabel ?? "yes"} (--thread)` : "no"}`);
      if (p.analytics) println(`  Analytics: ${p.analytics.post || p.analytics.account ? p.analytics.metrics.join(", ") : "none"}`);
      if (p.composerNotice) println(`  Notice:    ${truncate(p.composerNotice.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\*\*/g, ""), 400)}`);
      println("");
      println(p.settingsFields.length ? `Settings (--set ${p.id}.<key>=<value>):` : "No per-post settings.");
      for (const f of p.settingsFields) println(fieldLine(f));
      return;
    }
    let rows = all;
    let connected: Set<string> | null = null;
    try {
      connected = new Set((await ctx.accounts()).map((a) => a.provider));
    } catch {
      /* no accounts.read permission: skip the column */
    }
    if (values.connected) rows = rows.filter((p) => connected?.has(p.id));
    if (ctx.json) return printJson(rows);
    println(
      table(
        [
          { header: "ID" },
          { header: "NAME" },
          { header: "MAX", align: "right" },
          { header: "MEDIA" },
          { header: "THREAD" },
          { header: "SETTINGS", flex: true },
          ...(connected ? [{ header: "CONNECTED" }] : []),
        ],
        rows.map((p) => [
          p.id,
          p.name,
          p.capabilities.maxLength.toLocaleString("en-US"),
          mediaSummary(p),
          p.capabilities.thread ? "yes" : "",
          p.settingsFields.map((f) => f.key + (f.required ? "*" : "")).join(", "),
          ...(connected ? [connected.has(p.id) ? c.green("yes") : ""] : []),
        ]),
      ),
    );
    println(c.gray("* required setting. Details: postflare platforms <id>"));
  },
};
