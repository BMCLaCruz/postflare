/**
 * Outgoing email (sign-in links). Two transports, picked by what the deployment configures:
 * - a Cloudflare `send_email` binding named EMAIL (Email Service; on the Workers Free plan it can only send to
 *   verified destination addresses of the account, which is enough for a personal instance),
 * - or a RESEND_API_KEY secret (any recipient, Resend's free tier is 3,000 emails a month).
 * EMAIL_FROM is the sender, e.g. "Postflare <login@example.com>" (its domain must be set up with the transport).
 */
export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export function emailEnabled(env: Env): boolean {
  return !!env.EMAIL_FROM?.trim() && (!!env.EMAIL || !!env.RESEND_API_KEY);
}

export async function sendEmail(env: Env, msg: OutgoingEmail): Promise<void> {
  const from = env.EMAIL_FROM!.trim();
  if (env.EMAIL) {
    await env.EMAIL.send({ from, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from,
      to: [msg.to],
      subject: msg.subject,
      text: msg.text,
      html: msg.html,
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function loginLinkEmail(to: string, url: string, minutes: number): OutgoingEmail {
  const host = new URL(url).host;
  return {
    to,
    subject: "Your Postflare sign-in link",
    text: `Sign in to Postflare (${host}):\n\n${url}\n\nThe link works once and expires in ${minutes} minutes. If you did not ask for it, ignore this email.\n`,
    html: `<!doctype html><html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#18181b;max-width:480px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">Sign in to Postflare</h1>
<p style="margin:0 0 20px;color:#52525b">Click the button to sign in to ${escapeHtml(host)}.</p>
<p style="margin:0 0 24px"><a href="${escapeHtml(url)}" style="display:inline-block;background:#f97316;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:8px">Sign in</a></p>
<p style="margin:0;font-size:13px;color:#71717a">The link works once and expires in ${minutes} minutes. If you did not ask for it, ignore this email.</p>
</body></html>`,
  };
}
