---
id: poll-question
version: 1
name: Poll or genuine question
summary: A specific, easy-to-answer question you answer first yourself, so replies come from real opinions and not from bait.
goal: engagement
platforms: [microblog, linkedin, linkedin_page, instagram, instagram_standalone, facebook, reddit]
formats: [text, image]
tags: [mobile-app, game, community, question, poll, research]
inputs: [the decision or topic you want opinions on, 2-4 concrete answer options, your own answer and the reason, what you will do with the answers]
---

## When to use
- You are actually deciding something (next feature, default setting, pricing tier name, level difficulty) and real opinions would change the outcome.
- You want to learn how your audience works (when they use the app, what they tried before) in a format that costs them five seconds.
- The account has been quiet and you want a low-stakes post that invites replies without selling anything.

Do not use it when you have already decided, or when the only reason is "the algorithm likes comments". People can tell, and the answers you get will be worthless.

## Structure
1. **Line 1 — the question, ≤ 90 characters.** One question, not two. Concrete nouns ("dark mode or sepia?"), not abstractions ("what do you value in an app?").
2. **Options.** 2–4 labelled choices (A/B/C or numbered) so answering is one character. Include an "other — tell me" escape hatch only if it is a real possibility.
3. **Your answer first.** One or two lines: what you would pick and why. This lowers the cost of replying, models the reply format and shows you are not fishing.
4. **Why you are asking.** One line of context: "We ship one of these in November." Stakes make the answer feel worth giving.
5. **Close the loop.** Afterwards, post the result and what you did with it (a follow-up reply or a new post). That is what makes the next poll work.

### Native polls vs text polls
Postflare does not create native polls on every platform. Native polls exist on X, LinkedIn, Facebook, Mastodon, Threads, Reddit and Instagram Stories, but when Postflare cannot attach one, write a **text poll**: numbered options in the body and "reply with the number". If the user wants a native poll on a platform Postflare does not support for it, schedule the post as a draft and tell them to add the poll by hand in the native app. Text polls have one advantage: replies carry reasons, not just a tap.

## Platform notes
- **X:** 280 characters (Premium 25,000). Keep question + options + your answer under 280 so it is one post. Put "why we're asking" or the result recap in a follow-up (thread reply).
- **Bluesky:** 300 graphemes, no native polls; text poll with numbered options works well.
- **Threads:** 500 characters, one topic tag that matches the community (e.g. "IndieDev").
- **Mastodon:** 500 characters by default, native polls exist in the app; for text polls ask people to reply. CamelCase hashtags (#IndieDev) for screen readers.
- **LinkedIn:** 3,000 characters, fold after ~210 characters, so the question must be in line 1. Frame it as a professional decision, not trivia.
- **Instagram:** caption fold at ~125 characters; put the question before the fold. An image with the options written large tends to work better than a caption-only question. Stories have a native poll sticker, but that is posted by hand.
- **Facebook:** long text is fine; native polls live in groups. Text polls work on Pages.
- **Reddit:** title is the question. Read the subreddit rules; many ban polls or self-promotion. Do not link your app in the body unless the rules allow it.

## Hooks
- **Forced choice:** "{option A} or {option B} for {specific situation}?" — two concrete options are faster to answer than an open question.
- **Behaviour question:** "When do you actually {use case}? 1) {time} 2) {time} 3) {time}" — people enjoy describing their own habits.
- **Decision we're stuck on:** "We can only ship one of these in {month}. Which one?" — real stakes plus a deadline makes the answer feel useful.
- **Before you {action}, do you {habit}?** — "Before you water a plant, do you check the soil?" Easy yes/no with a story behind it.

## Examples
### X (text poll, 254 characters)
```
Tempo users: which should we build first?

1) Focus sessions that sync with your calendar
2) A "do not disturb" that blocks chat apps
3) Weekly focus report by email

I'd pick 2, my focus dies on Slack pings. Reply with a number, we ship one in November.
```

### LinkedIn (text poll)
```
We can build exactly one feature for Pocket Plants this quarter. Which one would you use?

A) Photo-based diagnosis of yellow leaves
B) Watering reminders that adjust to the weather
C) A shared plant list for households

My vote is B. Half our support emails are "I watered it on schedule and it still died", and the schedule ignores a week of rain.

Reply with A, B or C. I'll post the result and what we decided next Friday.
```

### Bluesky (text poll, 189 graphemes)
```
Tiny Tower Defense question for people who play on the train:

1) 3-minute levels
2) 10-minute levels
3) Pause anywhere, length doesn't matter

I play 3 myself. Which one fits your commute?
```

## Avoid
- Engagement bait: "Comment YES if…", "Like for A, retweet for B", "Type 1 if you agree". Platforms demote it and it attracts bots, not users.
- Questions you already know the answer to, or rhetorical ones ("Who else hates bad apps?").
- Vague open questions ("Thoughts?", "What do you think about productivity?"). Effort kills replies.
- Too many options (more than 4) or two questions in one post.
- Asking and then never reporting the result.
- Hashtag stuffing to "boost" the poll; one or two relevant tags at most.

## Checklist
- [ ] The question is in the first line and before the platform's fold.
- [ ] One question, 2–4 concrete options, answerable with one character or word.
- [ ] Your own answer and reason are in the post.
- [ ] There is a real reason to ask, and it is stated.
- [ ] No "comment YES/like if" phrasing anywhere.
- [ ] Text fits the platform limit (X 280, Bluesky 300, Threads/Mastodon 500).
- [ ] If a native poll is needed where Postflare cannot create one, the user knows to add it by hand.
- [ ] A follow-up to share the result is planned or scheduled.
