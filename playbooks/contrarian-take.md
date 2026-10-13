---
id: contrarian-take
version: 1
name: Contrarian take
summary: A defensible opinion that goes against common advice in your niche, backed by evidence, written to start a real discussion rather than a fight.
goal: engagement
platforms: [microblog, professional, reddit, facebook]
formats: [text, thread, image]
tags: [opinion, contrarian, thought-leadership, discussion, mobile-app, game, saas]
inputs: [the common belief, your opposing view, the evidence from your own data or experience, the conditions where the common belief is still right, product context]
---

## When to use
Use when you have real evidence (your numbers, an experiment, years of experience) that a popular piece of advice in your niche is wrong or wrong for a specific situation. The goal is engagement: replies from people who agree, disagree with arguments, or add nuance. Do not use it for outrage, for punching at people, or for an opinion you would not defend in the replies. If you cannot name when the common advice is still right, the take is not ready.

## Structure
1. **Line 1, the take (≤ 70 characters, no emoji):** state the opposing view plainly. "Free trials hurt our app's revenue." Not a question, not a hedge.
2. **Line 2, the common belief:** what most people say, stated fairly. "Everyone says a 7-day trial is the default for subscription apps."
3. **Lines 3–5, the evidence:** your data or experience, specific. Numbers, timeframe, what you tested.
4. **The mechanism (1–2 lines):** why it happens. This is what makes it defensible rather than anecdotal.
5. **The boundary (1 line):** when the common advice still holds. "If your value shows up in week 2, keep the trial." This line turns arguments into discussion.
6. **Close (optional):** a genuine question about others' experience.
7. On X/Bluesky, move evidence and mechanism into `thread` replies if they do not fit.

## Platform notes
- **X:** 280 chars (Premium 25,000). The take plus one line of evidence in post 1; the rest in a thread. Any link (a writeup) goes in the last reply, never the main post (reach and X API cost).
- **Bluesky:** 300 graphemes. The audience rewards nuance; the boundary line matters even more here.
- **Threads:** 500 chars, enough for take, belief, evidence and boundary in one post. One topic tag.
- **Mastodon:** 500 chars default, CamelCase hashtags. Hot takes framed as dunks go over badly; a calm, evidence-first tone works.
- **LinkedIn:** 3,000 chars, fold after ~210 chars / 3 lines: take and common belief must sit above "…see more". Link to a full writeup in the first comment.
- **Reddit:** title-first and as a discussion, e.g. "We removed the free trial from our app and revenue went up, here's the data". Check subreddit rules; no product link unless allowed; answer every substantive reply.
- **Facebook:** works in groups for founders/devs if the group allows; links in the comments.

## Hooks
- **Plain reversal:** "{Common advice} {hurt or didn't help} {my product}." — direct, specific, testable.
- **Stop doing:** "Stop {common practice} if {specific condition}." — the condition keeps it defensible.
- **Overrated/underrated:** "{Popular thing} is overrated for {audience}. {Neglected thing} isn't." — swaps one belief for another, giving people something to do.
- **Data against the grain:** "We tested {common advice} for {time}. {Surprising result}." — the test is the credibility.

## Examples
### X (main post + replies)
```
Removing the free trial increased our app's revenue.

Everyone says a 7-day trial is the default for subscription apps. For Tempo it was the wrong default.

Data and the one case where you should keep the trial:
```
(211 chars)

Reply 1:
```
Before: 7-day trial, 41% of trial users never finished one focus session. They churned without seeing the app work.

After: free forever for 3 sessions a day, paywall for more. Paid conversion went from 3.1% to 5.4% over 8 weeks.
```

Reply 2:
```
Why: a trial puts a clock on people who haven't hit the value moment yet. A usage limit lets them hit it first.

When to keep the trial: if your value only shows up after a week of use, the clock helps. Ours shows up in 25 minutes.
```

### LinkedIn
```
Most indie game devs should stop running Discord servers at launch.

The standard advice: build a community before you ship.

For Tiny Tower Defense, the server had 400 members and 6 active ones. Answering them took time I needed for the game, and an empty server made the game look dead.

What worked instead: a mailing list. 1,100 subscribers, a 38% open rate, and launch-day sales we could trace to it.

The reason: a server needs daily activity to feel alive. A list only needs one good email a month.

Where I'd still open a server: multiplayer games, or once players start asking for one.

Where has a community server paid off for you?
```

## Avoid
- Rage bait: attacking people or groups instead of an idea.
- Takes with no evidence, or evidence you made up.
- Strawmanning the common belief; state it fairly.
- Absolutist framing with no boundary ("trials are always bad").
- Hedging the first line into nothing ("maybe trials aren't always ideal?").
- Quote-dunking a specific person to borrow their reach.
- Engagement bait ("agree or disagree? comment below") with no real question.
- Links in the main post on X or LinkedIn.
- Posting a take you will not stick around to discuss.

## Checklist
- [ ] The first line states the take plainly in ≤ 70 characters.
- [ ] The common belief is described fairly.
- [ ] Evidence is specific (numbers, timeframe) and confirmed by the user.
- [ ] The mechanism explains why, not only what.
- [ ] A boundary line says when the common advice still holds.
- [ ] No person or group is attacked.
- [ ] Each platform version fits its limit and fold; overflow goes into `thread` follow-ups.
- [ ] Any link sits in the last reply or first comment.
