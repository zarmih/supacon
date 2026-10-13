# Supacon — App Specification

A thin metacognition layer, not a blocker or digital detox app.

## Core Screens

### 1. Dashboard
- Current day of protocol (1–7).
- Micro-pauses completed today.
- Social media sessions used / remaining (3×15).
- Average awareness score today vs yesterday.
- Button: “Start focus block” (45 min timer + reminder to put phone away).
- Most common “What am I seeking?” when awareness was low.

### 2. Micro-Pause Overlay (critical)
Triggered on attempt to open marked apps or manually.
- Full screen, 10 seconds minimum.
- Top: awareness slider/buttons 1–10 + question “How present am I right now?”
- Then: “What am I seeking?” with quick options (boredom / validation / information / habit) + custom field.
- Buttons: “Open” / “Postpone 30 min”.
- If Open: start 15-min timer, soft close suggestion at the end.
- Optional second awareness score after choice.

### 3. Morning Check-in
- Awareness score.
- One line: first desire.

### 4. Evening Review
- List of all pauses with scores and answers.
- Daily average awareness.
- Question: “When was awareness lowest today?”
- Free note.
- Weekly summary on day 7.

### 5. Trigger Settings
- User marks which apps are trigger apps.
- Custom triggers possible.

## Data Collected (local)

- Awareness scores with timestamps.
- Trigger answers.
- Choice (open / postpone).
- Time spent in trigger apps.
- Correlation: low awareness → higher open rate.
- Patterns by time of day.

## MVP Approach

- PWA or simple native screen that the user opens before social apps (full system-level blocking is harder and creates resistance).
- Local storage only.
- No social features, no leaderboards, no gamification beyond the data itself.

## Key Insight the App Should Surface

When awareness is 1–4, the impulse almost always wins. When it is 7+, choice becomes easy. The practice is raising the baseline score through repeated interception.
