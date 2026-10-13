import { useEffect, useState, type FormEvent } from "react";
import { useLocation } from "react-router";
import { ArrowUpCircle, ExternalLink, Globe, Info, Lock, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Form";
import { Badge, CodeBlock, PageHeader, Skeleton } from "../components/ui/Misc";
import { Section } from "../components/ui/Section";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { browserTimezone, timezones } from "../lib/time";
import { useUpdateStatus } from "../lib/updates";
import { invalidate } from "../lib/useFetch";
import { CHANGELOG_URL, COMMIT, REPO_URL, UPDATING_URL, VERSION, releaseUrl } from "@shared/version";

/** Admin → Instance settings: public URL and default timezone (API keys moved to the profile), version and updates. */
export function InstanceSettingsPage() {
  const { hash } = useLocation();
  // Links from the sidebar (#about, #updating) land on the section.
  useEffect(() => {
    if (hash) document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [hash]);
  return (
    <>
      <PageHeader title="Instance settings" description="Settings shared by every user and workspace of this Postflare instance." />
      <div className="space-y-6">
        <GeneralSection />
        <AboutSection />
        <UpdatingSection />
      </div>
    </>
  );
}

const linkClass = "inline-flex items-center gap-1 font-medium text-brand-600 hover:underline dark:text-brand-400";

function ExtLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
      <ExternalLink className="size-3" />
    </a>
  );
}

const formatDate = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

