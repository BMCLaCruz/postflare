import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { AlertCircle, Ban, Copy, ExternalLink, Pencil, RotateCcw, Trash2 } from "lucide-react";
import { api } from "../../lib/api";
import { useApp } from "../../lib/app";
import { cn } from "../../lib/format";
import { useMediaLookup } from "../../lib/mediaCache";
import { useSession } from "../../lib/session";
import { formatDateTime } from "../../lib/time";
import type { PostDTO, PostWithLogs } from "../../lib/types";
import { invalidate, useFetch } from "../../lib/useFetch";
import { useComposer } from "../../pages/composer/ComposerProvider";
import { PostPerformance } from "../analytics/PostPerformance";
import { AccountAvatar } from "../ProviderLogo";
import { Button } from "../ui/Button";
import { useConfirm } from "../ui/Confirm";
import { Drawer } from "../ui/Dialog";
import { Skeleton, StatusBadge } from "../ui/Misc";
import { useToast } from "../ui/Toast";
import { MediaThumb } from "./MediaThumb";

interface DrawerApi {
  openPost: (ids: string | string[]) => void;
}
const Ctx = createContext<DrawerApi | null>(null);

export function PostDrawerProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<string[] | null>(null);
  const openPost = useCallback((v: string | string[]) => setIds(Array.isArray(v) ? v : [v]), []);
  const api = useMemo(() => ({ openPost }), [openPost]);
  return (
    <Ctx.Provider value={api}>
      {children}
      {ids && <PostDrawer ids={ids} onClose={() => setIds(null)} />}
    </Ctx.Provider>
  );
}

export function usePostDrawer(): DrawerApi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("usePostDrawer outside provider");
  return ctx;
}

export const EDITABLE: PostDTO["status"][] = ["draft", "scheduled", "failed", "cancelled"];

/** Shared post actions with confirmation + toasts. */
export function usePostActions() {
  const toast = useToast();
  const confirm = useConfirm();
  const run = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      toast.success(success);
      invalidate("posts");
      return true;
    } catch (err) {
      toast.error(err);
      return false;
    }
  };
  return {
    retry: (p: PostDTO) => run(() => api.posts.retry(p.id), "Retry queued"),
    cancel: async (p: PostDTO) =>
      (await confirm({ title: "Cancel this post?", message: "It will not be published. You can retry or edit it later.", confirmLabel: "Cancel post", danger: true })) &&
      run(() => api.posts.cancel(p.id), "Post cancelled"),
    remove: async (p: PostDTO) =>
      (await confirm({
        title: "Delete this post?",
        message: p.status === "published" ? "It is removed from Postflare only; the post stays live on the platform." : "This cannot be undone.",
        confirmLabel: "Delete",
        danger: true,
      })) && run(() => api.posts.remove(p.id), "Post deleted"),
  };
}

