/**
 * Outgoing email (sign-in links) through Cloudflare Email Sending: the optional `send_email` binding EMAIL plus the
 * EMAIL_FROM var, e.g. "Postflare <login@example.com>". Sending to arbitrary recipients needs Workers Paid and a domain
 * onboarded to Email Sending; on the Free plan the binding only delivers to the account's verified addresses.
 * Sign-in links are on only when that is configured AND an instance admin turned them on (setting below).
 */
import { getSetting } from "./settings";

/** Instance setting "Sign-in links by email" ("1" = on, absent = off). */
export const MAGIC_LINK_SETTING = "magic_link_enabled";

/** Email is configured when both the binding and a sender address exist. */
export const emailConfigured = (env: Env) => !!env.EMAIL && !!env.EMAIL_FROM?.trim();

/** Sign-in links are offered: email is configured and an instance admin turned them on. */
export async function magicLinkEnabled(env: Env): Promise<boolean> {
  return emailConfigured(env) && (await getSetting(env.DB, MAGIC_LINK_SETTING)) === "1";
}

/** "Name <a@b.c>" or "a@b.c" → the builder's `from`. */
export function sender(from: string): string | { email: string; name: string } {
  const m = from.trim().match(/^(.*?)\s*<([^>]+)>$/);
  return m && m[1] ? { name: m[1].replace(/^"|"$/g, ""), email: m[2].trim() } : (m?.[2] ?? from.trim());
}

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends through the EMAIL binding. Throws the binding's error (it carries Cloudflare's `code` and message). */
export async function sendEmail(env: Env, msg: OutgoingEmail): Promise<void> {
  await env.EMAIL!.send({ from: sender(env.EMAIL_FROM!), to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const layout = (title: string, body: string) => `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;max-width:480px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${title}</h1>
${body}
</body></html>`;

export function magicLinkEmail(to: string, url: string, minutes: number): OutgoingEmail {
  const host = new URL(url).host;
  const note = `The link works once and expires in ${minutes} minutes. If you did not ask for it, ignore this email.`;
  return {
    to,
    subject: "Your Postflare sign-in link",
    text: `Sign in to Postflare (${host}):\n\n${url}\n\n${note}\n`,
    html: layout(
      "Sign in to Postflare",
      `<p style="margin:0 0 20px;color:#52525b">Click the button to sign in to ${escapeHtml(host)}.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Sign in</a></p>
<p style="margin:0;font-size:13px;color:#71717a">${note}<br><br>${escapeHtml(url)}</p>`,
    ),
  };
}

/** The admin's "Send test email" message. */
export function testEmail(to: string, host: string): OutgoingEmail {
  const text = `Email sending works for Postflare on ${host}: sign-in links by email can reach this address.`;
  return { to, subject: "Postflare test email", text: `${text}\n`, html: layout("Postflare test email", `<p style="margin:0;color:#52525b">${escapeHtml(text)}</p>`) };
}
