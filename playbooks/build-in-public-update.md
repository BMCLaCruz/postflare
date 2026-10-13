---
id: build-in-public-update
version: 1
name: Build-in-public update
summary: A weekly or monthly numbers-plus-lesson post (revenue, users, what failed) that turns a product's progress into a reason to follow the maker.
goal: followers
platforms: [x, bluesky, threads, mastodon, linkedin, reddit]
formats: [text, thread, image]
tags: [build-in-public, indie-hacker, metrics, mobile-app, game, saas]
inputs: [product name, period covered, the 2-4 numbers to share and last period's values, what worked, what failed, the one lesson, what is next, a chart or dashboard screenshot]
---

## When to use
Use on a fixed cadence (every Monday, or the 1st of the month) to report real numbers and one lesson. Followers come from consistency and honesty: people follow to see what happens next. Use it when there is at least one real number to share, including bad ones. Skip it if the numbers are confidential, or if nothing changed and there is no lesson; a forced update reads as filler.

## Structure
1. **Line 1, the headline number (≤ 70 characters):** product, period and the most interesting number with direction, e.g. "Tempo, month 4: $1,240 MRR (+18%)". If the interesting thing is a drop, lead with the drop.
2. **Lines 2–5, the numbers block:** 2–4 metrics, one per line, each with the previous value: revenue, users or downloads, conversion or churn. Same metrics every update so followers can compare.
3. **What worked (1–2 lines):** a specific action and its effect.
4. **What failed (1–2 lines):** a specific thing that did not work and the cost. This is the part people share.
5. **The lesson (1 line):** a transferable takeaway someone outside the project could use.
6. **Next (1 line):** what you will try before the next update, so there is a reason to come back.
7. **Image:** a cropped dashboard or simple chart, numbers readable on a phone, private data blurred.
8. On X, if it does not fit, use a short `thread`: post 1 is the headline and numbers, post 2 worked/failed, post 3 lesson and next.

## Platform notes
- **X:** 280 chars (Premium 25,000). The numbers block alone usually fits; move worked/failed/lesson into `thread` replies. No link needed; if you add one (the product), put it in the last reply, never the main post (reach and X API cost).
- **Bluesky:** 300 graphemes per post; same thread split works. The build-in-public crowd there likes plain, unpolished updates.
- **Threads:** 500 chars, enough for numbers plus lesson in one post. One topic tag, e.g. "Build In Public".
- **Mastodon:** 500 chars default. CamelCase hashtags (#BuildInPublic, #IndieDev). Avoid growth-hacker tone; candour about failures does well.
- **LinkedIn:** 3,000 chars, the fold after ~210 chars / 3 lines: headline number and the failure tease must sit above "…see more". Put any link in the first comment via a follow-up.
- **Reddit:** title-first ("Month 4 of my focus app: $1,240 MRR, and the feature that flopped"). Only in subs that allow progress posts (check rules and weekly threads); lead with the lesson, no link in the body unless rules allow.

## Hooks
- **Number + period:** "{Product}, {period}: {metric} ({change})." — scannable, sets the same frame every time so followers recognise the series.
- **The failure first:** "I spent {time or money} on {thing}. It brought {tiny result}." — honest losses get more replies than wins.
- **Milestone with cost:** "{Product} hit {milestone}. It took {time} and {number} failed attempts." — the cost makes the milestone credible.
- **Counterintuitive driver:** "{Metric} grew {change} this {period}. Not from {expected thing}." — creates a curiosity gap the next lines close.

## Examples
### X (main post, thread follow-ups)
```
Tempo, month 4: $1,240 MRR (+18%)

Trials: 610 (was 540)
Trial to paid: 9.1% (was 7.8%)
Churn: 4.2% (was 5.0%)

What moved it and what flopped below.
```
(149 chars)

Reply 1:
```
Worked: moving the paywall from day 1 to after the third finished focus session. People pay once they have felt it work.

Flopped: a $40 lifetime deal. 11 sales, then a week of refund requests from people who never opened the app.
```

Reply 2:
```
Lesson: price for the people who already got value, not for bargain hunters.

Next month: testing a yearly plan at 2x monthly. Will report back.
```

### LinkedIn
```
Pocket Plants, September: 3,900 active users, but revenue went down 6%.

Here's what happened.

Numbers:
- Active users: 3,900 (was 3,100)
- Paying: 212 (was 225)
- MRR: $634 (was $675)

What worked: a TikTok of the app identifying a dying monstera brought 800 installs in four days.

What failed: those users came for the free plant ID and never set up reminders, so they never hit the paywall.

Lesson: a viral feature is not the same as your value moment. Growth that skips the value moment shows up in installs and nowhere else.

Next: prompting reminder setup right after the first ID.
```

## Avoid
- Only posting good months; skipped updates are noticed and break trust.
- Vanity numbers without context (raw downloads without active users or revenue).
- Changing which metrics you report so the trend looks better.
- Humblebrag hooks ("can't believe this is happening") with no number.
- "Follow me for more updates" or follow-for-follow lines; the series itself is the reason to follow.
- Generic lessons ("consistency is key"); the lesson must come from this period's data.
- Screenshots with tiny unreadable numbers or unblurred customer emails.
- Product links in the main post on X or LinkedIn.

## Checklist
- [ ] The headline names the product, the period and one number with direction.
- [ ] Each metric shows the previous value, and they are the same metrics as the last update.
- [ ] At least one specific failure is included.
- [ ] The lesson is specific and transferable, one line.
- [ ] A "next" line gives a reason to check back.
- [ ] Each post fits the platform limit; X/Bluesky overflow goes into `thread` follow-ups.
- [ ] Screenshot is readable on a phone, private data blurred, alt text added.
- [ ] Any link sits in the last reply or first comment.
- [ ] Numbers were confirmed with the user, not estimated.
