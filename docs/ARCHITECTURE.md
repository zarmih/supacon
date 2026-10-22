# Architecture

Supacon is a local-only PWA. There is no server and no account: the whole record is one JSON
document in `localStorage`. The code is plain TypeScript built by Vite, with no UI framework.

## Module layout

```
src/
  main.ts            entry point: wires localStorage into a KeyValue and starts the controller
  domain/            pure logic, no DOM, no storage, no globals (except Date / crypto.randomUUID)
    types.ts         Database schema (SCHEMA_VERSION = 2) and value lists (seekings, motives, cycles)
    time.ts          calendar dates as `YYYY-MM-DD` in the local zone; day diffs computed in UTC
    clock.ts         wall-clock helpers: localDateTime, session/focus end times, pending postpones
    protocol.ts      day number, phase (calibration → boundary → contrast → diagnosis → practice),
                     session cap, checklist, weekly experiments, day-7 completion
    pause.ts         the pause ritual as a small state machine (arrive → score → seeking → choose → after)
    insights.ts      aggregate statistics: threshold, open rates, peak hour, baseline, week vs week…
    cycles.ts        impulse → cycle mapping, dominant cycle, trained loop, windows / night ranges
    hints.ts         at most one hint sentence for the pause screen
    letter.ts        at most four sentences for the "letter", each backed by an insight
    csv.ts           CSV export (RFC 4180 quoting, CRLF rows)
    diary.ts         Markdown diary export (en / ru)
    example.ts       the demo week
    ids.ts           crypto.randomUUID wrapper
  store/
    defaults.ts      default settings and the empty database
    mutate.ts        every state change as a pure function `(db, input) → new db` (structuredClone)
    storage.ts       KeyValue abstraction, load / save, schema normalisation and migration, backups, import inspection
  i18n/              en / ru dictionaries; `resolveLang` picks one from the setting and device language
  platform/          thin wrappers over browser APIs: audio, haptics, notifications, offline status
  ui/
    controller.ts    the only stateful module: holds the App object, handles DOM events, timers, persistence
    model.ts         ViewModel passed to screens
    render.ts        top-level render: picks a screen by route and wraps it in chrome
    screens/*.ts     pure `(view) → html string` functions
    route.ts         hash routes (`#/today`, `#/pause/{trigger}`, …)
    keyboard.ts, timers.ts, export.ts, html.ts   helpers split out of the controller
```

The rule of thumb: **`domain/` and `store/` never touch the DOM**, and everything there is
testable with plain inputs. UI screens are string templates and are also testable without a browser.

## Data flow

```
user event ──► controller.ts ──► store/mutate.ts (pure) ──► new Database
                    │                                         │
                    │                                persist: storage.saveDb(kv, db)
                    │                                         │
                    └──► render(view) ◄── domain/* (protocol, insights, hints…) derive what to show
```

1. `main.ts` passes a `KeyValue` backed by `localStorage` to `startApp`.
2. On start `loadDb(kv)` reads `supacon.v1`, runs `normalizeDatabase` (validation + migration) and
   falls back to `emptyDatabase()`.
3. A DOM event (click, submit, key, timer tick) is handled in the controller. It calls a pure
   function from `store/mutate.ts`, replaces `app.db`, persists it, and re-renders.
4. Screens derive everything they show (day number, phase, checklist, insights, hints, letter)
   from `db` plus `now` through `domain/` functions. Nothing derived is stored.
5. Another tab writing `supacon.v1` triggers a `storage` event; the controller reloads via `loadDb`.

## Time

- A calendar date is a local `YYYY-MM-DD` string (`localDate`). Day arithmetic (`addDays`,
  `diffDays`, `dayNumber`) works on those strings in UTC, so a 23- or 25-hour DST day still counts
  as one protocol day.
- Hour-of-day statistics (`loudestHour`, `peakHour`, CSV `time`) use the local hour of the stored
  ISO instant.
- Tests pin zones explicitly with `tests/helpers/tz.ts` (`withTZ('America/Los_Angeles', …)`), and
  `vitest.config.ts` pins a default zone (`Europe/Moscow`, override with `TEST_TZ`).

## Storage and schema

- Key `supacon.v1` holds the database; `supacon.v1.bak` holds a backup.
- `normalizeDatabase` accepts schema versions 1 and 2, drops malformed records, clamps settings to
  their allow-lists, and always returns `version: 2`. Migration is therefore implicit: a v1 file
  becomes v2 on the next save.
- `saveBackup` runs before an import replaces the record; `restoreBackup` puts it back.
- `loadDb` copies an unreadable primary into `.bak` and returns `null` (the app starts empty).
  See the known issue in `tests/storage-migration.test.ts` about this overwriting a valid backup.

## Exports

- JSON: `JSON.stringify(db)`, re-importable; normalisation is idempotent (property-tested).
- CSV: one row per pause, RFC 4180 quoting for `,`, `"`, CR and LF.
- Markdown diary: one section per date from the first record to the last, then summary insights.
