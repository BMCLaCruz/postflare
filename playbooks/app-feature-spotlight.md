---
id: app-feature-spotlight
version: 1
name: App feature spotlight
summary: One feature, one problem, shown in under 10 seconds — the post that sells an app without a sales pitch.
goal: conversions
platforms: [short-video, instagram, instagram_standalone, x, threads, bluesky]
formats: [video, image, carousel]
tags: [mobile-app, product, feature, demo]
inputs: [app name, the one feature to show, the problem it solves in the user's words, a screen recording or screenshots, store link, price or free tier]
---

## When to use
Use when you want installs from people who don't know the app yet. Pick exactly one feature that solves a problem people already complain about ("I forget to water my plants", "I can't focus for more than 10 minutes"). Good for a new feature, a feature users keep praising in reviews, or an evergreen core feature you can re-spotlight every few weeks with a new angle. Not for release roundups (use app-update-notes-to-social) or for listing five features at once.

## Structure
1. **Line 1 / first second: the problem**, ≤ 70 characters, in the user's words, no emoji at the start. "I kept killing my plants" beats "Introducing Smart Reminders".
2. **The feature solving it, on screen, within 3 seconds.** Use a real screen recording of the app (iOS Control Center screen recording or Android's built-in recorder), not the App Store marketing screenshots. Crop the status bar or set a clean time (9:41 is the Apple convention); hide notifications.
3. **One concrete outcome**: a number, a before/after, or the moment of relief ("now it pings me the day the soil is dry").
4. **One CTA**, soft by default: the app name plus where to get it. On platforms with clickable links put it in a follow-up, not the main post.
5. **Total video length 7–20 seconds.** Loop-friendly endings (cut back to the problem state) help replays.

## Platform notes
- **TikTok / Reels / Shorts:** vertical 9:16, 1080x1920. The first 1–2 seconds decide whether the video gets distributed, so open on the problem as on-screen text over the app already moving. Keep captions inside the safe zone (away from the bottom 20% and the right-side buttons). Caption up to 2,200 chars but 1–2 lines plus 3–5 hashtags is enough. TikTok and Instagram links aren't clickable in captions: say "search {app name} on the App Store" or "link in bio". YouTube Shorts: title ≤ 100 chars; use a Postflare follow-up as the first comment with the store link.
- **Instagram feed:** carousel of up to 10 frames (Postflare supports 10+): frame 1 states the problem, frames 2–4 show the feature, last frame shows the app icon and name. Caption fold at ~125 chars, so the problem goes first. Add alt text to every image.
- **X:** 280 chars (a URL counts as 23). Links in the main post reduce reach and the X API bills posts with URLs much more, so put the store link in the first reply via a Postflare follow-up. Attach the video natively.
- **Threads:** 500 chars, one topic tag (e.g. "Indie Apps" or "Productivity"). Link in a follow-up reply.
- **Bluesky:** 300 graphemes. A link card is fine here and doesn't carry the X penalty, but the video still goes first; put the link in a reply if the post already has video.
- **Measuring installs:** use an App Store campaign link (`apps.apple.com/app/id123456789?pt={provider-token}&ct=tiktok-spotlight`) so App Store Connect shows installs per campaign, and Play Store `&referrer=utm_source%3Dtiktok%26utm_campaign%3Dspotlight`. A smart link (one URL that routes iOS vs Android) is fine if it preserves those parameters.

## Hooks
- **Pain in their words:** "I {failed at thing} for {time}. Then I found this." — mirrors a thought the viewer has had, so they self-select.
- **Watch it happen:** "{Task} in {seconds} seconds:" — promises a fast payoff, which keeps people watching to the end.
- **The tiny detail:** "The {feature} in {app name} nobody talks about" — curiosity about something small and specific, credible because it's shown immediately.
- **Old way vs new way:** "{Old annoying way} vs {app name}" — split screen does the persuading, no claims needed.

## Examples
### TikTok (video caption + on-screen text)
```
On-screen 0-2s: "I killed 4 plants this year"
On-screen 2-6s: [scan a plant -> Pocket Plants identifies it]
On-screen 6-10s: "now it tells me the exact day to water"
On-screen end: "Pocket Plants · App Store + Google Play"

Caption:
Scan once, get a watering schedule that adjusts to the season. Free on iOS and Android, search Pocket Plants 🌱
#planttok #plantcare #houseplants #indieapp
```
(Caption: 154 characters)

### X (post + follow-up)
```
I kept breaking focus every 8 minutes.

Tempo's "hard mode" locks the timer: no pause button, no skipping the break. 25 minutes and it's done.

[video: 12s screen recording]
```
(Post: 142 characters)
```
Follow-up: Tempo is free on iOS, hard mode included: https://apps.apple.com/app/id123456789?pt=000000&ct=x-spotlight
```

## Avoid
- Listing features ("Reminders! Widgets! Dark mode!"). One post, one feature.
- Leading with the app name or "Introducing…": nobody cares yet.
- Using App Store marketing screenshots with device frames and gradient captions on TikTok/Reels; they read as ads and get scrolled. Real recordings look native.
- Fake urgency ("only today", "before it's gone") for an app that is always available.
- Store link in the main post on X or LinkedIn; "link in bio" on Bluesky, Threads replies or YouTube where links work.
- Calling the app "the best" or comparing to a named competitor by name.
- The same caption pasted to every platform.

## Checklist
- [ ] Exactly one feature and one problem, and the problem is in line 1 / the first 2 seconds.
- [ ] The video or images are real in-app captures with no personal data, notifications or debug UI visible.
- [ ] Video is vertical 9:16 and under ~20 seconds for short-video platforms.
- [ ] One CTA only, and it names the store(s) where the app is actually available.
- [ ] Links sit in a follow-up on X, Threads, Instagram, YouTube; none in TikTok captions.
- [ ] The store link carries a campaign token or UTM so installs can be attributed per platform.
- [ ] Character limits checked per platform (X 280, Bluesky 300, Threads 500).
- [ ] Alt text added to images.
- [ ] Price claims ("free", "no ads") match the current store listing.