function AboutSection() {
  const { data: status, loading } = useUpdateStatus();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const server = status?.current ?? VERSION;
  const commit = status?.commit ?? COMMIT;

  async function checkNow() {
    setBusy(true);
    try {
      const res = await api.updates.check();
      invalidate("updates");
      if (res.error) toast.error(res.error);
      else toast.success(res.updateAvailable ? `Postflare v${res.latest} is available` : "You are on the latest version");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div id="about" className="scroll-mt-6">
      <Section icon={<Info />} title="About" description="The Postflare version this instance runs, and its release notes.">
        <dl className="grid max-w-xl grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2.5 text-sm">
          <dt className="text-zinc-500">Version</dt>
          <dd className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium">v{server}</span>
            {status?.updateAvailable ? (
              <a href="#updating">
                <Badge tone="brand">
                  <ArrowUpCircle className="size-3" /> v{status.latest} available
                </Badge>
              </a>
            ) : status?.latest ? (
              <Badge tone="green">Latest</Badge>
            ) : null}
          </dd>
          <dt className="text-zinc-500">Commit</dt>
          <dd className="font-mono">{commit === "dev" ? "dev" : <ExtLink href={`${REPO_URL}/commit/${commit}`}>{commit}</ExtLink>}</dd>
          {server !== VERSION && (
            <>
              <dt className="text-zinc-500">Web app</dt>
              <dd className="text-amber-700 dark:text-amber-300">
                v{VERSION} (older than the server: <button className={linkClass} onClick={() => window.location.reload()}>reload the page</button>)
              </dd>
            </>
          )}
          <dt className="text-zinc-500">Release notes</dt>
          <dd className="flex flex-wrap gap-x-4 gap-y-1">
            <ExtLink href={releaseUrl(server)}>v{server}</ExtLink>
            <ExtLink href={CHANGELOG_URL}>Changelog</ExtLink>
            <ExtLink href={`${REPO_URL}/releases`}>All releases</ExtLink>
          </dd>
          <dt className="text-zinc-500">Update check</dt>
          <dd className="text-zinc-600 dark:text-zinc-300">
            {loading && !status ? (
              <Skeleton className="h-5 w-48" />
            ) : !status?.enabled ? (
              <>Off (<code className="font-mono text-xs">UPDATE_CHECK=&quot;false&quot;</code>)</>
            ) : (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span>
                  Daily, from <code className="font-mono text-xs">{status.repo}</code>
                  {status.checkedAt ? `; last checked ${formatDate(status.checkedAt)}` : "; not checked yet"}
                  {status.error ? ` (${status.error})` : ""}
                </span>
                <Button size="sm" variant="outline" loading={busy} icon={<RefreshCw className="size-3.5" />} onClick={checkNow}>
                  Check now
                </Button>
              </span>
            )}
          </dd>
        </dl>
      </Section>
    </div>
  );
}

function UpdatingSection() {
  const { data: status } = useUpdateStatus();
  const available = !!status?.updateAvailable;
  return (
    <div id="updating" className="scroll-mt-6">
      <Section
        icon={<ArrowUpCircle />}
        title="Updating"
        description="Updating means deploying the new code: database migrations run automatically on the first request."
        className={available ? "ring-2 ring-brand-300 dark:ring-brand-800" : undefined}
      >
        <div className="max-w-2xl space-y-4 text-sm text-zinc-600 dark:text-zinc-300">
          {available && status ? (
            <p className="rounded-lg bg-brand-50 px-3 py-2 text-brand-900 dark:bg-brand-950/40 dark:text-brand-100">
              <strong className="font-semibold">Postflare v{status.latest}</strong> is available (you run v{status.current}
              {status.publishedAt ? `; released ${new Date(status.publishedAt).toLocaleDateString()}` : ""}). Read the{" "}
              <ExtLink href={status.url ?? releaseUrl(status.latest!)}>release notes</ExtLink> for breaking changes first.
            </p>
          ) : (
            <p>You are notified here and in the sidebar when a new version is released.</p>
          )}
          <div>
            <h3 className="mb-1 font-semibold text-zinc-800 dark:text-zinc-100">Deployed with the &ldquo;Deploy to Cloudflare&rdquo; button</h3>
            <p>
              Your copy of the repository on GitHub has a <em>Postflare update</em> workflow that opens a pull request with each new
              release (weekly, or run it by hand from the Actions tab). Merge it and Workers Builds deploys the update. The workflow
              needs <em>Settings → Actions → General → Allow GitHub Actions to create and approve pull requests</em>.
            </p>
          </div>
          <div>
            <h3 className="mb-1 font-semibold text-zinc-800 dark:text-zinc-100">Deployed from a clone</h3>
            <CodeBlock code={`git fetch --tags && git checkout v${status?.latest ?? "<version>"}   # or: git pull\nnpm ci\nnpm run deploy`} />
          </div>
          <p>
            Before a big upgrade, note a D1 restore point (<code className="font-mono text-xs">npx wrangler d1 time-travel info DB</code>).
            Details: <ExtLink href={UPDATING_URL}>Updating</ExtLink>.
          </p>
        </div>
      </Section>
    </div>
  );
}

function GeneralSection() {
  const { settings } = useApp();
  const toast = useToast();
  const [publicUrl, setPublicUrl] = useState("");
  const [timezone, setTimezone] = useState(browserTimezone);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!settings) return;
    setPublicUrl(settings.publicUrl);
    setTimezone(settings.timezone || browserTimezone);
  }, [settings]);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api.settings.save({ ...(settings?.publicUrlLocked ? {} : { publicUrl: publicUrl.trim() }), timezone });
      toast.success("Settings saved");
      invalidate("settings", "providers");
    } catch (err) {
      toast.error(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section icon={<Globe />} title="General" description="Where this instance lives and the default timezone of the calendar and composer.">
      {!settings ? (
        <div className="space-y-4">
          <Skeleton className="h-9 w-full" />
          <Skeleton className="h-9 w-full" />
        </div>
      ) : (
        <form onSubmit={save} className="max-w-xl space-y-5">
          <Field
            label="Public URL"
            help={
              settings.publicUrlLocked
                ? "Set by the PUBLIC_URL environment variable."
                : "Used to build OAuth redirect URIs and the public links platforms download your media from. Changing it means updating the redirect URI in every developer app."
            }
          >
            {(id) => (
              <div className="flex items-center gap-2">
                <Input id={id} type="url" value={publicUrl} disabled={settings.publicUrlLocked} onChange={(e) => setPublicUrl(e.target.value)} />
                {settings.publicUrlLocked && (
                  <Badge>
                    <Lock className="size-3" /> Locked
                  </Badge>
                )}
              </div>
            )}
          </Field>
          <Field label="Timezone" help={`Dates in the calendar and composer use this zone. Your browser is on ${browserTimezone}.`}>
            {(id) => (
              <Select id={id} value={timezone} onChange={(e) => setTimezone(e.target.value)}>
                {timezones().map((tz) => (
                  <option key={tz} value={tz}>
                    {tz.replace(/_/g, " ")}
                    {tz === browserTimezone ? " (browser)" : ""}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <div className="flex items-center gap-3">
            <Button type="submit" variant="primary" loading={busy}>
              Save
            </Button>
            {settings.encryptionKeyFromSecret !== undefined && (
              <span className="flex items-center gap-1.5 text-xs text-zinc-500">
                <ShieldCheck className="size-3.5 text-emerald-500" />
                Tokens encrypted with {settings.encryptionKeyFromSecret ? "the SECRET_KEY secret" : "an auto-generated key"}
              </span>
            )}
          </div>
        </form>
      )}
    </Section>
  );
}
