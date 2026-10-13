---
id: text-thread
version: 1
name: Text thread
summary: A multi-post thread on X, Bluesky, Threads or Mastodon with a standalone first post, one idea per post and the link in the last reply.
goal: reach
platforms: [microblog]
formats: [thread, text, image]
tags: [thread, long-form, educational, storytelling, mobile-app, game, saas]
inputs: [topic, the one promise of the thread, 4-10 key points, supporting numbers or examples, product name if relevant, link for the last reply]
---

## When to use
Use when an idea needs more than one post: a story, a breakdown, a step-by-step, lessons from a launch. Threads get reach when the first post works on its own and each later post rewards the reader for continuing. If the content fits in one post, write one post (see how-to-tip). Keep it to 4–10 posts; longer threads lose readers.

## Structure
1. **Post 1, standalone hook:** makes a complete promise or claim that is worth reading even if nobody expands the thread. ≤ 200 characters is ideal. End with a pointer like "Here's how:" or a numbering cue. No link.
2. **Numbering:** "1/" style or "1/7" at the start or end of each post. Use a total only if it is final; Postflare publishes the thread as written, so the number must match.
3. **Posts 2 to N-1, one idea each:** one point, one example or number, ≤ 3 short paragraphs. Each post should make sense if quoted alone.
4. **Pacing:** alternate claim posts with proof posts (a screenshot, a number, a before/after). An image every 3–4 posts keeps scrollers.
5. **Second-to-last, the summary:** the key takeaway in one or two lines.
6. **Last post, the link and CTA:** the link plus one line of why to click. In Postflare, each post after the first is a `thread` item; put the link only here.

## Platform notes
- **X:** 280 chars per post (Premium 25,000, but threads of short posts read better than one long post). A URL counts as 23 chars; links in the main post cut reach and the X API bills posts with URLs much more, so the link goes in the last reply only. Up to 4 images per post.
- **Bluesky:** 300 graphemes per post. Links become cards; keep the card in the last post. Custom feeds pick up topic words, so name the topic plainly in post 1.
- **Threads:** 500 chars per post, one topic tag on post 1. Fewer, fuller posts work (4–6).
- **Mastodon:** 500 chars default (varies by server). CamelCase hashtags (#IndieDev) on post 1 only. Consider unlisted visibility for replies so the thread does not flood followers' timelines (if the server supports it). Use content warnings for topics like burnout or money if that is the norm on the server.
- Write a separate version per platform when limits differ; do not split a 500-char Threads post mid-sentence for X.

## Hooks
- **Outcome + receipt:** "{Product} went from {A} to {B} in {time}. Everything that worked, and what didn't:" — a concrete result earns the click to expand.
- **Teardown:** "I studied {N} {examples}. {M} patterns kept showing up:" — signals research and promises a list.
- **Step-by-step:** "How to {specific outcome} without {common cost}, step by step:" — clear promise and structure.
- **Story:** "{Unexpected event} happened to {product} last {time}. Here's what we learned." — a narrative pulls readers forward.

## Examples
### X (6 posts)
```
1/ Tiny Tower Defense made $0 for 5 months, then $2,100 in one week after a single change to the first 60 seconds.

Here's what we changed and why it worked:
```
(157 chars)
```
2/ Our data: 70% of players quit before wave 3. Not because it was hard. Because nothing happened. Wave 1 was 40 seconds of slow enemies walking.
```
```
3/ Fix one: wave 1 now ends in 15 seconds with a boss you can't lose to. Players see the payoff (explosions, upgrades) before they decide to stay.
```
```
4/ Fix two: we moved the first tower upgrade from wave 5 to wave 2. The core loop is "place, upgrade, watch it pop". Players need to feel it in the first minute.
```
```
5/ Result: wave 3 retention went from 30% to 64%. Same game, same art, same price. Only the first minute changed.

Lesson: your first minute is your real store page.
```
```
6/ If you want to see the new first minute, it's free to try: tinytowerdefense.com
```

### Threads (4 posts, post 1)
```
Tempo hit 1,000 paying users. I made almost every pricing mistake on the way there, so here are the four that cost the most, one per post. #IndieDev
```
(148 chars; posts 2-4 cover one mistake each, link in post 4)

## Avoid
- A first post that only teases ("A thread, read on") with no standalone value.
- A link in the first post on X; it costs reach and API money.
- Numbering totals that do not match the actual thread length.
- Two ideas crammed into one post, or one idea stretched over three.
- Filler posts ("Let's dive in", "Buckle up").
- "Retweet the first post if this helped" and similar engagement bait.
- Copying an X thread unchanged to Threads or Mastodon where the limits differ.
- Hashtags on every post; only the first, and only where the platform uses them.

## Checklist
- [ ] Post 1 stands alone, has no link, and promises one clear outcome.
- [ ] Every post holds one idea and fits the platform limit.
- [ ] Numbering is consistent and any total matches the thread length.
- [ ] At least one post carries proof (number, screenshot or example).
- [ ] The link appears only in the last `thread` item.
- [ ] Thread length is 4–10 posts.
- [ ] Each platform has its own split, not a copy of the X version.
- [ ] Images have alt text.
