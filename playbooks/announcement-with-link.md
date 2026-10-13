---
id: announcement-with-link
version: 1
name: Announcement with a link
summary: Announce a blog post, sale, event or release where the goal is a click, with the link placed where each platform rewards it.
goal: clicks
platforms: [all]
formats: [text, image, video]
tags: [mobile-app, game, announcement, link, launch, sale, event]
inputs: [what is being announced, the URL with UTM tags per platform, the one reason to click, deadline or date if real, an image or short video, platforms to post on]
---

## When to use
- A new blog post, devlog, changelog, case study or newsletter issue.
- A sale or price change with a real end date.
- An event: a livestream, a launch on a directory, a meetup, a beta signup.
- Any post where success is measured in clicks, not likes.

If the goal is awareness of a feature, use a feature or video playbook instead; a link post is the wrong tool for reach.

## Structure
1. **Line 1: the reason to click, ≤ 80 characters.** What the reader gets, not what you did. "How we cut our app's size from 180 MB to 42 MB" beats "New blog post!".
2. **Lines 2–3: one or two specifics** that make the click feel worth it (a number, a list of what's inside, the date and time of the event).
3. **The ask.** A plain call to action naming the place: "Read it in the reply below", "Link in bio", "Tap the card".
4. **The link, placed per platform** (see Platform notes). Add UTM parameters (`utm_source=x`, `utm_source=linkedin`…) so clicks can be compared.
5. **Media.** An image or short video that previews the content (a chart from the post, the sale price, the event speaker). On platforms with link cards, check the page's Open Graph image looks right.
6. **Follow-up items.** In Postflare, follow-ups are thread replies on X/Bluesky/Threads/Mastodon and the first comment on YouTube/Instagram/Facebook/LinkedIn. Use them for the link where the main post should stay link-free.

## Platform notes
- **X:** 280 characters (Premium 25,000), a URL counts as 23. Links in the main post reduce reach, and the X API bills posts containing URLs at a much higher rate. Put the link in the first reply (follow-up) and say so in the post.
- **Bluesky:** 300 graphemes. Links are fine in the post and render as a link card with title and image; one link per post. No penalty culture around links.
- **Threads:** 500 characters, one topic tag. Links work in the post, but a reply keeps the main post conversational; either is acceptable.
- **Mastodon:** 500 characters by default, links are normal and expected; CamelCase hashtags. Add a content warning if the topic calls for it (e.g. layoffs).
- **LinkedIn:** 3,000 characters, fold at ~210. External links in the body reduce reach; put the link in the first comment (follow-up) and write "link in the first comment".
- **Facebook:** long text is fine. Link in the first comment tends to keep reach; a link in the body generates a preview card if you prefer that.
- **Instagram:** no clickable links in captions. Say "link in bio" and make sure the bio link (or link page) is updated before the post goes live. Stories link stickers are posted by hand.
- **TikTok / Shorts:** TikTok captions are not clickable; point to the profile link. On YouTube Shorts, put the link in the first comment (follow-up) and pin it.
- **Pinterest:** title ≤ 100, description ≤ 500. The link is the pin's destination URL, so set it; no "link in bio" needed. Vertical 2:3 image.
- **Reddit:** check the subreddit rules on self-promotion first. Title states the value; for link posts, the URL is the post. Many subs prefer a text post with context and the link inside.

## Hooks
- **What you get:** "{Specific outcome} — {how} ({format/length})." — the click has a clear payoff.
- **Number inside:** "We {did thing}: {number} {result}. Full breakdown inside." — specificity earns the click.
- **Deadline (real only):** "{Offer} until {date, time, timezone}." — urgency is fine when it is true.
- **The question the link answers:** "Why does {surprising thing} happen? We dug into {source}." — curiosity with a promised answer.

## Examples
### X (main post 157 characters + reply)
```
How we got Tiny Tower Defense from 180 MB to 42 MB without cutting a single level.

Texture packing, audio streaming, one dropped SDK. Write-up in the reply.
```
Reply (follow-up): "https://tinytower.example/blog/42mb?utm_source=x"

### LinkedIn (link in first comment)
```
Pocket Plants is 50% off yearly until Sunday, Oct 18, 23:59 CET.

It's our first sale in two years. The price goes back to normal Monday.

What's in it: weather-aware watering reminders, photo plant ID and a shared list for households.

Link in the first comment.
```
First comment (follow-up): "https://pocketplants.example/sale?utm_source=linkedin"

### Bluesky (link card, 182 graphemes)
```
Tempo devlog #12 is out: we tried 5 ways to block notifications on Android and only 2 survived Play review. Here's what worked and what got rejected.

https://tempo.example/devlog/12
```

### Instagram (caption, link in bio)
```
Live on Thursday, Oct 15, 18:00 UTC: we build a new Tiny Tower Defense level from scratch, and you vote on the boss.

Link in bio to set a reminder.

#IndieGame #GameDev #Devlog
```

## Avoid
- A URL in the main post on X or in the LinkedIn body.
- "Link in bio" on Bluesky, Mastodon, Facebook or Pinterest, where links work.
- Forgetting to update the Instagram bio link before the post publishes.
- "New blog post!" with no reason to click; vague teasers that hide what the link is.
- Fake urgency ("last chance!" with no end date, or a sale that never ends).
- Shortened links that hide the domain; use the real domain with UTMs.
- The same caption and link placement copied to every platform.

## Checklist
- [ ] Line 1 says what the reader gets, ≤ 80 characters.
- [ ] Link placement matches each platform (X reply, LinkedIn/Facebook/YouTube first comment, Instagram bio, Bluesky card, Pinterest destination).
- [ ] The post text tells people where the link is.
- [ ] URLs carry per-platform UTM tags and the page loads.
- [ ] The link card or Open Graph image renders correctly where cards appear.
- [ ] Any deadline is real and includes date, time and timezone.
- [ ] Instagram bio link is updated (or the user is told to).
- [ ] Length fits each platform (X 280 with URLs at 23, Bluesky 300, Threads/Mastodon 500).
