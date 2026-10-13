---
id: launch-announcement
version: 1
name: Launch announcement
summary: Announce a new product or major version on launch day, adapted per platform, with the link in the first reply so reach is not throttled.
goal: clicks
platforms: [x, bluesky, threads, mastodon, linkedin, linkedin_page, instagram, instagram_standalone, short-video, reddit]
formats: [text, image, carousel, video]
tags: [launch, product, announcement, mobile-app, game, saas]
inputs: [product name, what it does in one sentence, who it is for, the one standout feature, price or free tier, launch link, a demo video or screenshots, launch date and timezone]
---

## When to use
Use on the day a new product, app, game or major version (2.0, a redesign, a new platform) goes live and there is a link people can act on right now. Not for small updates. The goal is clicks, so every version must answer "what is it, who is it for, why now" before asking for the click.

## Structure
1. **Line 1, the hook (≤ 70 characters, no emoji first):** what it is plus who it is for, or the problem it ends. Name the product.
2. **Line 2–3, the proof:** the one standout feature, shown concretely (a number, a before/after, a 5-second demo).
3. **Line 4, the offer:** price, free tier or launch discount with a real end date, platforms (iOS, Android, web).
4. **Line 5, the soft ask:** "Link below" on platforms where the link goes in a reply or first comment.
5. **Follow-up (`thread` item in Postflare):** the link, plus one line of context (a launch code, or "feedback welcome"). On X/Bluesky/Threads/Mastodon this becomes the first reply; on Instagram/LinkedIn/YouTube/Facebook it becomes the first comment.
6. **Sequencing on launch day:** post the X/Bluesky/Threads version first (morning in the audience's timezone), LinkedIn 1–2 hours later, Instagram/TikTok short video around lunch or evening, Reddit only where self-promotion is allowed. Space them so you can answer replies.

## Platform notes
- **X:** 280 chars (Premium 25,000). A URL counts as 23 chars, but links in the main post cut reach and the X API bills posts with URLs much more, so put the link in the first reply. Attach the demo video or a screenshot to the main post.
- **Bluesky:** 300 graphemes. Links render as cards; a reply link keeps the main post clean, either works.
- **Threads:** 500 chars, one topic tag (e.g. the category, "Indie Dev"). Link in the reply.
- **Mastodon:** 500 chars default. CamelCase hashtags (#IndieDev, #iOSApps) for screen readers. Links are fine in the body; lead with what it does, not an ad.
- **LinkedIn:** 3,000 chars, fold after ~210 chars / 3 lines, so the hook and who-it-is-for must land above "…see more". Links in the body reduce reach; put it in the first comment.
- **Instagram:** caption 2,200 chars, fold at ~125 chars, no clickable links, so say "link in bio" and update the bio link before posting. Carousel or Reel; 3–5 relevant hashtags, alt text on every image.
- **TikTok / Reels / Shorts:** vertical 9:16, the first 1–2 seconds must show the product doing its thing, with on-screen text naming the problem. TikTok caption 2,200 chars, 3–5 hashtags. Shorts title ≤ 100 chars and the first comment can carry the link.
- **Reddit:** title-first, read the subreddit rules, only post where launches are allowed (some subs have a weekly self-promo thread), keep a healthy self-promotion ratio, write as a maker, not a brand.

## Hooks
- **For-who-plus-what:** "{Product} is a {category} for {specific audience} who {pain}." — the right person self-selects in one line.
- **The thing it ends:** "No more {annoying ritual}. {Product} is live." — names the pain the click resolves.
- **Shipped-after-time:** "{N} months of nights and weekends. {Product} is out today." — the maker story earns attention; follow with what it does.
- **Version jump:** "{Product} {version} is out: {biggest change in 6 words}." — for existing users, the change is the news.

## Examples
### X (main post + first reply)
```
Pocket Plants is out: a plant-care app that tells you when to water based on your actual window light, not a generic schedule.

Snap a photo, it IDs the plant and sets reminders.

Free for 5 plants, $2.99/mo after. iOS + Android.

Link below.
```
(242 chars)

Reply:
```
App Store + Google Play: pocketplants.app
Launch week: first month free with code SPROUT (ends Oct 20).
```

### LinkedIn (personal profile)
```
I spent 8 months building a plant-care app because I killed three fiddle-leaf figs in a row.

Today Pocket Plants is live on iOS and Android.

The problem: every watering app uses a fixed schedule. Plants don't care about schedules; they care about light.

What it does:
- Identifies the plant from a photo
- Asks which window it sits by
- Adjusts watering reminders to the season and the light

Free for up to 5 plants. Link in the first comment.

If you try it, I'd love to hear which plant it got wrong.
```

### Threads
```
Tiny Tower Defense 2.0 is out: endless mode, 12 new towers, and you can finally undo a misplaced tower.

Built solo, no ads, one-time $3.99.

Link in the reply. #IndieGames
```
(172 chars, one topic tag)

## Avoid
- The link in the main post on X or LinkedIn; it costs reach and on X costs API money.
- One identical caption pasted to every platform; rewrite the hook and length per platform.
- Fake urgency ("only today!") without a real deadline.
- Leading with "I'm so excited to announce" instead of what the product does.
- Hashtag stuffing and emoji walls.
- Saying "link in bio" on X, Bluesky, Threads, Mastodon or LinkedIn, where a reply link works.
- Launching on Reddit in subs that ban self-promotion, or posting from a fresh account.

## Checklist
- [ ] The hook names the product and says what it does or who it is for in ≤ 70 characters.
- [ ] One concrete standout feature or proof point is in the first three lines.
- [ ] Price, free tier and platforms are stated; any deadline is real.
- [ ] On X and LinkedIn the link is in a `thread` follow-up, not the main post.
- [ ] Instagram bio link is updated if the caption says "link in bio".
- [ ] Each platform has its own version within its character limit and fold.
- [ ] Demo video or screenshot attached, with alt text on images.
- [ ] Posts are spaced across launch day so replies can be answered.
- [ ] Reddit target subreddits allow launch posts.
