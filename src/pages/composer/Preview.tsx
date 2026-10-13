import { Heart, MessageCircle, Repeat2, Share, ThumbsUp } from "lucide-react";
import { AccountAvatar, ProviderLogo } from "../../components/ProviderLogo";
import { MediaThumb } from "../../components/posts/MediaThumb";
import { cn } from "../../lib/format";
import { useMediaLookup } from "../../lib/mediaCache";
import type { AccountDTO, MediaDTO, Provider } from "../../lib/types";
import type { Item } from "./model";

function Text({ text, max }: { text: string; max: number }) {
  if (!text) return <p className="text-sm italic text-zinc-400">Nothing written yet</p>;
  const chars = Array.from(text);
  const ok = max > 0 ? chars.slice(0, max).join("") : text;
  const over = max > 0 ? chars.slice(max).join("") : "";
  const linkify = (s: string) =>
    s.split(/(\s+)/).map((w, i) =>
      /^(#|@)\w/.test(w) || /^https?:\/\//.test(w) ? (
        <span key={i} className="text-sky-600 dark:text-sky-400">
          {w}
        </span>
      ) : (
        w
      ),
    );
  return (
    <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed text-zinc-900 dark:text-zinc-100">
      {linkify(ok)}
      {over && <mark className="rounded-sm bg-red-200 text-red-900 dark:bg-red-900/70 dark:text-red-100">{over}</mark>}
    </p>
  );
}

function MediaGrid({ items, vertical }: { items: Array<MediaDTO | undefined>; vertical?: boolean }) {
  if (!items.length) return null;
  if (vertical)
    return (
      <div className="mx-auto mt-3 aspect-[9/16] w-48 overflow-hidden rounded-xl bg-black">
        <MediaThumb media={items[0]} className="size-full" controls />
      </div>
    );
  const shown = items.slice(0, 4);
  return (
    <div className={cn("mt-3 grid gap-0.5 overflow-hidden rounded-xl ring-1 ring-zinc-200 dark:ring-zinc-700", shown.length > 1 && "grid-cols-2")}>
      {shown.map((m, i) => (
        <div key={i} className={cn("relative", shown.length === 1 ? "aspect-video" : "aspect-square", shown.length === 3 && i === 0 && "row-span-2 aspect-auto")}>
          <MediaThumb media={m} className="absolute inset-0 size-full" controls={m?.kind === "video" && shown.length === 1} />
          {i === 3 && items.length > 4 && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-lg font-semibold text-white">+{items.length - 4}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export function Preview({ account, provider, item, settings }: { account: AccountDTO; provider: Provider; item: Item; settings: Record<string, unknown> }) {
  const lookup = useMediaLookup([...item.media, ...item.thread.flatMap((t) => t.media)]);
  const media = item.media.map(lookup);
  const max = provider.capabilities.maxLength;
  // Vertical frame for short-form video platforms.
  const isVideo =
    ["tiktok", "tiktok_business"].includes(provider.id) ||
    (media.length === 1 && media[0]?.kind === "video" && ["instagram", "instagram_standalone", "kick"].includes(provider.id));
  const title = typeof settings.title === "string" ? settings.title : "";
  const isBlog = provider.category === "blog" || provider.category === "newsletter";
  const handle = account.username ? `@${account.username.replace(/^@/, "")}` : provider.name;

  return (
    <div className="overflow-hidden rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 dark:bg-zinc-900 dark:ring-zinc-800">
      <div className="h-1" style={{ backgroundColor: `#${provider.color}` }} />
      <div className="p-4">
        <div className="flex items-center gap-3">
          <AccountAvatar account={account} provider={provider} size="md" showProvider={false} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold">{account.name}</div>
            <div className="truncate text-xs text-zinc-500">{handle} · now</div>
          </div>
          <ProviderLogo provider={provider} size="sm" />
        </div>
        <div className="mt-3">
          {(isBlog || provider.category === "video") && title && <h3 className="mb-1.5 text-base font-bold leading-snug">{title}</h3>}
          {provider.capabilities.text !== "none" && <Text text={item.content} max={max} />}
          <MediaGrid items={media} vertical={isVideo} />
        </div>
        <div className="mt-3 flex items-center gap-6 border-t border-zinc-100 pt-2.5 text-zinc-400 dark:border-zinc-800">
          {provider.category === "social" || provider.category === "community" ? (
            <>
              <MessageCircle className="size-4" />
              <Repeat2 className="size-4" />
              <Heart className="size-4" />
              <Share className="ml-auto size-4" />
            </>
          ) : (
            <>
              <ThumbsUp className="size-4" />
              <MessageCircle className="size-4" />
              <Share className="ml-auto size-4" />
            </>
          )}
        </div>
      </div>
      {item.thread.length > 0 && (
        <div className="space-y-3 border-t border-zinc-100 bg-zinc-50/60 p-4 dark:border-zinc-800 dark:bg-zinc-950/30">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{provider.capabilities.threadLabel ?? "Follow-ups"}</p>
          {item.thread.map((t, i) => (
            <div key={i} className="flex gap-2.5">
              <AccountAvatar account={account} provider={provider} size="sm" showProvider={false} />
              <div className="min-w-0 flex-1">
                <Text text={t.content} max={max} />
                <MediaGrid items={t.media.map(lookup)} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
