import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router";
import { AlertTriangle, BarChart3, ExternalLink, Loader2, Plus, Power, RefreshCw, Trash2, Users, Zap } from "lucide-react";
import { MetricsStatusBadge } from "../components/analytics/bits";
import { ConnectDialog } from "../components/accounts/ConnectDialog";
import { AccountAvatar, ProviderLogo } from "../components/ProviderLogo";
import { ProviderStatusBadge } from "../components/ProviderStatusBadge";
import { Button, IconButton } from "../components/ui/Button";
import { useConfirm } from "../components/ui/Confirm";
import { Badge, Card, EmptyState, PageHeader, Skeleton } from "../components/ui/Misc";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { cn, compactNumber, fullNumber } from "../lib/format";
import { useSession } from "../lib/session";
import { formatDate, relativeTime } from "../lib/time";
import type { AccountDTO, Provider } from "../lib/types";
import { invalidate } from "../lib/useFetch";
import { useComposer } from "./composer/ComposerProvider";

export function AccountsPage() {
  const { accounts, providerMap, loading } = useApp();
  const canManage = useSession().can("accounts.manage");
  const [params, setParams] = useSearchParams();
  const [connect, setConnect] = useState<{ provider: string | null } | null>(null);
  const toast = useToast();
  const handled = useRef(false);

  // Return from an OAuth flow.
  useEffect(() => {
    if (handled.current) return;
    const connected = params.get("connected");
    const error = params.get("error");
    if (!connected && !error) return;
    handled.current = true;
    if (connected) {
      const p = providerMap.get(params.get("provider") ?? "");
      const n = Number(connected);
      toast.success(`${p?.name ?? "Account"} connected`, n > 1 ? `${n} accounts added` : undefined);
      invalidate("accounts");
    } else if (error) {
      toast.error("Connection failed", error);
    }
    setParams({}, { replace: true });
  }, [params, providerMap, setParams, toast]);

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Profiles, pages and channels Postflare can publish to."
        actions={
          canManage && (
            <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setConnect({ provider: null })}>
              Connect account
            </Button>
          )
        }
      />
      {loading.accounts ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i} className="p-5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-11 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-3 w-1/3" />
                </div>
              </div>
              <Skeleton className="mt-5 h-8 w-full" />
            </Card>
          ))}
        </div>
      ) : !accounts.length ? (
        <Card>
          <EmptyState
            icon={<Users />}
            title="No accounts connected"
            description={
              canManage
                ? "Connect X, LinkedIn, Instagram, Bluesky, YouTube, TikTok, Discord and 30 more platforms."
                : "Nobody has connected an account to this workspace yet. Your role cannot connect accounts."
            }
            action={
              canManage && (
                <Button variant="primary" icon={<Plus className="size-4" />} onClick={() => setConnect({ provider: null })}>
                  Connect your first account
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {accounts.map((a) => (
            <AccountCard key={a.id} account={a} provider={providerMap.get(a.provider)} onReconnect={() => setConnect({ provider: a.provider })} />
          ))}
          {canManage && (
          <button
            onClick={() => setConnect({ provider: null })}
            className="flex min-h-44 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-zinc-200 text-sm font-medium text-zinc-500 transition hover:border-brand-300 hover:bg-brand-50/40 hover:text-brand-700 dark:border-zinc-800 dark:hover:border-brand-800 dark:hover:bg-brand-950/20 dark:hover:text-brand-300"
          >
            <Plus className="size-5" />
            Connect another account
          </button>
          )}
        </div>
      )}
      <ConnectDialog open={!!connect} onClose={() => setConnect(null)} initialProvider={connect?.provider} />
    </>
  );
}

