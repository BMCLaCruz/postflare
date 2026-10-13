---
id: before-after
version: 1
name: Before and after transformation
summary: An honest before/after with the same framing on both sides, so the change speaks for itself without hype.
goal: engagement
platforms: [short-video, instagram, instagram_standalone, x, threads, bluesky, linkedin, pinterest]
formats: [image, carousel, video]
tags: [mobile-app, game, transformation, redesign, metrics, progress]
inputs: [what changed, the before asset or number, the after asset or number, the time between them, what caused the change, any caveat that matters]
---

## When to use
- A visual change: app redesign, game art pass, onboarding screen rework, a user's plant/room/workout progress made with your app (with permission).
- A metric change: load time, crash rate, day-1 retention, build size, conversion of a paywall. Your own numbers, measured the same way twice.
- A process change: "my desk before Tempo / after three weeks of Tempo" told by the user it happened to.

Skip it when the "after" is a mockup that is not shipped yet, or when the difference only shows when you squint.

## Structure
1. **Same framing.** Same device, crop, angle, lighting, zoom, font size and time window on both sides. If the framing differs, the comparison is a lie even if the numbers are true.
2. **Label clearly.** "Before" on the left/first, "After" on the right/second, with the dates or version numbers. On a single image, a vertical split works on phones; a horizontal split works on desktop feeds.
3. **Line 1 of text: the delta in plain words, ≤ 80 characters.** "Our onboarding went from 7 screens to 2." Concrete, not "Huge glow-up!".
4. **The cause.** 1–3 lines on what you actually did. This is where the value is; people save before/afters to copy the method.
5. **The honest caveat.** Sample size, what got worse, or what is still unsolved. A caveat makes the claim more believable, not less.
6. **Soft close.** A question about their own before/after, or what you will try next. No hard sell.

## Platform notes
- **TikTok / Reels / Shorts:** 9:16 vertical. Show the after for a split second at 0:00, then the before, then the reveal; the first 1–2 seconds decide. Put "Before" and "After" as on-screen text, not only in the caption. TikTok caption up to 2,200 characters, 3–5 hashtags. Shorts title ≤ 100 characters.
- **Instagram:** carousel is the natural format (slide 1 the after or a split, slide 2 the before full size, slide 3 the method). Caption fold at ~125 characters, so the delta goes first. 3–5 relevant hashtags, alt text describing both images.
- **X:** 280 characters. Attach a single split image or two images side by side (X shows 2 images as a pair). Keep the method for a follow-up reply.
- **Bluesky:** 300 graphemes, up to 4 images; add alt text, the community expects it.
- **Threads:** 500 characters, one topic tag.
- **LinkedIn:** metric before/afters do best here; lead with the number in the first two lines before "…see more" (~210 characters).
- **Pinterest:** title ≤ 100, description ≤ 500; vertical 2:3 split pin with the method in text. The destination link can be the case study or store page.

## Hooks
- **Delta in one line:** "{metric} went from {before} to {after} in {time}." — a specific number is its own hook.
- **Same {thing}, {time} apart:** "Same screen, 8 months apart." — invites people to spot the differences.
- **One change:** "We changed one thing and {result}." — promises a transferable method.
- **Guess first:** "Which one is the new version?" — only if the answer is not obvious and you reveal it in the post or first reply.

## Examples
### Instagram carousel caption (Pocket Plants redesign)
```
Same screen, 9 months apart. The left one is why people deleted the app.

Slide 2 is the old "today" screen: 11 plants, 11 cards, every card the same size whether it needed water or not.

What changed:
- Only plants that need something today get a card
- Everything else collapses into one "all good" row
- The water button moved under your thumb

Honest part: some long-time users missed seeing every plant at once, so we added a toggle.

What is one screen in your own app you'd redo?

#AppDesign #UXDesign #IndieDev
```

### X (single split image, 189 characters)
```
Tiny Tower Defense cold start on a 2019 Android phone:

Before: 6.8 s
After: 2.1 s

Same phone, same build flags, average of 10 launches. Most of it was loading every level's audio at boot.
```
Follow-up reply: "What we changed, step by step: lazy-loaded audio per level, packed textures, removed one analytics SDK. Still slow on first install, working on it."

### TikTok (on-screen text + caption)
```
0:00 on-screen: "Tempo, March vs now"
0:01 old timer screen, text: "BEFORE: 4 buttons, 2 menus"
0:04 swipe to new screen, text: "AFTER: 1 button"
0:07 tap start, timer runs, text: "Fewer taps = more sessions started"

Caption (132 characters):
We cut the start screen to one button. Sessions started went up, sessions finished didn't. Working on that next. #IndieDev #UXDesign
```

## Avoid
- Different framing (better lighting, cropped, a different device) passed off as a like-for-like comparison.
- Cherry-picked or invented numbers, or a mockup labelled "after".
- Hype words in place of the delta ("insane glow-up", "game changer").
- Before/afters of users' results posted without their permission, or implying typical results from one outlier.
- Clickbait "you won't believe the after" that makes people leave when the reveal is small.
- The same caption copy-pasted to all platforms; reorder for each fold.

## Checklist
- [ ] Both sides use identical framing (device, crop, light, measurement method).
- [ ] Before and after are labelled, with dates or versions.
- [ ] Line 1 states the delta in plain words, before the fold.
- [ ] The cause or method is explained.
- [ ] At least one honest caveat is included.
- [ ] Any user's photo or data is used with their permission.
- [ ] Alt text describes both sides for image posts.
- [ ] Length fits each platform (X 280, Bluesky 300, Threads 500).
