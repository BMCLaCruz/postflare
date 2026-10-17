import { useState, type FormEvent, type ReactNode } from "react";
import { CalendarClock, KeyRound, Lock, Mail, MailCheck, Sparkles, Users } from "lucide-react";
import { Wordmark } from "../components/Logo";
import { Button } from "../components/ui/Button";
import { Field, Input } from "../components/ui/Form";
import { ApiError, api, errorMessage } from "../lib/api";

/** `magicLink`: the instance can email sign-in links, offered next to the password. */
export function AuthPage({
  mode,
  setupToken: askToken = false,
  magicLink = false,
  onDone,
}: {
  mode: "setup" | "login";
  setupToken?: boolean;
  magicLink?: boolean;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [token, setToken] = useState("");
  const [error, setError] = useState<{ message: string; tone: "red" | "amber" } | null>(null);
  const [busy, setBusy] = useState(false);
  const setup = mode === "setup";
  const [useLink, setUseLink] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const linkMode = !setup && magicLink && useLink;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (setup && !name.trim()) return setError({ message: "Enter your name.", tone: "red" });
    if (setup && password.length < 8) return setError({ message: "Use at least 8 characters for the password.", tone: "red" });
    if (setup && password !== confirm) return setError({ message: "Passwords do not match.", tone: "red" });
    setBusy(true);
    try {
      if (linkMode) {
        await api.auth.magicLink(email.trim());
        return setSentTo(email.trim());
      }
      if (setup) await api.auth.setup({ name: name.trim(), email: email.trim(), password, workspaceName: workspaceName.trim() || undefined, ...(askToken ? { setupToken: token.trim() } : {}) });
      else await api.auth.login(email.trim(), password);
      onDone();
    } catch (err) {
      // 429: throttled, 403: disabled account: both are not "wrong password" and deserve a calmer tone.
      const status = err instanceof ApiError ? err.status : 0;
      setError({ message: errorMessage(err), tone: status === 429 || status === 403 ? "amber" : "red" });
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <AuthShell title="Check your email">
        <div className="flex gap-3 rounded-xl bg-zinc-50 p-3.5 text-sm text-zinc-600 ring-1 ring-zinc-200 dark:bg-zinc-800/50 dark:text-zinc-300 dark:ring-zinc-800">
          <MailCheck className="mt-0.5 size-5 shrink-0 text-brand-500" />
          <p>
            If an account exists for <span className="font-medium text-zinc-900 dark:text-zinc-100">{sentTo}</span>, a sign-in link is on its way. It works
            once, for 15 minutes.
          </p>
        </div>
        <Button variant="ghost" className="mt-4 w-full" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={setup ? "Welcome to Postflare" : "Sign in"}
      subtitle={
        setup
          ? "Create the first account. You become the admin of this instance."
          : linkMode
            ? "We will email you a link to sign in."
            : "Sign in with your email and password."
      }
      footer={
        setup && (
          <ul className="mt-8 space-y-3 px-2 text-sm text-zinc-500 dark:text-zinc-400">
            <li className="flex gap-3">
              <Lock className="mt-0.5 size-4 shrink-0 text-brand-500" /> Self-hosted on your Cloudflare account. Tokens are encrypted at rest.
            </li>
            <li className="flex gap-3">
              <Users className="mt-0.5 size-4 shrink-0 text-brand-500" /> Invite people later, each with their own workspace or a role in yours.
            </li>
            <li className="flex gap-3">
              <CalendarClock className="mt-0.5 size-4 shrink-0 text-brand-500" /> Schedule to 30+ platforms from one composer.
            </li>
            <li className="flex gap-3">
              <Sparkles className="mt-0.5 size-4 shrink-0 text-brand-500" /> REST API and MCP server for AI agents.
            </li>
          </ul>
        )
      }
    >
      <form onSubmit={submit} className="space-y-4">
        {setup && (
          <Field label="Your name">
            {(id) => <Input id={id} autoFocus autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ada Lovelace" required />}
          </Field>
        )}
        <Field label="Email">
          {(id) => (
            <Input
              id={id}
              type="email"
              autoFocus={!setup}
              autoComplete={setup ? "email" : "username"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
            />
          )}
        </Field>
        {!linkMode && (
          <Field label="Password">
            {(id) => (
              <Input
                id={id}
                type="password"
                autoComplete={setup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={setup ? "At least 8 characters" : "••••••••"}
                required
              />
            )}
          </Field>
        )}
        {setup && (
          <>
            <Field label="Confirm password">
              {(id) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />}
            </Field>
            <Field label="Workspace name" help="Accounts, posts and media live in a workspace. You can rename it later.">
              {(id) => <Input id={id} value={workspaceName} onChange={(e) => setWorkspaceName(e.target.value)} placeholder="My workspace" maxLength={100} />}
            </Field>
            {askToken && (
              <Field label="Setup token" help="The SETUP_TOKEN secret of this deployment.">
                {(id) => <Input id={id} type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} required />}
              </Field>
            )}
          </>
        )}
        {error && <FormError tone={error.tone}>{error.message}</FormError>}
        <Button type="submit" variant="primary" size="lg" className="w-full" loading={busy} disabled={!email || (!linkMode && !password)}>
          {setup ? "Create account & continue" : linkMode ? "Email me a sign-in link" : "Sign in"}
        </Button>
        {!setup && magicLink && (
          <Button
            variant="ghost"
            className="w-full"
            onClick={() => {
              setUseLink(!useLink);
              setError(null);
            }}
          >
            {linkMode ? <KeyRound className="size-4" /> : <Mail className="size-4" />}
            {linkMode ? "Sign in with a password instead" : "Email me a sign-in link instead"}
          </Button>
        )}
      </form>
    </AuthShell>
  );
}

export function FormError({ tone = "red", children }: { tone?: "red" | "amber"; children: ReactNode }) {
  return (
    <p
      role="alert"
      className={
        tone === "amber"
          ? "rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900"
          : "rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-200 dark:bg-red-950/40 dark:text-red-300 dark:ring-red-900"
      }
    >
      {children}
    </p>
  );
}

/** Centered card layout shared by sign-in, setup and invitation pages. */
export function AuthShell({ title, subtitle, children, footer }: { title: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgba(249,115,22,0.16),transparent)] dark:bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgba(249,115,22,0.12),transparent)]" />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Wordmark />
        </div>
        <div className="rounded-2xl bg-white p-7 shadow-xl shadow-zinc-900/5 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:shadow-black/30 dark:ring-zinc-800">
          <div className="mb-6">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle && <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</div>}
          </div>
          {children}
        </div>
        {footer}
      </div>
    </div>
  );
}
