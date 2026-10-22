# Supacon — product decisions

This is the app that now sits on top of the protocol. [PROTOCOL.md](PROTOCOL.md) stays the strict seven-day text. [APP_SPEC.md](APP_SPEC.md) stays the first screen sketch. Where they disagree with the running app, this file wins.

## What the product is

Supacon trains interception. A pull appears, a short pause happens, the person names how present they are and what they are seeking, then they choose. The app does not confiscate the instinct and does not congratulate a streak.

The unit of practice is one pause, not one day of abstinence.

## Architecture

A local-first PWA. Vite, TypeScript, no UI framework. The document in `localStorage` (`supacon.v1`, schema version 2) is the database. A version 1 file is read and kept. An unknown version is refused. Hash routes keep the pause, a running session, and Today addressable without a server. Storage events keep multiple open tabs synchronized.

A native wrapper can come later. It should call the same pause. It should not grow a second set of rules.

Service worker updates are automatic in production and disabled in `npm run dev`, so tests do not talk to a stale cache.

## The pause

This is the product. The state machine is:

1. **Arrive.** Only the first three browse pauses. One sentence, one button: “I’m here.”
2. **Score.** Ten buttons, not a slider. 1–3 autopilot, 4–6 partial, 7–8 clear, 9–10 spacious. Keys 1–9 and 0 for 10.
3. **Seeking.** Boredom, validation, information, habit, relief, connection, stimulation, status, loss, or something else with a short name. Posting uses a different question: seen, truth, habit, anxiety, or unsure.
4. **Choose.** Open, Postpone, or Close for a browse. Post, keep the draft, or don’t post for a publication. The three choices have the same visual weight. They stay disabled until the breath has elapsed and both answers exist. The breath is `Date.now() - startedAt`, default 10 seconds, settable to 5, 10, or 15.
5. **Second score.** Optional. Skipping it still saves the pause.

Postpone is a timestamp. Coming back opens the pause again. It does not silently resume the app.

**Keyboard controls in the pause.** The pause ritual is fully operable from the keyboard without mouse or touch:
- `1`–`9` and `0` (for 10) select awareness score on both the first and second score steps.
- `ArrowLeft` / `ArrowUp` / `ArrowRight` / `ArrowDown` cycle through seeking impulses with gentle tactile tick feedback.
- `Enter` confirms the active seeking impulse (or submits the custom note).
- Single-letter hotkeys trigger choices once the breath timer has elapsed:
  - Browse pauses: `O` for Open, `P` for Postpone, `C` for Close.
  - Publication pauses: `P` for Post, `D` for Draft, `X` for Don't post.
- `Escape` steps back to the previous pause step or returns to Today.

## The seven days

Day 1 is the calendar date onboarding finished. A skipped date still advances the day. Absence is data. A clock set backwards does not rewind the protocol.

| Days | Phase | What changes |
| --- | --- | --- |
| 1–2 | Calibration | No session cap. The baseline has to include the unfiltered opens. |
| 3–4 | Boundary | The cap turns on. Default 3 × 15 minutes. |
| 5–6 | Contrast | The same cap, plus one question: did a real conversation happen? A focus block is suggested at the loudest hour once that hour is known. |
| 7 | Diagnosis | Evening review asks where the protocol broke. |
| 8+ | Practice | The person picks a mode. Until they do, Today keeps asking. |

Opening past the cap starts a session marked over the limit. It consumes no extra slot and it is not blocked. Extending a session (`session-extend`) adds the configured minutes from settings (e.g. `+15 мин`), shows a clarifying toast notification (`Продлено на 15 мин. Записано честно.`), and displays a calm status line noting that no extra slot is consumed (`Продлено: +15 мин. Дополнительный слот не расходуется.`).

“Found what you sought?” ends the session in one tap: yes, partly, or no.

A miss can be logged after the fact, with an optional recalled score and seeking. The evening review also takes a count of unlogged misses.

**Contrast phase (days 5–6).**
- **Contrast focus block cue.** When at least four browse pauses cluster in a person's peak hour, Today suggests placing the 45-minute focus block during that hour. If the current hour is that loud hour, Today highlights a calm callout (`note flash` with direct navigation to `#/focus`: «Сейчас твой самый громкий час ({HH}:00). Хороший момент для 45-минутного фокуса (телефон в другой комнате).»). Outside that hour, it shows a quiet reminder («В фазе контраста фокус-блок рекомендуется в твой самый громкий час ({HH}:00).»).
- **Real contact card.** Prompts whether at least one real conversation happened today (Yes / Not today). Once answered, invites an optional reflection note (up to 180 characters) comparing the feeling of real human contact to online likes in depth and duration. The status and note flow into the evening review, and the answer can be adjusted at any time without penalty.

**Today checklist.** The shape of the day tracks morning check-in, focus block, real contact (in contrast phase), evening review, and day 7 diagnosis. Each check item links directly to its screen (`#/morning`, `#/evening`, `#/focus`). When completed, the morning item displays a compact summary (`Score {score} · {firstDesire}` / `Балл {score} · {firstDesire}` neatly trimmed to at most 40 characters), and evening review displays a peaceful completed status (`Обзор дня записан` / `Day review recorded`).

## After day 7

- **Maintenance.** Keep the pause and the cap. Look at the record.
- **Deepening.** Keep the cap. One experiment per week, in a fixed cycle: name it aloud, score the body, one urge, a real voice, a second look. No streak.
- **Open practice.** The pause and the record stay. The cap is off until a number is set again.

“Start the seven days over” keeps history and makes today day 1 again.

## Insights and hints

No model and no invented pattern. A sentence appears only when the counts clear a bar.

