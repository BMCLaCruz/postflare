---
id: indie-dev-behind-the-scenes
version: 1
name: Indie dev behind the scenes
summary: Share work-in-progress, bugs, design decisions and tools so people follow the person building the app, not just the app.
goal: followers
platforms: [microblog, short-video, linkedin, instagram, instagram_standalone, reddit]
formats: [text, thread, image, carousel, video]
tags: [mobile-app, game, indie-dev, build-in-public, behind-the-scenes, wip]
inputs: [app or game name, the specific thing being worked on, a WIP screenshot or recording or before and after, the decision or problem and how it was resolved, tools used, what the dev is willing to share publicly]
---

## When to use
Use for the steady, everyday posts between launches: a work-in-progress screen, a bug that turned out funny, a design choice with trade-offs, the tool stack, a before/after of a redesign. People follow people; an indie account that only posts ads gains few followers, while one that shows the work earns an audience that later installs, beta-tests and shares. Good cadence: 2–3 per week. Skip anything under NDA, unreleased platform features under Apple/Google beta terms, and any user data.

## Structure
1. **Pick one moment**, not a weekly recap: one bug, one decision, one before/after.
2. **Line 1: the tension**, ≤ 70 characters, no emoji at the start. "Spent 2 days on a bug caused by one emoji." "Which one would you ship?"
3. **The visual:** WIP screenshot, a screen recording with dev overlays, a before/after pair, a Figma frame, or a gif of the bug. Unpolished is the point, but crop out API keys, emails, analytics dashboards with user data, and TestFlight tester names.
4. **The why in 1–3 sentences:** what you tried, what you chose, what it cost.
5. **Invite expertise or opinion**, specific: "Would you keep the haptic on every tap or only on completion?" Not "thoughts?".
6. **No download CTA** in most of these. Mention the app name naturally; a pinned post or bio does the selling.

## Platform notes
- **X:** 280 chars; the dev community is active under #indiedev, #gamedev, #buildinpublic, #iOSDev (one or two, not all). Use a Postflare thread for the longer story: post 1 is the hook + visual, follow-ups carry the details. #ScreenshotSaturday on Saturdays is a long-running ritual for games. Links (devlog, TestFlight) in a reply, never the main post.
- **Bluesky:** 300 graphemes; a large and friendly gamedev and indie-app community. Threads of 2–4 posts work well. Alt text matters to this audience.
- **Mastodon:** 500 chars, use CamelCase hashtags (#IndieDev, #GameDev, #SwiftUI) for screen readers; content warnings for flashing visuals. Devs there value technical detail over marketing tone.
- **Threads:** 500 chars, one topic tag ("Indie Dev" or "Game Dev").
- **TikTok / Reels / Shorts:** 9:16. Hook on screen in the first 1–2 seconds ("This bug made my plants fly"). Face-to-camera with screen-recording cutaways works; 15–45 seconds. 3–5 hashtags.
- **LinkedIn:** 3,000 chars, fold after ~210 chars. Lessons learned and decision trade-offs fit here; first 2 lines must stand alone. Links in the first comment via a follow-up.
- **Instagram:** carousel "before / after / why" (up to 10 frames; Postflare supports 10+). Caption fold at ~125 chars. Alt text on every frame.
- **Reddit:** r/gamedev, r/iOSProgramming, r/indiegames, r/SideProject each have their own rules (some only allow self-promo in weekly threads; r/gamedev wants discussion, not showcases). Title-first, give the technical detail, disclose it's your app, and reply to comments.
- **TestFlight / beta:** a public TestFlight link is a good occasional follow-up ("want to try the WIP? 200 spots"). Apple caps external testers at 10,000 per app; state that it's a beta.

## Hooks
- **The dumb bug:** "Spent {time} fixing a bug caused by {tiny cause}." — relatable to every developer, and funny to non-developers.
- **Help me choose:** "Option A or B for {screen/feature}?" with two images — a cheap decision to weigh in on, and people follow to see the result.
- **Before / after:** "{Thing} {months} ago vs today." — progress is satisfying and shows commitment.
- **Why I didn't:** "Why {app name} will never have {common feature}." — a stated principle attracts the people who share it.

## Examples
### X (thread)
```
Spent two days on a bug where plants watered themselves at 3am.

Cause: the reminder used the phone's time zone, the watering log used UTC.

[image: bug report screenshot, before/after timeline]
```
(Post: 139 characters)
```
Follow-up 1: Fix: store everything in UTC, convert only when showing it. Obvious in hindsight, invisible in testing because I never left my time zone.
```
```
Follow-up 2: If you're building anything with reminders: test with your simulator set to a different time zone. Took me 30 seconds once I knew. #iOSDev
```

### Bluesky (two-option poll-style post)
```
Game over screen for Tiny Tower Defense: A shows your best wave, B shows how close the last enemy got to the gate.

A feels fair, B makes me want one more try. Which would make you hit retry?

[images: A, B]
```
(Post: 191 graphemes)

## Avoid
- "Working on something exciting, stay tuned" with nothing shown.
- Weekly recaps with eight bullet points; nobody engages with a changelog of your week.
- Fake vulnerability or manufactured drama ("I almost gave up…") for engagement.
- "Follow for more" or follow-for-follow requests.
- Hashtag walls (#indiedev #gamedev #buildinpublic #coding #developer #100daysofcode…).
- Screens that leak keys, user emails, revenue dashboards you didn't mean to share, or tester names.
- Showing Apple/Google beta OS features that are still under NDA.
- Turning every BTS post into a download pitch.

## Checklist
- [ ] One moment, with a concrete detail (the bug, the decision, the number).
- [ ] Line 1 carries the tension and works without the image.
- [ ] Visual attached and checked for secrets, personal data and NDA material.
- [ ] Alt text written for every image.
- [ ] Ends with a specific question or a takeaway others can use.
- [ ] No hard download CTA; any link (devlog, TestFlight) sits in a follow-up.
- [ ] At most 1–2 community hashtags on X, CamelCase on Mastodon.
- [ ] Subreddit rules read before any Reddit post, and the dev role disclosed.
