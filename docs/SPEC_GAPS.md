# Spec gaps

A comparison of [APP_SPEC.md](../APP_SPEC.md), [PROTOCOL.md](../PROTOCOL.md) and [PRODUCT.md](../PRODUCT.md) against the code on `feat/practice-mvp` (as of 2026-10-22). PRODUCT.md wins where the documents disagree, so an item that PRODUCT.md deliberately changed is listed under “Intentional differences”, not as a gap.

Status: **done** — implemented in this branch; **missing** — described, not built; **partial** — some of it exists; **doc** — the documents disagree with each other or with the code.

## Gaps closed in this branch

| # | Source | What the spec says | Before | Now |
| --- | --- | --- | --- | --- |
| G1 | PROTOCOL “Day 7: Diagnosis”, APP_SPEC §4 “Weekly summary on day 7” | Evening report: pauses that worked vs. missed, the strongest 2–3 triggers, average awareness and when it was highest/lowest, whether the feeling from likes changed, where the protocol broke. | **partial.** Today showed a pause count and calibration-vs-contrast after day 7; the evening form collected `likesChanged` and `whereItBroke`. No worked-vs-missed count, no top triggers, no highest/lowest time, no single report. | **done.** `src/domain/diagnosis.ts` (`diagnosisReport`, `partExtremes`) and the `#/report` screen (`src/ui/screens/report.ts`). Linked from Today on day 7 and after, from the day 7 evening review, and from the practice screen. Readable before day 7 with a “still forming” note. Also shows session minutes and over-limit sessions. |
| G2 | APP_SPEC §4 “List of all pauses with scores and answers” | The evening review lists every pause of the day. | **partial.** The evening screen showed totals only; the list lived in `#/journal`. | **done.** `eveningPauseList` on the evening screen: time, trigger, score (→ second score), seeking (+ custom name), choice, over-limit mark. |
| G3 | APP_SPEC §4 “When was awareness lowest today?” | A question the record can help answer. | **partial.** Free-text field only. | **done.** The pause list ends with “Lowest in the record: HH:MM · trigger · score” (`lowestPause`). The field stays free text. |
| G4 | APP_SPEC §1 “Average awareness score today vs yesterday” | Dashboard comparison. | **missing.** Today showed today's average only. | **done.** `todayVsYesterday` + a muted line on Today. |
| G5 | APP_SPEC §1 “Most common ‘What am I seeking?’ when awareness was low” | On the dashboard. | **partial.** Only across the whole record (Insights, sometimes the letter line on Today). | **done** for today: `seekingWhenLowOn` (needs the same name twice at score ≤ 4). |
| G6 | APP_SPEC “Time spent in trigger apps” | Collected locally and visible. | **partial.** `dayStats().sessionMinutes` was computed but never rendered (CSV only). | **partial → better.** Seven-day session minutes are on `#/report`. Per-trigger minutes on Insights are still open (see M3). |
| M1 | PROTOCOL Days 1–2 “Log … feeling before/after” | A feeling, not only a number. | **partial.** Only numeric awareness scores recorded before and after. | **done.** Added optional short feeling word for “before” (score step) and “after” (after step) in `src/ui/screens/pause.ts`. Preset chips (`calm`, `bored`, `anxious`, `tired`, `curious`, `lonely` in RU/EN) plus free text up to 40 characters (`clip()`). Toggle buttons with `aria-pressed`, 48px targets, responsive at 320px. Never required, never blocks choice. Stored as optional `feelingBefore` and `feelingAfter` on `PauseEvent` (schema v2, backward-compatible, kept across draft recovery in `supacon.v1.draft`, exported to JSON, CSV columns `feeling_before` / `feeling_after`, and Markdown diary). |
| M2 | PROTOCOL Days 5–6 “If you exceed the limit … log exactly how much and why” | How much and why. | **partial.** Over-limit opens flagged and extended minutes counted, but “why” was not recorded. | **done.** Added optional one-line “why past the cap” (`whyPastCap`) on over-limit session end in `src/ui/screens/journal.ts` (`sessionScreen`) and `src/ui/controller.ts`. Preset chips (`work`, `habit`, `tired`, `bored`, `curious`, `message` in RU/EN) plus free text up to 40 chars (`clip()`), toggle buttons with `aria-pressed`, 48px targets. Never required, never blocks ending session. Stored on `Session` and `PauseEvent` (schema v2 compatible, restored on draft recovery), exported in JSON, CSV column `why_past_cap`, Markdown diary, and displayed in journal and evening pause list. Unit tests in `tests/store.test.ts`, `tests/storage-migration.test.ts`, `tests/draft.test.ts`, `tests/csv.test.ts`, `tests/diary.test.ts`, and Playwright test in `e2e/why-past-cap.spec.ts`. |
| M3 | APP_SPEC “Time spent in trigger apps” | Per trigger. | **partial.** Insights trigger list showed average and open rate, not minutes. | **done.** `TriggerStat` in `src/domain/insights.ts` computes session minutes per trigger for the last 7 days (`minutes7d`) and all-time (`minutesAll`). Rendered on `#/insights` (`src/ui/screens/insights.ts`) in RU/EN with honest small sample note (`n<3 · small sample` / `n<3 · мало данных`) when trigger pause count is below 3. Unit test in `tests/insights.test.ts`. |
| M4 | PROTOCOL Day 4 “Before posting anything: same pause + score + ‘Why am I posting this?’” | Day 3–4 emphasis. | **done, but quiet.** Post pause existed, but Today showed no explicit cue on days 3–4. | **done.** Added quiet cue linking to the post pause on protocol days 3 and 4 in `src/ui/screens/today.ts` (`dict.home.day4PostCue`: "Перед публикацией — та же пауза" in RU, "Before posting — the same pause" in EN). 48px touch target with `data-cue="post-pause"`. Unit tests in `tests/protocol.test.ts`. |
| M8 | PROTOCOL Day 7 “Where the protocol broke most often” | A pattern, not only a sentence. | **partial.** Report showed free-text reflection and week totals, but no per-day breakdown. | **done.** Added `ReportDayBreakdown` (`days`) and `mostBrokenDay` to `diagnosisReport` in `src/domain/diagnosis.ts`. Factual day-by-day table (days 1–7) on `#/report` (`src/ui/screens/report.ts`) with pauses, misses, and over-limit sessions per day. Marks the day that broke most (`mostBrokenTag`: "most breaks" / "больше всего сбоев") with factual summary copy and no blame. Unit tests in `tests/diagnosis.test.ts`. |