- **Threshold.** For each cut from 2 to 9, compare the open rate below the cut with the open rate at or above it. Each side needs at least four pauses, and the gap needs at least 15 points. The widest gap wins. A tie keeps the higher cut.
- **Seeking when low.** The most common name among scores of 4 or below, once that name appears at least twice.
- **Naming.** Whether a second score moved, once at least three second scores exist and the average move is at least 0.2.
- **Baseline.** Mean awareness on days 1–2 against days 5–7, once each side has at least three pauses.
- **Loud hour.** The clock hour with the most browse pauses, once that hour has at least four.
- **Posts.** How many posting pauses happened, and how many stepped back. The letter mentions posts once there are at least two.
- **High but opens.** At least six browse pauses, average awareness at least 7.5, and at least three quarters of them still opened.

The letter is at most four of those sentences. A week-against-week card is not one of them.

**Week against week.** Two adjacent spans of seven local days, ending today. Each span needs at least four browse pauses. The card shows the median awareness and the share of opens. A strong day is not the result. One week of record, including the example week, stays silent.

A hint on the choose step is one sentence and never names a button. For a browse pause the order is: already past the cap; inside the night range; outside a saved window; the high-but-opens pattern while this score is 7 or more; a spacious score of 8 or more; a low-score open pattern while this score is 4 or below (five or more scores of 4 or below, at least 70% opened); a trained loop while this score is 6 or below (at least four session answers, half or more “no” or “partly”); the last three postpones of this seeking with no session inside 90 minutes; then the loud hour (four or more browse pauses in that clock hour). Every pattern hint after outside waits for at least six browse pauses; below that only the cap, night, and outside speak. The postpone hint counts a postpone only after its 90-minute return window has closed. Night and outside do not wait for six browse pauses. A post pause is not given these hints. Nothing left to say returns nothing.

## Triggers

Presets plus any custom label. “Something else” is added at the end of onboarding and cannot be the casualty of “disable the last one.” Preset names are translated. Custom names are stored as written. One enabled trigger skips the picker.

## Copy and chrome

English and Russian. Russian uses “ты” and stays gender-neutral where a past tense would have to pick. Ink is the default theme. Paper is the light one. System follows the device. Type is Literata and Manrope, both with Cyrillic.

There is no points balance, no streak, and no shame sentence for an open or a miss.

## What the research changed

An October 2026 review of reward, status, and digital design sits behind the practice. It is not a gender model and it is not a dopamine detox. The conclusions that changed the app:

- Wanting and liking are different. A person can open with almost no pleasure, because the next check might be the one. The session question “Did it give you what you were seeking?” is that measurement. When at least four answers exist and half or more are “no” or “partly”, the record says so.
- The feed has no ending. An open can name what “enough” looks like. An open without that line is unfinished. The sentence appears once at least four opens exist and half or more are bare.
- The strongest moves happen before the impulse: a window, a night hour, a replacement for the function. They are set on the plan screen while the person is calm. The pause mentions them. It never locks the door.
- A pause is classified by the function the person named — approval, belonging, status, novelty, relief, not losing a streak — and only when one function leads. Habit and “something else” stay unclassified. Sex is not an input.
- If the dominant trigger changes across the record, the insight says the pull moved. Targeting one app can miss the cycle.
- Weeks are compared with weeks. A good day is not the result.
- Screen time is not a diagnosis. The plan says, once, that broken sleep, work, relationships, or mood is a reason to talk with a trained person.

## Export, backup, and sensory settings

The record belongs to the person. All data stays local on the device.

- **Export JSON.** Full database dump (`supacon-YYYY-MM-DD.json`) for complete backup, transfer, and restoration. Importing validates version and schema integrity, automatically creates a fallback snapshot of the current database before replacing it, and offers one-tap restoration from backup if needed. If the main record ever becomes unreadable, the app restores that snapshot on the next launch instead of starting empty; the unreadable text is kept aside, never written over the snapshot.
- **Export Diary (Markdown).** Generates a human-readable Markdown diary (`supacon-diary-YYYY-MM-DD.md`) documenting morning desires and scores, pause totals and averages, focus blocks, evening reflections, and logged misses for personal note-taking systems (Obsidian, Logseq, Bear), with one-tap copy to clipboard.
- **Export CSV.** Tabular data export (`supacon-export-YYYY-MM-DD.csv`) containing all timestamped pause events, awareness before and after, triggers, impulse sought, choices made, and session durations for personal spreadsheet analysis.
- **Sensory feedback.**
  - **Haptic feedback.** Gentle tactile vibration on breath timer completion, choice selection, and impulse cycling on supported devices, with an instant tactile tick when toggled on. Can be toggled on/off in Settings.
  - **Focus completion bell.** A soothing 432 Hz gong chime sounds when a 45-minute focus block finishes, with a calm preview chime when toggled on. Can be toggled on/off in Settings.

## Journal and pause history

The pause record is accessible at `#/journal` and `#/history`. Pauses are grouped by date (Today, Yesterday, and past calendar dates) and can be filtered by trigger using interactive chips. Each entry displays the time, trigger, awareness scores (initial and delta), impulse sought, and choice taken. If no pauses exist yet or all are filtered out, a supportive empty card explains the state calmly without guilt.

## Known limits

- The page cannot intercept another app. See the README. `#/pause/{trigger}` or `#/pause?trigger=` opens the pause for that trigger when it is enabled. A missing or disabled trigger is not replaced by another. Standing in front of another app is a Shortcut, Mode, or Routine the person sets on the phone. The page explains that and does not claim to do it.
- Notifications are best-effort and only while Supacon is open. A saved window can ping during its own minute. A window already past is not announced later. The night hour is mentioned, not pinged.
- Insights are descriptive. They will be wrong on a tiny or a lopsided sample, which is why the thresholds exist.
- Schema version 1 has no sync. A second device means an exported file.