function AccountCard({ account: a, provider, onReconnect }: { account: AccountDTO; provider: Provider | undefined; onReconnect: () => void }) {
  const toast = useToast();
  const confirm = useConfirm();
  const composer = useComposer();
  const { tz } = useApp();
  const { can } = useSession();
  const canManage = can("accounts.manage");
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, fn: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try {
      await fn();
      toast.success(success);
      invalidate("accounts");
    } catch (err) {
      toast.error(err);
      invalidate("accounts");
    } finally {
      setBusy(null);
    }
  };

  const hasAnalytics = !!provider && (provider.analytics.post || provider.analytics.account);
  const followers = a.metricsStatus.metrics?.followers;
  const followerLabel = a.provider === "youtube" || a.provider === "reddit" ? "subscribers" : "followers";
  const refreshStats = async () => {
    setBusy("stats");
    try {
      const res = await api.analytics.refresh({ accountId: a.id });
      const st = res.account?.metricsStatus;
      if (st?.status === "reconnect_required") toast.error("Reconnect to enable analytics", st.message ?? undefined);
      else if (st?.status === "error") toast.error("Could not refresh stats", st.message ?? undefined);
      else toast.success(`${a.name} stats refreshed`, res.account?.postsRefreshed ? `${res.account.postsRefreshed} posts updated` : undefined);
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(null);
      invalidate("accounts", "analytics");
    }
  };

  const expired = a.expiresAt !== null && a.expiresAt < Date.now();
  const expiringSoon = a.expiresAt !== null && !expired && a.expiresAt < Date.now() + 3 * 864e5;

  return (
    <Card className={cn("flex flex-col", a.status === "disabled" && "opacity-70")}>
      <div className="flex items-start gap-3 p-5 pb-4">
        <AccountAvatar account={a} provider={provider} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold">{a.name}</h3>
          </div>
          {a.username && (
            <p className="truncate text-sm text-zinc-500">
              {a.profileUrl ? (
                <a href={a.profileUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-zinc-800 hover:underline dark:hover:text-zinc-200">
                  @{a.username.replace(/^@/, "")}
                  <ExternalLink className="size-3" />
                </a>
              ) : (
                `@${a.username.replace(/^@/, "")}`
              )}
            </p>
          )}
          <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500">
            <ProviderLogo provider={provider} size="xs" />
            {provider?.name ?? a.provider}
            {provider?.status === "experimental" && <ProviderStatusBadge provider={provider} className="px-1.5 py-0 text-[10px]" />}
          </p>
        </div>
        {a.status === "active" ? (
          <Badge tone="green" dot>
            Active
          </Badge>
        ) : a.status === "disabled" ? (
          <Badge tone="zinc">Disabled</Badge>
        ) : (
          <Badge tone="amber">
            <AlertTriangle className="size-3" /> Reconnect
          </Badge>
        )}
      </div>

      {hasAnalytics && (
        <div className="mx-5 mb-3 flex items-center justify-between gap-3 rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
          {followers !== undefined ? (
            <p className="min-w-0 truncate text-sm" title={`${fullNumber(followers)} ${followerLabel}`}>
              <span className="font-semibold text-zinc-900 dark:text-zinc-50">{compactNumber(followers)}</span>{" "}
              <span className="text-zinc-500 dark:text-zinc-400">{followerLabel}</span>
            </p>
          ) : (
            <p className="text-sm text-zinc-400">No stats yet</p>
          )}
          <MetricsStatusBadge status={a.metricsStatus} />
        </div>
      )}
      {!hasAnalytics && (
        <div className="mx-5 mb-3">
          <MetricsStatusBadge status={a.metricsStatus} />
        </div>
      )}

      <div className="flex-1 space-y-1 px-5 pb-4 text-xs text-zinc-500">
        {a.status === "reconnect" && (
          <p className="rounded-lg bg-amber-50 px-2.5 py-2 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            {a.statusMessage || "Access was revoked or expired. Reconnect to keep publishing."}
          </p>
        )}
        {a.status !== "reconnect" && a.statusMessage && <p>{a.statusMessage}</p>}
        {a.metricsStatus.status === "reconnect_required" && a.status !== "reconnect" && (
          <p className="text-amber-700 dark:text-amber-400">
            Reconnect to enable analytics.{" "}
            {canManage && (
              <button type="button" onClick={onReconnect} className="font-medium underline-offset-2 hover:underline">
                Reconnect now
              </button>
            )}
          </p>
        )}
        {a.metricsStatus.status === "error" && a.metricsStatus.message && <p className="text-red-600 dark:text-red-400">Analytics: {a.metricsStatus.message}</p>}
        {a.expiresAt !== null && (
          <p className={cn(expired && "text-red-600 dark:text-red-400", expiringSoon && "text-amber-600 dark:text-amber-400")}>
            Token {expired ? "expired" : "expires"} {relativeTime(a.expiresAt)}
            {provider?.auth === "oauth2" && !expired && " · refreshed automatically"}
          </p>
        )}
        <p>Connected {formatDate(a.createdAt, tz)}</p>
      </div>

      <div className="flex items-center gap-1 border-t border-zinc-100 px-3 py-2 dark:border-zinc-800">
        {a.status === "reconnect" ? (
          canManage && (
            <Button size="sm" variant="primary" icon={<Zap className="size-3.5" />} onClick={onReconnect}>
              Reconnect
            </Button>
          )
        ) : (
          can("posts.write") && (
            <Button size="sm" variant="ghost" disabled={a.status === "disabled"} onClick={() => composer.open({ accountIds: [a.id] })}>
              New post
            </Button>
          )
        )}
        <div className="flex-1" />
        {hasAnalytics && can("posts.write") && a.metricsStatus.status !== "not_supported" && (
          <IconButton label="Refresh stats" size="sm" disabled={!!busy} onClick={refreshStats}>
            {busy === "stats" ? <Loader2 className="size-4 animate-spin" /> : <BarChart3 className="size-4" />}
          </IconButton>
        )}
        {canManage && (
        <>
        <IconButton
          label="Check connection & refresh token"
          size="sm"
          disabled={!!busy}
          onClick={() => run("refresh", () => api.accounts.refresh(a.id), `${a.name} is working`)}
        >
          <RefreshCw className={cn("size-4", busy === "refresh" && "animate-spin")} />
        </IconButton>
        {a.status !== "reconnect" && (
          <IconButton label="Reconnect" size="sm" onClick={onReconnect}>
            <Zap className="size-4" />
          </IconButton>
        )}
        <IconButton
          label={a.status === "disabled" ? "Enable" : "Disable"}
          size="sm"
          disabled={!!busy}
          onClick={() =>
            run(
              "status",
              () => api.accounts.setStatus(a.id, a.status === "disabled" ? "active" : "disabled"),
              a.status === "disabled" ? `${a.name} enabled` : `${a.name} disabled`,
            )
          }
        >
          <Power className={cn("size-4", a.status === "disabled" && "text-emerald-600")} />
        </IconButton>
        <IconButton
          label="Remove"
          size="sm"
          variant="danger"
          disabled={!!busy}
          onClick={async () => {
            if (
              await confirm({
                title: `Remove ${a.name}?`,
                message: "All of its posts (scheduled, drafts and history) are deleted from Postflare. Published posts stay on the platform.",
                confirmLabel: "Remove account",
                danger: true,
              })
            )
              await run("remove", () => api.accounts.remove(a.id), `${a.name} removed`).then(() => invalidate("posts"));
          }}
        >
          <Trash2 className="size-4" />
        </IconButton>
        </>
        )}
        {!canManage && <span className="h-8" />}
      </div>
    </Card>
  );
}
