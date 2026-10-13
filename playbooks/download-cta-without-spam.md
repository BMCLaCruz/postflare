---
id: download-cta-without-spam
version: 1
name: Download CTA without the spam
summary: Ask for the install after giving value first, with one CTA, the right link placement per platform and trackable store links.
goal: conversions
platforms: [all]
formats: [text, thread, image, carousel, video]
tags: [mobile-app, game, cta, conversion, store-links]
inputs: [app or game name, the value the post gives on its own, iOS and Android store links, price model, App Store campaign provider token or UTM scheme, whether the app is live or in pre-registration or TestFlight]
---

## When to use
Use whenever a post includes an ask to download, install, pre-register or join a beta. This playbook is a layer on top of other content: write the post with another playbook (feature spotlight, game clip, update notes), then apply these rules to the CTA. Rule of thumb for an account's feed: most posts give something (a tip, a laugh, a behind-the-scenes look) with no hard CTA; roughly one post in four or five asks directly. An account that asks every time trains its followers to scroll past.

## Structure
1. **Value first.** The post must be worth reading for someone who never installs: a useful tip, a satisfying clip, a story. If you delete the CTA and the post is empty, rewrite it.
2. **Choose soft or hard CTA.**
   - *Soft:* names the app and where it lives, no imperative. "Tempo is free on iOS." Use for most posts.
   - *Hard:* direct ask with a reason and the link. "Try the 7-day challenge in Tempo: {link}". Use for launches, big updates, sales that are real.
3. **One CTA per post.** Not "download, follow, share and leave a review".
4. **Make the CTA specific:** what they get, what it costs, which platforms. "Free, no account needed, iPhone and Android" removes the three common objections.
5. **Place the link where the platform rewards it** (see notes). In Postflare, use a follow-up item for links on X, Threads, Bluesky, Mastodon, and as the first comment on Instagram, YouTube, Facebook and LinkedIn.
6. **Make the link measurable.** App Store: `https://apps.apple.com/app/id{appId}?pt={providerToken}&ct={campaign}` (App Store Connect shows impressions, product page views and installs per `ct`). Google Play: `https://play.google.com/store/apps/details?id={package}&referrer=utm_source%3D{platform}%26utm_campaign%3D{campaign}`. One smart link that detects the device is fine if it forwards these parameters; test both iOS and Android before posting.

## Platform notes
- **X:** 280 chars; a URL counts as 23. Links in the main post cut reach and the X API bills posts containing URLs much more, so put the store link in the first reply via a follow-up.
- **Bluesky:** 300 graphemes. Links don't carry a reach penalty; a link card with the store page preview is fine in the main post if there's no video.
- **Threads:** 500 chars, one topic tag. Link in a follow-up reply.
- **Mastodon:** 500 chars; links are fine in the post. Audiences there dislike marketing tone; a soft CTA fits best.
- **Instagram:** caption links aren't clickable. "Link in bio" plus the store name. Add the store link as a Postflare follow-up (first comment) anyway; some people copy it.
- **TikTok:** no clickable caption links. "Search {app name} on the App Store / Google Play" works better than "link in bio" for accounts without a bio link.
- **YouTube Shorts:** first comment (follow-up) holds the link; the description link is less visible on Shorts.
- **LinkedIn:** 3,000 chars, fold after ~210 chars. Links in the body reduce reach; first comment via follow-up.
- **Facebook:** link in the first comment.
- **Pinterest:** the pin's destination link is the CTA itself; point it at the store or a landing page.
- **Reddit:** read the subreddit rules; many ban direct store links or limit self-promotion (keep your own-content posts a small share of your activity there). Disclose you're the developer.
- **Store badges:** in images, use Apple's official "Download on the App Store" badge and Google's "Get it on Google Play" badge unmodified (no recoloring, stretching or cropping). Don't use the Apple logo alone, "iPhone app" as part of the app's name, or wording that suggests Apple or Google endorses the app.

## Hooks
- **Value then name:** "{Useful tip}. (I built {app name} to do this automatically.)" — the tip carries the post; the app is the obvious next step.
- **Objection killer:** "Free, no sign-up, works offline: {what it does}." — answers why-not before they ask.
- **Real reason to act now:** "{App name} is {price/free} until {real date}." — urgency only when the deadline is real.
- **Pre-launch:** "Pre-register on Google Play and it installs itself on {launch date}." — tells them exactly what happens next.

## Examples
### Threads (post + follow-up)
```
Water plants by the soil, not the calendar. Push a finger 2 cm in: dry means water, damp means wait. Pots without drainage holes need half as much.

I made Pocket Plants so I'd stop forgetting the finger test. Free on iPhone and Android.
```
(Post: 237 characters)
```
Follow-up: https://pocketplants.example/get?utm_source=threads&utm_campaign=soil-tip
```

### X (hard CTA, launch day)
```
Tiny Tower Defense is out today.

30 waves, no energy timers, no ads between levels. One-time unlock after wave 10 if you like it.

Free to start on iOS and Android.
```
(Post: 165 characters)
```
Follow-up: App Store: https://apps.apple.com/app/id123456789?pt=000000&ct=x-launch
Google Play: https://play.google.com/store/apps/details?id=com.example.tinytd&referrer=utm_source%3Dx%26utm_campaign%3Dlaunch
```

## Avoid
- "Download now!!!" with nothing else in the post.
- Several CTAs in one post (download + follow + rate + share).
- Fake urgency: "last chance", countdowns to nothing, "limited spots" for an app anyone can install.
- Store links in the X or LinkedIn main post; "link in bio" on Bluesky or Mastodon where links work.
- Modified store badges, the Apple logo used decoratively, or "approved by Apple/Google" wording.
- Untracked bare links, so you can't tell which platform drove installs.
- Promising "free" when core features are behind a paywall without saying so.
- Linking to a TestFlight or pre-registration page without saying it's a beta or not yet released.

## Checklist
- [ ] The post is still worth reading with the CTA removed.
- [ ] Exactly one CTA, soft or hard chosen on purpose.
- [ ] Price model, platforms and availability are stated accurately.
- [ ] Link placement matches the platform (follow-up on X, Threads, Instagram, YouTube, LinkedIn, Facebook).
- [ ] Every store link carries a campaign token (`ct`) or Play referrer UTM, unique per platform.
- [ ] Both iOS and Android links (or the smart link) were opened and land on the right store page.
- [ ] Store badges, if shown, are official and unmodified.
- [ ] Any urgency refers to a real date or real offer.
- [ ] Recent posts on this account weren't all hard CTAs too.
