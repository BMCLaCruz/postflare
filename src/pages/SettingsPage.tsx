import { useEffect, useState, type FormEvent } from "react";
import { Globe, Lock, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/Button";
import { Field, Input, Select } from "../components/ui/Form";
import { Badge, PageHeader, Skeleton } from "../components/ui/Misc";
import { Section } from "../components/ui/Section";
import { useToast } from "../components/ui/Toast";
import { api } from "../lib/api";
import { useApp } from "../lib/app";
import { browserTimezone, timezones } from "../lib/time";
import { invalidate } from "../lib/useFetch";

/** Admin → Instance settings: public URL and default timezone (API keys moved to the profile). */
export function InstanceSettingsPage() {
  return (
    <>
      <PageHeader title="Instance settings" description="Settings shared by every user and workspace of this Postflare instance." />
      <div className="space-y-6">
        <GeneralSection />
      </div>
    </>
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
