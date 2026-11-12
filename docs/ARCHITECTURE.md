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
                    │                                         │ (returns PersistResult: {ok: true} | {ok: false})
                    └──► render(view) ◄── domain/* (protocol, insights, hints…) derive what to show
```

1. `main.ts` passes a `KeyValue` backed by `localStorage` to `startApp`.
2. On start `loadOrRecover(kv)` reads `supacon.v1`. If corrupted but a valid `.bak` exists, it
   restores from backup automatically; otherwise it normalizes or falls back to `emptyDatabase()`.
3. A DOM event (click, submit, key, timer tick) is handled in the controller. It calls a pure
   function from `store/mutate.ts`, replaces `app.db`, persists it via `persist()`, and re-renders.
4. `persist()` returns an explicit `PersistResult` (`{ ok: true } | { ok: false; error: unknown }`).
   On write failure (quota exceeded, private browsing restrictions), `app.storageError` is set:
   - Form fields and in-memory mutations are retained (no false success toast).
   - An accessible persistent alert banner (`.storage-banner`) renders at the top with "Retry saving"
     and "Export JSON" actions.
   - A `beforeunload` guard warns before discarding unsaved state.
   - Retrying persistence saves the current in-memory database cleanly without duplicating records.
5. Screens derive everything they show (day number, phase, checklist, insights, hints, letter)
   from `db` plus `now` through `domain/` functions. Nothing derived is stored.
6. Another tab writing `supacon.v1` triggers a `storage` event; the controller reloads via `loadDb`.

## Time

- A calendar date is a local `YYYY-MM-DD` string (`localDate`). Day arithmetic (`addDays`,
  `diffDays`, `dayNumber`) works on those strings in UTC, so a 23- or 25-hour DST day still counts
  as one protocol day.
- Hour-of-day statistics (`loudestHour`, `peakHour`, CSV `time`) use the local hour of the stored
  ISO instant.
- Tests pin zones explicitly with `tests/helpers/tz.ts` (`withTZ('America/Los_Angeles', …)`), and
  `vitest.config.ts` pins a default zone (`Europe/Moscow`, override with `TEST_TZ`).

## Storage and schema

- Key `supacon.v1` holds the database; `supacon.v1.bak` holds a backup; `supacon.v1.corrupt` stores
  unreadable raw data set aside for recovery.
- `supacon.v1.draft` (`store/draft.ts`) holds the one unfinished pause: `{ draft, savedAt }`. It is
  not part of the database, so it is never merged, exported or imported. `normalizeDraft`
  (`domain/pause.ts`) rebuilds it defensively; `clearDraft(kv, id)` only removes the named draft.
  Earlier versions kept it per tab in `sessionStorage` (`supacon.pause`); it is moved over once.
- `normalizeDatabase` accepts schema versions 1 and 2, drops malformed records, clamps settings to
  their allow-lists, and always returns `version: 2`. Migration is therefore implicit: a v1 file
  becomes v2 on the next save.
- `saveBackup` runs before an import replaces the record; `restoreBackup` puts it back.
- `loadDb` sets an unreadable primary record aside into `supacon.v1.corrupt` (`CORRUPT_KEY`) without
  touching `.bak`.
- `loadOrRecover` runs at app startup: if the primary is missing or unreadable but a valid backup
  exists in `supacon.v1.bak`, it recovers from the backup automatically.

## Exports

- JSON: `JSON.stringify(db)`, re-importable; normalisation is idempotent (property-tested).
- CSV: one row per pause, RFC 4180 quoting for `,`, `"`, CR and LF. Text cells that start with
  `=`, `+`, `-`, `@`, tab or CR get a leading `'` so spreadsheets do not run them as formulas.
  The download starts with a UTF-8 BOM (`csvFile`) so Excel shows Cyrillic and emoji.
- Markdown diary: one section per date from the first record to the last, then summary insights.
  Free text goes through `mdText`: line breaks fold into ` / ` and inline markup is backslash-escaped,
  so a note cannot add headings, rules, list items or tables.