## Still open

| # | Source | What the spec says | State | Note |
| --- | --- | --- | --- | --- |
| M5 | PROTOCOL General rule “First 15 minutes after waking: no phone” | A rule. | **partial** | Shown as guidance on the morning screen and in the protocol screen. Not tracked. PRODUCT.md does not ask for tracking. |
| M6 | APP_SPEC §2 “Triggered on attempt to open marked apps” | Automatic interception. | **known limit** | Not possible from a PWA. PRODUCT “Known limits” + `#/bridge` explain Shortcuts / Modes and Routines. |
| M7 | APP_SPEC §2 “If Open: … soft close suggestion at the end” | A nudge when the 15 minutes end. | **partial** | The session screen switches to “The minutes are up” and asks the found question. A system notification at session end exists only while the app is open (PRODUCT “Known limits”). |

## Doc inconsistencies

| # | Where | Issue |
| --- | --- | --- |
| D1 | PROTOCOL Days 3–4 “postpone ≥30 min” vs Settings | **Resolved.** Settings offer 15 minutes for postpone (`POSTPONE_MINUTES = [15, 30, 45, 60]`, default 30). The owner kept the 15-minute option. PRODUCT.md (“The pause” → “Postpone length”) now documents it as a deliberate relaxation: a lower barrier and still a real delay, while the protocol recommends 30+. |
| D2 | PRODUCT “Architecture” vs “Known limits” | **Resolved.** “Known limits” now says schema version 2 syncs only between tabs on one device (storage events), with no sync between devices. This matches “Architecture”. |
| D3 | APP_SPEC “Average awareness score today vs yesterday”, “Weekly summary on day 7” | **Resolved.** Documented in PRODUCT.md under “The seven days” (`#/report` route, day-by-day breakdown, and the evening pause list on `#/evening`). |
| D4 | PRODUCT “Journal and pause history” | Fine, but the evening pause list now overlaps it for one day; that is intended (APP_SPEC §4). |

## Intentional differences (not gaps)

- Awareness is ten buttons, not a slider (PRODUCT “The pause”).
- Days 3–4 are called “Boundary”, not “Restriction”.
- Seeking has ten options, not four plus custom.
- Calibration has no cap at all, per PRODUCT.
- After day 7 the practice modes replace “end of protocol”.
