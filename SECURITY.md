# Security policy

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Report them privately through
[GitHub Security Advisories](https://github.com/FerdiKT/postflare/security/advisories/new) ("Report a vulnerability"
on the repository's Security tab).

Include what you found, how to reproduce it and the impact you expect. You will get an answer as soon as possible; once a
fix is released the advisory is published with credit to you (unless you prefer otherwise).

## Supported versions

Fixes go to the `main` branch and the latest release of the `postflare` npm package. Self-hosted instances get them by
redeploying from an up-to-date checkout.

## Hardening your instance

- Set the `SECRET_KEY` secret before connecting accounts. Without it the encryption key of the stored platform tokens
  lives in D1 next to them (anyone with a database export can decrypt them).
- Create the first user right after deploying, or set the `SETUP_TOKEN` secret first: until an account exists, whoever
  opens the URL first becomes the instance admin.
- Passwords are hashed with PBKDF2-SHA256 at 20,000 iterations (what fits the Workers Free plan's CPU budget). Online
  guessing is throttled (5 failures per IP or IPv6 /64 and 10 per email per 15 minutes), but use long, unique
  passwords: an offline attack on a leaked database is cheaper than with a slower hash.
- Sign-in links by email are off unless an instance admin turns them on (Admin → Instance settings). Links are single
  use, expire after 15 minutes, carry the token in the URL fragment (only its SHA-256 is stored) and are spent by a
  button press on `/auth/link`, not by opening the page, so mail scanners cannot use them. Requests answer the same for
  unknown emails (lookup and sending happen after the response) and are throttled (3 per email, 10 per IP per 15
  minutes). Signing in with one ends the user's other open links; disabling or deleting a user, or turning the feature
  off, ends them all. Anyone who can read the user's mailbox can sign in as them, like with a password reset.
- Public sign-up (hosted mode) is off unless an instance admin turns it on. With email configured, accounts stay
  `pending` (cannot sign in) until the emailed link (24 hours, single use, token in the URL fragment, spent by a button
  press on `/auth/verify`) is used, and the answer is the same whether or not the email already has an account (its
  owner is told to sign in instead). Without email, sign-up is immediate and reveals whether an email is registered
  (409): configure email before opening sign-up publicly. Sign-ups are throttled to 5 per IP (IPv6 /64) per hour;
  unverified accounts are deleted after 7 days.
- Payment provider webhooks (`/api/billing/webhooks/:provider`) are public and authenticated only by their signature:
  HMAC-SHA256 checked in constant time (`crypto.subtle.verify`) against the provider's signing secret (Polar: Standard
  Webhooks with a 5 minute timestamp tolerance; Stripe: `Stripe-Signature`, 5 minutes; Lemon Squeezy: `X-Signature`,
  no timestamp in their scheme, so replays are stopped by deduplication on the body hash and by ignoring events older
  than the last applied change). Every event is recorded in `billing_events` and applied once. Provider credentials are
  stored encrypted like platform tokens and never returned by the API. Keep the webhook route out of rate limiting
  rules, and rotate a signing secret in the provider's dashboard and in Admin → Billing if it leaks.
- An API key only acts inside its own workspace, with its user's member role there. It never carries instance-admin
  permissions (users, roles, platform apps, settings), even when its user is an instance admin; those need a browser
  session.
- Upload links and invitation links are bearer credentials until they expire (at most 7 days); public media links
  (`/m/...`) never expire while the media exists, because platforms download from them.

## Scope

In scope:
- The Worker and web app in this repository: authentication, sessions, API keys, workspace isolation and permission
  checks, OAuth flows, encryption of stored tokens, media and upload links, the MCP server, the live demo sandbox,
  public sign-up, plan limits and billing webhooks.
- The `postflare` CLI (`cli/`).

Out of scope:
- Vulnerabilities of Cloudflare's platform or of the social networks' APIs (report them to those vendors).
- Misconfigured self-hosted instances (for example a weak password or a leaked API key).
- Rate limits or denial of service against an instance on the Workers Free plan's quotas.
- The public demo at postflare.ferdi.app beyond what is listed above (it is reset daily and never publishes).
