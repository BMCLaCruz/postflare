import { Check, Plus } from "lucide-react";
import { Link } from "react-router";
import { AccountAvatar } from "../../components/ProviderLogo";
import { useApp } from "../../lib/app";
import { cn } from "../../lib/format";
import type { AccountDTO } from "../../lib/types";

export function AccountPicker({
  selected,
  onToggle,
  locked,
  onNavigate,
}: {
  selected: string[];
  onToggle: (account: AccountDTO) => void;
  locked?: boolean;
  onNavigate: () => void;
}) {
  const { accounts, providerMap } = useApp();
  const list = locked ? accounts.filter((a) => selected.includes(a.id)) : accounts;

  if (!accounts.length)
    return (
      <div className="flex items-center justify-between gap-4 rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm dark:border-zinc-700">
        <span className="text-zinc-500">No accounts connected yet.</span>
        <Link to="/accounts" onClick={onNavigate} className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400">
          <Plus className="size-4" /> Connect an account
        </Link>
      </div>
    );

  const groups = new Map<string, AccountDTO[]>();
  for (const a of list) groups.set(a.provider, [...(groups.get(a.provider) ?? []), a]);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
      {[...groups.entries()].map(([pid, accs]) => {
        const provider = providerMap.get(pid);
        return (
          <div key={pid} className="flex items-center gap-1.5" role="group" aria-label={provider?.name ?? pid}>
            {accs.map((a) => {
              const on = selected.includes(a.id);
              const disabled = a.status === "disabled";
              return (
                <button
                  key={a.id}
                  type="button"
                  disabled={disabled || locked}
                  onClick={() => onToggle(a)}
                  aria-pressed={on}
                  title={`${a.name}${a.username ? ` (@${a.username})` : ""} · ${provider?.name ?? pid}${disabled ? " · disabled" : a.status === "reconnect" ? " · needs reconnect" : ""}`}
                  className={cn(
                    "relative rounded-full p-0.5 transition disabled:cursor-not-allowed",
                    on ? "ring-2 ring-brand-500" : "ring-2 ring-transparent hover:ring-zinc-300 dark:hover:ring-zinc-600",
                    !on && !locked && "opacity-55 grayscale-[0.6] hover:opacity-100 hover:grayscale-0",
                    disabled && "!opacity-30",
                    locked && "!cursor-default",
                  )}
                >
                  <AccountAvatar account={a} provider={provider} size="lg" />
                  {on && !locked && (
                    <span className="absolute -left-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-brand-500 text-white ring-2 ring-white dark:ring-zinc-900">
                      <Check className="size-2.5" strokeWidth={3} />
                    </span>
                  )}
                  {a.status === "reconnect" && (
                    <span className="absolute -right-0.5 -top-0.5 size-3 rounded-full bg-amber-500 ring-2 ring-white dark:ring-zinc-900" />
                  )}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