function PostDrawer({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const [active, setActive] = useState(ids[0]);
  const { accountMap, providerMap } = useApp();
  const post = useFetch(`post:${active}`, () => api.posts.get(active), ["posts"]);
  const group = useFetch(ids.length > 1 ? `group:${ids.join()}` : null, () => Promise.all(ids.map((id) => api.posts.get(id))), ["posts"]);
  const p = post.data;

  // Poll while the post is in flight.
  useEffect(() => {
    if (p?.status !== "publishing") return;
    const t = setInterval(() => void post.refetch(), 4000);
    return () => clearInterval(t);
  }, [p?.status, post]);

  const account = p ? accountMap.get(p.accountId) : undefined;
  const provider = account ? providerMap.get(account.provider) : undefined;

  return (
    <Drawer
      open
      onClose={onClose}
      title={
        p ? (
          <div className="flex items-center gap-3">
            <AccountAvatar account={account} provider={provider} size="md" />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{account?.name ?? "Deleted account"}</div>
              <div className="truncate text-xs font-normal text-zinc-500">{provider?.name}</div>
            </div>
          </div>
        ) : (
          "Post"
        )
      }
      footer={p && <Actions post={p} onClose={onClose} />}
    >
      {ids.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-zinc-200 px-5 py-2.5 dark:border-zinc-800">
          {ids.map((id) => {
            const gp = group.data?.find((x) => x.id === id);
            const a = gp ? accountMap.get(gp.accountId) : undefined;
            return (
              <button
                key={id}
                onClick={() => setActive(id)}
                className={cn(
                  "flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-medium ring-1 transition",
                  id === active
                    ? "bg-brand-50 text-brand-800 ring-brand-300 dark:bg-brand-950/50 dark:text-brand-200 dark:ring-brand-800"
                    : "text-zinc-600 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800",
                )}
              >
                <AccountAvatar account={a} provider={a ? providerMap.get(a.provider) : undefined} size="sm" showProvider={false} className="!size-5" />
                {a?.name ?? "…"}
              </button>
            );
          })}
        </div>
      )}
      {!p ? (
        <div className="space-y-4 p-5">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : (
        <PostBody post={p} />
      )}
    </Drawer>
  );
}

function PostBody({ post }: { post: PostWithLogs }) {
  const { tz } = useApp();
  const media = useMediaLookup([...post.media, ...post.thread.flatMap((t) => t.media)]);
  const settings = Object.entries(post.settings).filter(([, v]) => v !== "" && v !== null && v !== undefined && !(Array.isArray(v) && !v.length));
  const when = post.publishedAt ?? post.scheduledAt;
  return (
    <div className="space-y-6 p-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <StatusBadge status={post.status} />
        <span className="text-sm text-zinc-500 dark:text-zinc-400">
          {post.status === "published" && post.publishedAt
            ? `Published ${formatDateTime(post.publishedAt, tz, { year: "numeric" })}`
            : post.status === "draft"
              ? `Draft · created ${formatDateTime(post.createdAt, tz)}`
              : when
                ? `${post.status === "scheduled" ? "Scheduled for" : ""} ${formatDateTime(when, tz, { weekday: "short", year: "numeric" })}`
                : null}
        </span>
        {post.attempts > 1 && <span className="text-xs text-zinc-400">{post.attempts} attempts</span>}
      </div>

      {post.error && (
        <div className="flex gap-3 rounded-lg bg-red-50 p-3.5 text-sm text-red-800 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-200 dark:ring-red-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0" />
          <p className="whitespace-pre-wrap break-words">{post.error}</p>
        </div>
      )}

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Content</h3>
        {post.content ? (
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{post.content}</p>
        ) : (
          <p className="text-sm italic text-zinc-400">No text</p>
        )}
        {post.media.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {post.media.map((id) => (
              <MediaThumb key={id} media={media(id)} className="aspect-square w-full rounded-lg" controls />
            ))}
          </div>
        )}
      </section>

      {post.status === "published" && <PostPerformance post={post} />}

      {post.thread.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Follow-ups</h3>
          <ol className="space-y-3 border-l-2 border-zinc-200 pl-4 dark:border-zinc-700">
            {post.thread.map((t, i) => (
              <li key={i} className="text-sm">
                <p className="whitespace-pre-wrap break-words">{t.content || <span className="italic text-zinc-400">Media only</span>}</p>
                {t.media.length > 0 && (
                  <div className="mt-2 flex gap-2">
                    {t.media.map((id) => (
                      <MediaThumb key={id} media={media(id)} className="size-16 rounded-md" />
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ol>
        </section>
      )}

      {settings.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-400">Settings</h3>
          <dl className="divide-y divide-zinc-100 rounded-lg ring-1 ring-zinc-200 dark:divide-zinc-800 dark:ring-zinc-800">
            {settings.map(([k, v]) => (
              <div key={k} className="flex gap-4 px-3 py-2 text-sm">
                <dt className="w-32 shrink-0 text-zinc-500">{k}</dt>
                <dd className="min-w-0 break-words">{Array.isArray(v) ? v.join(", ") : typeof v === "object" ? JSON.stringify(v) : String(v)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section>
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-zinc-400">Publishing log</h3>
        {post.logs.length === 0 ? (
          <p className="text-sm text-zinc-400">No activity yet.</p>
        ) : (
          <ol className="relative space-y-3 border-l border-zinc-200 pl-5 dark:border-zinc-700">
            {post.logs.map((l) => (
              <li key={l.id} className="relative">
                <span
                  className={cn(
                    "absolute -left-[25px] top-1.5 size-2 rounded-full ring-4 ring-white dark:ring-zinc-900",
                    l.level === "error" ? "bg-red-500" : l.level === "warn" ? "bg-amber-500" : "bg-zinc-400",
                  )}
                />
                <p
                  className={cn(
                    "whitespace-pre-wrap break-words text-sm",
                    l.level === "error" && "text-red-700 dark:text-red-300",
                    l.level === "warn" && "text-amber-700 dark:text-amber-300",
                  )}
                >
                  {l.message}
                </p>
                <time className="text-xs text-zinc-400">{formatDateTime(l.createdAt, tz, { second: "2-digit" })}</time>
              </li>
            ))}
          </ol>
        )}
      </section>
      <p className="font-mono text-[11px] text-zinc-400">{post.id}</p>
    </div>
  );
}

function Actions({ post, onClose }: { post: PostDTO; onClose: () => void }) {
  const actions = usePostActions();
  const composer = useComposer();
  const [busy, setBusy] = useState<string | null>(null);
  const canWrite = useSession().can("posts.write");
  const wrap = (key: string, fn: () => Promise<unknown>) => async () => {
    setBusy(key);
    await fn();
    setBusy(null);
  };
  if (!canWrite) {
    return post.externalUrl ? (
      <a
        href={post.externalUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
      >
        <ExternalLink className="size-4" /> Open
      </a>
    ) : (
      <p className="text-xs text-zinc-500">Your role can view posts but not change them.</p>
    );
  }
  return (
    <>
      {EDITABLE.includes(post.status) && (
        <Button
          variant="primary"
          icon={<Pencil className="size-4" />}
          onClick={() => {
            onClose();
            composer.open({ postId: post.id });
          }}
        >
          Edit
        </Button>
      )}
      {(post.status === "failed" || post.status === "cancelled") && (
        <Button icon={<RotateCcw className="size-4" />} loading={busy === "retry"} onClick={wrap("retry", () => actions.retry(post))}>
          {post.status === "failed" ? "Retry now" : "Publish now"}
        </Button>
      )}
      {post.status === "scheduled" && (
        <Button icon={<Ban className="size-4" />} loading={busy === "cancel"} onClick={wrap("cancel", () => actions.cancel(post))}>
          Cancel
        </Button>
      )}
      {post.externalUrl && (
        <a
          href={post.externalUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center gap-2 rounded-lg px-3.5 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-50 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800"
        >
          <ExternalLink className="size-4" /> Open
        </a>
      )}
      <div className="flex-1" />
      <Button
        variant="ghost"
        icon={<Copy className="size-4" />}
        onClick={() => {
          onClose();
          composer.open({ duplicate: post });
        }}
      >
        Duplicate
      </Button>
      {post.status !== "publishing" && (
        <Button
          variant="ghost"
          className="text-red-600 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40"
          icon={<Trash2 className="size-4" />}
          onClick={async () => {
            if (await actions.remove(post)) onClose();
          }}
        >
          Delete
        </Button>
      )}
    </>
  );
}
