import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  STORAGE_KEY,
  hasValidBackup,
  inspectImport,
  loadDb,
  memoryStore,
  normalizeDatabase,
  restoreBackup,
  saveBackup,
  saveDb,
} from '../src/store/storage'
import { defaultSettings, emptyDatabase } from '../src/store/defaults'
import { exampleDatabase } from '../src/domain/example'
import { SCHEMA_VERSION, type Database } from '../src/domain/types'

/** A database as v0.1 (schema v1) wrote it: no windows, night, replacements, haptics, sound or finish lines. */
function v1Fixture() {
  return {
    version: 1,
    settings: {
      lang: 'ru',
      theme: 'paper',
      maxSessionsPerDay: 2,
      sessionMinutes: 20,
      postponeMinutes: 15,
      focusMinutes: 25,
      pauseSeconds: 5,
      notifications: true,
      eveningReminder: '21:30',
    },
    triggers: [
      { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-09-01T08:00:00.000Z' },
      { id: 'c1', label: 'Телеграм-каналы', preset: false, enabled: false },
    ],
    startedOn: '2026-09-01',
    onboardingComplete: true,
    practiceMode: null,
    events: [
      {
        id: 'e1',
        at: '2026-09-01T19:10:00.000Z',
        date: '2026-09-01',
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 3,
        seeking: 'validation',
        seekingNote: '',
        choice: 'open',
        awarenessAfter: 4,
        overLimit: false,
        elapsedSeconds: 14,
        dayNumber: 1,
        phase: 'calibration',
      },
      {
        id: 'e2',
        at: '2026-09-02T19:10:00.000Z',
        date: '2026-09-02',
        intent: 'browse',
        triggerId: 'c1',
        awarenessBefore: 6,
        seeking: 'boredom',
        seekingNote: 'после работы',
        choice: 'postpone',
        overLimit: false,
        postponeMinutes: 15,
        elapsedSeconds: 11,
        dayNumber: 2,
        phase: 'calibration',
      },
    ],
    sessions: [
      {
        id: 's1',
        pauseId: 'e1',
        triggerId: 'instagram',
        startedAt: '2026-09-01T19:10:00.000Z',
        date: '2026-09-01',
        plannedMinutes: 20,
        extendedMinutes: 0,
        endedAt: '2026-09-01T19:31:00.000Z',
        endReason: 'timer',
        awarenessAtStart: 3,
        seeking: 'validation',
        overLimit: false,
        found: 'no',
      },
    ],
    mornings: [{ date: '2026-09-02', at: '2026-09-02T05:00:00.000Z', awareness: 5, firstDesire: 'проверить ленту' }],
    evenings: [{ date: '2026-09-01', at: '2026-09-01T19:00:00.000Z', lowestMoment: 'вечер', note: '', unloggedMisses: 1 }],
    focuses: [{ id: 'f1', startedAt: '2026-09-02T07:00:00.000Z', plannedMinutes: 25, completed: true, endedAt: '2026-09-02T07:25:00.000Z' }],
    postpones: [{ id: 'pp', pauseId: 'e2', triggerId: 'c1', at: '2026-09-02T19:10:00.000Z', until: '2026-09-02T19:25:00.000Z' }],
    misses: [],
    dayMarks: [],
    experiments: [],
    demo: false,
  }
}

describe('schema migration v1 → v2', () => {
  it('upgrades a full v1 file, keeps every record, and fills new settings with defaults', () => {
    const db = normalizeDatabase(v1Fixture())!
    expect(db.version).toBe(SCHEMA_VERSION)
    expect(db.version).toBe(2)
    expect(db.settings).toMatchObject({
      lang: 'ru',
      theme: 'paper',
      maxSessionsPerDay: 2,
      sessionMinutes: 20,
      postponeMinutes: 15,
      focusMinutes: 25,
      pauseSeconds: 5,
      notifications: true,
      eveningReminder: '21:30',
      haptics: true,
      sound: true,
      windows: [],
      windowMinutes: 45,
      nightStart: null,
      nightEnd: null,
      replacements: defaultSettings().replacements,
    })
    expect(db.events.map((e) => e.id)).toEqual(['e1', 'e2'])
    expect(db.events[0]).not.toHaveProperty('finish')
    expect(db.events[1]).toMatchObject({ seekingNote: 'после работы', postponeMinutes: 15 })
    expect(db.sessions[0]).toMatchObject({ endReason: 'timer', found: 'no' })
    expect(db.triggers[1]).toMatchObject({ id: 'c1', enabled: false, createdAt: new Date(0).toISOString() })
    expect(db.focuses[0]!.date).toBe('2026-09-02')
    expect(db.postpones).toHaveLength(1)
    expect(db.mornings).toHaveLength(1)
    expect(db.evenings[0]!.unloggedMisses).toBe(1)
  })

  it('writes v2 on the next save and reads it back identically', () => {
    const kv = memoryStore()
    kv.set(STORAGE_KEY, JSON.stringify(v1Fixture()))
    const first = loadDb(kv)!
    saveDb(kv, first)
    expect(JSON.parse(kv.get(STORAGE_KEY)!).version).toBe(2)
    expect(loadDb(kv)).toEqual(first)
    expect(kv.get(BACKUP_KEY)).toBeNull()
  })

  it('reports a v1 import as ok with its pause count and date range, as v2', () => {
    expect(inspectImport(JSON.stringify(v1Fixture()))).toEqual({
      ok: true,
      pauseCount: 2,
      dateRange: '2026-09-01 — 2026-09-02',
      version: 2,
    })
    const single = { ...v1Fixture(), events: [], mornings: [], evenings: [], focuses: [], startedOn: '2026-09-05' }
    expect(inspectImport(JSON.stringify(single)).dateRange).toBe('2026-09-05')
    const empty = { version: 2, settings: {} }
    expect(inspectImport(JSON.stringify(empty))).toEqual({ ok: true, pauseCount: 0, version: 2 })
  })

  it('refuses non-objects and unknown versions', () => {
    for (const raw of [null, 1, 'x', [], { version: 0, settings: {} }, { version: 3, settings: {} }, { version: '2', settings: {} }, { version: 2 }, { version: 2, settings: [] }]) {
      expect(normalizeDatabase(raw)).toBeNull()
    }
    expect(inspectImport('[1,2]')).toMatchObject({ ok: false, error: 'Expected a JSON object' })
    expect(inspectImport('{"version":"2"}')).toMatchObject({ ok: false, error: 'Unsupported version: 2', version: undefined })
  })
})

describe('normalizeDatabase drops or repairs malformed records', () => {
  const norm = (patch: Record<string, unknown>) => normalizeDatabase({ version: 2, settings: {}, ...patch })!

  it('drops events with a bad score, intent or missing fields and defaults the rest', () => {
    const good = { id: 'ok', at: 'a', date: 'd', intent: 'post', triggerId: 't', awarenessBefore: 4, seeking: 'seen', choice: 'draft' }
    const db = norm({
      events: [
        good,
        { ...good, id: 'bad-score', awarenessBefore: 0 },
        { ...good, id: 'float-score', awarenessBefore: 4.5 },
        { ...good, id: 'bad-intent', intent: 'scroll' },
        { ...good, id: 'no-choice', choice: undefined },
        { ...good, id: 7 },
        'string',
        { ...good, id: 'extras', awarenessAfter: 11, phase: 'nonsense', finish: '   ', dayNumber: 'x' },
        { ...good, id: 'finish', finish: '  до конца ролика  ' },
      ],
    })
    expect(db.events.map((e) => e.id)).toEqual(['ok', 'extras', 'finish'])
    expect(db.events[0]).toMatchObject({ seekingNote: '', overLimit: false, elapsedSeconds: 0, dayNumber: null, phase: 'practice' })
    expect(db.events[1]).not.toHaveProperty('awarenessAfter')
    expect(db.events[1]).not.toHaveProperty('finish')
    expect(db.events[2]!.finish).toBe('до конца ролика')
  })

  it('drops sessions with unknown seekings or bad scores and ignores unknown end reasons', () => {
    const good = { id: 's', triggerId: 't', startedAt: 'x', date: 'd', awarenessAtStart: 3, seeking: 'relief' }
    const db = norm({
      sessions: [
        good,
        { ...good, id: 'post-motive', seeking: 'seen' },
        { ...good, id: 'bad', awarenessAtStart: 12 },
        { ...good, id: 'no-start', startedAt: 1 },
        { ...good, id: 'weird', endReason: 'crash', found: 'maybe', finish: ' x ' },
      ],
    })
    expect(db.sessions.map((s) => s.id)).toEqual(['s', 'weird'])
    expect(db.sessions[0]).toMatchObject({ pauseId: 's', plannedMinutes: 15, extendedMinutes: 0, overLimit: false })
    expect(db.sessions[1]).not.toHaveProperty('endReason')
    expect(db.sessions[1]).not.toHaveProperty('found')
    expect(db.sessions[1]!.finish).toBe('x')
  })

  it('repairs misses, day marks, experiments, evenings, mornings and postpones', () => {
    const db = norm({
      misses: [{ id: 'm', triggerId: 't', awareness: 99 }, { id: 'no-trigger' }],
      dayMarks: [{ date: 'd', realContact: 'yes' }, { date: 'e', realContact: false, contactNote: 'n' }, { nodate: true }],
      experiments: [{ id: 'x', weekIndex: 1, status: 'weird' }, { id: 'y', weekIndex: '1' }],
      evenings: [{ date: 'd', likesChanged: 'kinda', unloggedMisses: 'two' }, { at: 'no date' }],
      mornings: [{ date: 'd', firstDesire: 'f', awareness: 0 }, { date: 'd', firstDesire: 'f', awareness: 3 }],
      postpones: [{ id: 'p', until: 'u', pauseId: 'x', triggerId: 't' }],
      triggers: [{ id: 't', label: 'x'.repeat(100) }, { id: 1, label: 'n' }],
    })
    expect(db.misses).toEqual([{ id: 'm', at: new Date(0).toISOString(), date: '1970-01-01', triggerId: 't', note: '' }])
    expect(db.dayMarks).toEqual([
      { date: 'd', realContact: null, contactNote: '' },
      { date: 'e', realContact: false, contactNote: 'n' },
    ])
    expect(db.experiments).toEqual([{ id: 'x', weekIndex: 1, status: 'open' }])
    expect(db.evenings).toEqual([{ date: 'd', at: 'd', lowestMoment: '', note: '', unloggedMisses: 0 }])
    expect(db.mornings).toEqual([{ date: 'd', at: 'd', awareness: 3, firstDesire: 'f' }])
    expect(db.postpones).toEqual([])
    expect(db.triggers).toHaveLength(1)
    expect(db.triggers[0]!.label).toHaveLength(40)
  })

  it('sanitises windows, night range, replacements, language and theme', () => {
    const db = norm({
      settings: {
        lang: 'de',
        theme: 'neon',
        windows: ['18:00', '09:00', '09:00', '25:00', 'x', '12:00', '15:00'],
        windowMinutes: 31,
        nightStart: '23:00',
        nightEnd: '23:00',
        replacements: { approval: `  ${'a'.repeat(200)}  `, novelty: 5, unknown: 'x' },
        haptics: false,
        sound: 'no',
      },
    })
    expect(db.settings).toMatchObject({
      lang: 'auto',
      theme: 'ink',
      windows: ['09:00', '12:00', '18:00'],
      windowMinutes: 45,
      nightStart: null,
      nightEnd: null,
      haptics: false,
      sound: true,
    })
    expect(db.settings.replacements.approval).toHaveLength(160)
    expect(db.settings.replacements.novelty).toBe('')
    expect(norm({ settings: { nightStart: '23:00', nightEnd: '06:30', windowMinutes: 60 } }).settings).toMatchObject({
      nightStart: '23:00',
      nightEnd: '06:30',
      windowMinutes: 60,
    })
    expect(norm({ settings: { nightStart: '23:00' } }).settings.nightStart).toBeNull()
  })
})

describe('.bak recovery with corrupted JSON', () => {
  const corrupted = ['{', '{"version":2,', '', 'null', '"str"', '[]', '{"version":2,"settings":', '\u0000\u0001', 'undefined']

  it.each(corrupted.filter((raw) => raw !== ''))('loadDb(%j) returns null and sets the raw text aside, not in .bak', (raw) => {
    const kv = memoryStore()
    kv.set(STORAGE_KEY, raw)
    expect(loadDb(kv)).toBeNull()
    expect(kv.get(CORRUPT_KEY)).toBe(raw)
    expect(kv.get(BACKUP_KEY)).toBeNull()
    expect(kv.get(STORAGE_KEY)).toBe(raw) // the primary is not wiped by loading
    expect(hasValidBackup(kv)).toBe(false)
    expect(restoreBackup(kv)).toBe(false)
  })

  it('an empty primary is a fresh start, not a corruption', () => {
    const kv = memoryStore()
    expect(loadDb(kv)).toBeNull()
    kv.set(STORAGE_KEY, '')
    expect(loadDb(kv)).toBeNull()
    expect(kv.get(BACKUP_KEY)).toBeNull()
  })

  it('a truncated write (half a JSON file) is recoverable from a backup taken before import', () => {
    const kv = memoryStore()
    const good = exampleDatabase('2026-10-13', new Date('2026-10-13T12:00:00Z'))
    saveDb(kv, good)
    saveBackup(kv, good)
    const full = kv.get(STORAGE_KEY)!
    // Simulate a crash mid-write on the primary only.
    kv.set(STORAGE_KEY, full.slice(0, Math.floor(full.length / 2)))
    // Restoring before the app reloads brings the data back.
    expect(hasValidBackup(kv)).toBe(true)
    expect(restoreBackup(kv)).toBe(true)
    expect(loadDb(kv)).toEqual(normalizeDatabase(good))
    expect(kv.get(BACKUP_KEY)).toBeNull()
  })

  it('restoreBackup refuses a backup that parses but has the wrong shape', () => {
    const kv = memoryStore()
    kv.set(BACKUP_KEY, JSON.stringify({ version: 2, settings: 'nope' }))
    expect(hasValidBackup(kv)).toBe(false)
    expect(restoreBackup(kv)).toBe(false)
    expect(kv.get(STORAGE_KEY)).toBeNull()
  })

  // BUG (data loss): loadDb() copies a corrupted primary over BACKUP_KEY unconditionally.
  // If the user had a valid backup (saveBackup runs before every import), a corrupted primary
  // on the next launch destroys that backup, hasValidBackup() turns false, the "Restore" button
  // disappears, and the app starts empty and soon overwrites the primary too.
  // Expected: keep a valid .bak (e.g. stash the corrupt text under a separate key).
  it('keeps an existing valid backup when the primary turns out to be corrupted', () => {
    const kv = memoryStore()
    const good = exampleDatabase('2026-10-13', new Date('2026-10-13T12:00:00Z'))
    saveBackup(kv, good)
    kv.set(STORAGE_KEY, '{"version":2,"settings":{')
    expect(loadDb(kv)).toBeNull()
    expect(hasValidBackup(kv)).toBe(true)
  })
})

/** Arbitrary JSON-ish records shaped loosely like a database, to stress the normaliser. */
const looseDb = fc.record(
  {
    version: fc.constantFrom(1, 2),
    settings: fc.dictionary(
      fc.constantFrom('lang', 'theme', 'windows', 'nightStart', 'nightEnd', 'replacements', 'pauseSeconds', 'sound', 'eveningReminder'),
      fc.jsonValue(),
    ),
    triggers: fc.array(fc.record({ id: fc.string(), label: fc.string({ maxLength: 60 }), preset: fc.boolean() })),
    startedOn: fc.option(fc.string()),
    events: fc.array(
      fc.record({
        id: fc.string(),
        at: fc.string(),
        date: fc.string(),
        intent: fc.constantFrom('browse', 'post', 'other'),
        triggerId: fc.string(),
        awarenessBefore: fc.integer({ min: -1, max: 11 }),
        seeking: fc.string(),
        choice: fc.string(),
        seekingNote: fc.string(),
        finish: fc.stringMatching(/^\S{0,90}$/),
      }),
    ),
    misses: fc.array(fc.dictionary(fc.constantFrom('id', 'triggerId', 'at', 'date', 'note', 'awareness'), fc.jsonValue())),
    dayMarks: fc.array(fc.dictionary(fc.constantFrom('date', 'realContact', 'contactNote'), fc.jsonValue())),
  },
  { requiredKeys: ['version', 'settings'] },
)

describe('import/export round-trip (property-based)', () => {
  it('never throws on arbitrary JSON and either refuses or yields a v2 database', () => {
    fc.assert(
      fc.property(fc.oneof(fc.jsonValue(), looseDb), (raw) => {
        const db = normalizeDatabase(raw)
        if (db) expect(db.version).toBe(2)
        const report = inspectImport(JSON.stringify(raw) ?? 'null')
        expect(report.ok).toBe(db !== null)
      }),
      { numRuns: 400 },
    )
  })

  it('export → import is stable: normalising an exported database changes nothing', () => {
    fc.assert(
      fc.property(looseDb, (raw) => {
        const first = normalizeDatabase(raw)
        if (!first) return
        const exported = JSON.stringify(first, null, 2)
        const second = normalizeDatabase(JSON.parse(exported))
        expect(second).toEqual(first)
      }),
      { numRuns: 400 },
    )
  })

  it('a database built by the app survives save → load unchanged', () => {
    const kv = memoryStore()
    const db: Database = exampleDatabase('2026-10-13', new Date('2026-10-13T12:00:00Z'))
    saveDb(kv, db)
    expect(loadDb(kv)).toEqual(db)
    const empty = emptyDatabase()
    saveDb(kv, empty)
    expect(loadDb(kv)).toEqual(empty)
  })

  // BUG (minor): text is trimmed *before* it is cut to length, so a cut that lands right after a
  // space leaves a trailing space; the next import trims it again. Export → import → export is
  // therefore not byte-stable for long finish lines / replacements. Fix: trim after slicing.
  it('a long finish line with a space at the cut point is stable across re-import', () => {
    const finish = `${'a'.repeat(79)} tail`
    const event = { id: 'e', at: 'a', date: 'd', intent: 'browse', triggerId: 't', awarenessBefore: 5, seeking: 'boredom', choice: 'open', finish }
    const first = normalizeDatabase({ version: 2, settings: {}, events: [event] })!
    const second = normalizeDatabase(JSON.parse(JSON.stringify(first)))!
    expect(second.events[0]!.finish).toBe(first.events[0]!.finish)
  })
})
