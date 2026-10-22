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

## Still open

| # | Source | What the spec says | State | Note |
| --- | --- | --- | --- | --- |
| M1 | PROTOCOL Days 1–2 “Log … feeling before/after” | A feeling, not only a number. | **partial** | The second score is the “after”. There is no word for the feeling before/after. A short optional field on the `after` step would close it — but that lives in `pause.ts` (another track). |
| M2 | PROTOCOL Days 5–6 “If you exceed the limit … log exactly how much and why” | How much and why. | **partial** | Over-limit opens are flagged and extended minutes counted. “Why” is not asked separately; the seeking answer stands in. A one-line “why past the cap” on over-limit session end would close it (touches `pause.ts`/session flow). |
| M3 | APP_SPEC “Time spent in trigger apps” | Per trigger. | **partial** | Insights trigger list shows average and open rate, not minutes. Cheap follow-up in `insights.ts` + `screens/insights.ts`. |
| M4 | PROTOCOL Day 4 “Before posting anything: same pause + score + ‘Why am I posting this?’” | Day 3–4 emphasis. | **done, but quiet** | The post pause exists every day, linked from Today’s link rows. There is no day-4 cue beyond the intention line. Probably fine. |
| M5 | PROTOCOL General rule “First 15 minutes after waking: no phone” | A rule. | **partial** | Shown as guidance on the morning screen and in the protocol screen. Not tracked. PRODUCT.md does not ask for tracking. |
| M6 | APP_SPEC §2 “Triggered on attempt to open marked apps” | Automatic interception. | **known limit** | Not possible from a PWA. PRODUCT “Known limits” + `#/bridge` explain Shortcuts / Modes and Routines. |
| M7 | APP_SPEC §2 “If Open: … soft close suggestion at the end” | A nudge when the 15 minutes end. | **partial** | The session screen switches to “The minutes are up” and asks the found question. A system notification at session end exists only while the app is open (PRODUCT “Known limits”). |
| M8 | PROTOCOL Day 7 “Where the protocol broke most often” | A pattern, not only a sentence. | **partial** | The report shows the person's sentence plus over-limit sessions and misses. A per-day breakdown of misses/over-limit (which day broke) would make it factual. |

## Doc inconsistencies

| # | Where | Issue |
| --- | --- | --- |
| D1 | PROTOCOL Days 3–4 “postpone ≥30 min” vs Settings | **Resolved.** Settings offer 15 minutes for postpone (`POSTPONE_MINUTES = [15, 30, 45, 60]`, default 30). The owner kept the 15-minute option. PRODUCT.md (“The pause” → “Postpone length”) now documents it as a deliberate relaxation: a lower barrier and still a real delay, while the protocol recommends 30+. |
| D2 | PRODUCT “Architecture” vs “Known limits” | **Resolved.** “Known limits” now says schema version 2 syncs only between tabs on one device (storage events), with no sync between devices. This matches “Architecture”. |
| D3 | APP_SPEC “Average awareness score today vs yesterday”, “Weekly summary on day 7” | Not mentioned in PRODUCT.md, which “wins”. This branch implements them as plain factual lines; PRODUCT.md could list the `#/report` route and the evening pause list. |
| D4 | PRODUCT “Journal and pause history” | Fine, but the evening pause list now overlaps it for one day; that is intended (APP_SPEC §4). |

## Intentional differences (not gaps)

- Awareness is ten buttons, not a slider (PRODUCT “The pause”).
- Days 3–4 are called “Boundary”, not “Restriction”.
- Seeking has ten options, not four plus custom.
- Calibration has no cap at all, per PRODUCT.
- After day 7 the practice modes replace “end of protocol”.
