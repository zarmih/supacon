import { describe, expect, it } from 'vitest'
import { createDraft, advanceFromArrive, choose, setScore, setSeeking } from '../src/domain/pause'
import { exampleDatabase } from '../src/domain/example'
import { defaultSettings, emptyDatabase } from '../src/store/defaults'
import type { Database } from '../src/domain/types'
import {
  commitPause,
  completeOnboarding,
  endSession,
  extendSession,
  logMiss,
  saveContact,
  saveEvening,
  restartProtocol,
  sanitizeSettings,
  saveMorning,
  setPracticeMode,
  toggleTrigger,
  updateSettings,
} from '../src/store/mutate'
import {
  BACKUP_KEY,
  CORRUPT_KEY,
  STORAGE_KEY,
  loadOrRecover,
  hasValidBackup,
  inspectImport,
  loadDb,
  memoryStore,
  normalizeDatabase,
  restoreBackup,
  saveBackup,
  saveDb,
} from '../src/store/storage'

function readyDraft(now: Date) {
  let draft = advanceFromArrive(
    createDraft({
      id: 'pause-1',
      intent: 'browse',
      triggerId: 'instagram',
      now: now.getTime() - 12_000,
      minSeconds: 10,
      completedPauses: 0,
    }),
  )
  draft = setScore(draft, 3)
  draft = setSeeking(draft, 'validation')
  const chosen = choose(draft, 'open', now.getTime())
  if (!chosen) throw new Error('draft was not ready')
  return chosen
}

describe('store', () => {
  it('commits an open into a session and marks the fourth one past the limit', () => {
    const start = new Date(2026, 9, 3, 21, 0, 0)
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date(2026, 9, 1, 8, 0, 0),
    })
    expect(db.triggers.some((trigger) => trigger.id === 'other')).toBe(true)
    for (let index = 0; index < 3; index += 1) {
      const committed = commitPause(db, { ...readyDraft(start), id: `p-${index}` }, start)
      expect(committed).not.toBeNull()
      db = committed!.db
    }
    const fourth = commitPause(db, { ...readyDraft(start), id: 'p-4' }, start)
    expect(fourth?.db.events.at(-1)?.overLimit).toBe(true)
    expect(fourth?.sessionId).toBeTruthy()
    db = endSession(fourth!.db, fourth!.sessionId!, 'no', start)
    expect(db.sessions.at(-1)?.found).toBe('no')
    db = extendSession(db, fourth!.sessionId!)
    expect(db.sessions.at(-1)?.extendedMinutes).toBe(0)
  })

  it('extends only a running session and postpones without opening one', () => {
    const now = new Date(2026, 9, 4, 12, 0, 0)
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'youtube', label: 'YouTube', preset: true }],
      path: 'protocol',
      now: new Date(2026, 9, 1, 8, 0, 0),
    })
    let draft = setScore(
      createDraft({
        id: 'post-1',
        intent: 'browse',
        triggerId: 'youtube',
        now: now.getTime() - 20_000,
        minSeconds: 10,
        completedPauses: 4,
      }),
      8,
    )
    draft = setSeeking(draft, 'boredom')
    const chosen = choose(draft, 'postpone', now.getTime())
    const committed = commitPause(db, chosen!, now)
    db = committed!.db
    expect(committed?.sessionId).toBeUndefined()
    expect(db.postpones).toHaveLength(1)
    expect(db.postpones[0]?.until).toBe(new Date(now.getTime() + 30 * 60_000).toISOString())
  })

  it('round-trips example data and refuses a foreign file', () => {
    const kv = memoryStore()
    const db = exampleDatabase('2026-10-13')
    saveDb(kv, db)
    const loaded = loadDb(kv)
    expect(loaded?.events).toHaveLength(db.events.length)
    expect(loaded?.demo).toBe(true)

    kv.set('supacon.v1', '{')
    expect(loadDb(kv)).toBeNull()
    expect(kv.get('supacon.v1.corrupt')).toBe('{')
    expect(kv.get('supacon.v1.bak')).toBeNull()

    kv.set('supacon.v1', JSON.stringify({ version: 1, settings: { lang: 'en' } }))
    const migrated = loadDb(kv)
    expect(migrated?.version).toBe(2)
    expect(migrated?.settings.windows).toEqual([])
    expect(migrated?.settings.windowMinutes).toBe(45)

    kv.set('supacon.v1', JSON.stringify({ version: 3, settings: {} }))
    expect(loadDb(kv)).toBeNull()
  })

  it('clamps imported settings that are not on the allow-list', () => {
    const loaded = (settings: Record<string, unknown>) => normalizeDatabase({ version: 2, settings })

    const illegal = loaded({ pauseSeconds: 0, maxSessionsPerDay: 99 })
    expect(illegal?.settings.pauseSeconds).toBe(10)
    expect(illegal?.settings.maxSessionsPerDay).toBe(3)

    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const numeric = loaded({ pauseSeconds: bad, maxSessionsPerDay: bad })
      expect(numeric?.settings.pauseSeconds).toBe(10)
      expect(numeric?.settings.maxSessionsPerDay).toBe(3)
    }

    expect(loaded({ pauseSeconds: 999999 })?.settings.pauseSeconds).toBe(10)
    expect(loaded({ pauseSeconds: 5, maxSessionsPerDay: 0 })?.settings).toMatchObject({
      pauseSeconds: 5,
      maxSessionsPerDay: 0,
    })
    expect(loaded({ pauseSeconds: 15, maxSessionsPerDay: 6 })?.settings).toMatchObject({
      pauseSeconds: 15,
      maxSessionsPerDay: 6,
    })

    const kv = memoryStore()
    kv.set(
      'supacon.v1',
      JSON.stringify({
        version: 2,
        settings: {
          pauseSeconds: 1,
          maxSessionsPerDay: 7,
          sessionMinutes: 1,
          postponeMinutes: 0,
          focusMinutes: 999,
        },
      }),
    )
    const fromDisk = loadDb(kv)
    expect(fromDisk?.settings.pauseSeconds).toBe(10)
    expect(fromDisk?.settings.maxSessionsPerDay).toBe(3)
    expect(fromDisk?.settings.sessionMinutes).toBe(15)
    expect(fromDisk?.settings.postponeMinutes).toBe(30)
    expect(fromDisk?.settings.focusMinutes).toBe(45)
  })

  it('does not disable the last trigger, and restart keeps history', () => {
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'news', label: 'News', preset: true }],
      path: 'free',
      now: new Date(2026, 9, 2, 9, 0, 0),
    })
    expect(db.settings.maxSessionsPerDay).toBe(0)
    expect(db.practiceMode).toBe('free')
    const onlyCustom = db.triggers.filter((trigger) => trigger.id !== 'other')
    db = toggleTrigger(db, onlyCustom[0]!.id)
    expect(db.triggers.filter((trigger) => trigger.enabled).length).toBeGreaterThan(0)
    db = setPracticeMode(db, 'maintenance')
    expect(db.settings.maxSessionsPerDay).toBe(3)
    db = saveMorning(db, { awareness: 5, firstDesire: 'Walk', now: new Date(2026, 9, 2, 9, 30, 0) })
    db = restartProtocol(db, new Date(2026, 9, 10, 8, 0, 0))
    expect(db.startedOn).toBe('2026-10-10')
    expect(db.practiceMode).toBeNull()
    expect(db.mornings).toHaveLength(1)
    db = updateSettings(db, { pauseSeconds: 15, maxSessionsPerDay: 99 })
    expect(db.settings.pauseSeconds).toBe(15)
    expect(db.settings.maxSessionsPerDay).toBe(3)
    expect(logMiss(db, { triggerId: 'missing', note: '', now: new Date() })).toBeNull()
  })

  it('inspectImport accurately analyzes valid and invalid JSON without modifying storage', () => {
    // Valid example database
    const example = exampleDatabase('2026-10-13')
    const validJson = JSON.stringify(example)
    const inspection = inspectImport(validJson)
    expect(inspection.ok).toBe(true)
    expect(inspection.pauseCount).toBe(example.events.length)
    expect(inspection.version).toBe(2)
    expect(inspection.dateRange).toBe('2026-10-07 — 2026-10-13')
    expect(inspection.error).toBeUndefined()

    // Empty database
    const emptyJson = JSON.stringify(emptyDatabase())
    const emptyInspection = inspectImport(emptyJson)
    expect(emptyInspection.ok).toBe(true)
    expect(emptyInspection.pauseCount).toBe(0)
    expect(emptyInspection.version).toBe(2)
    expect(emptyInspection.dateRange).toBeUndefined()

    // Invalid JSON syntax
    const badSyntax = inspectImport('{ invalid json')
    expect(badSyntax.ok).toBe(false)
    expect(badSyntax.pauseCount).toBe(0)
    expect(badSyntax.error).toBe('Invalid JSON syntax')

    // Non-object primitive
    const notObject = inspectImport('"not an object"')
    expect(notObject.ok).toBe(false)
    expect(notObject.pauseCount).toBe(0)
    expect(notObject.error).toBe('Expected a JSON object')

    // Unsupported version
    const wrongVersion = inspectImport(JSON.stringify({ version: 99, settings: {} }))
    expect(wrongVersion.ok).toBe(false)
    expect(wrongVersion.version).toBe(99)
    expect(wrongVersion.error).toContain('Unsupported version')

    // Missing settings / malformed structure
    const malformed = inspectImport(JSON.stringify({ version: 2 }))
    expect(malformed.ok).toBe(false)
    expect(malformed.version).toBe(2)
    expect(malformed.error).toBe('Invalid database structure')
  })

  it('safely manages backups and restores from supacon.v1.bak', () => {
    const kv = memoryStore()
    expect(hasValidBackup(kv)).toBe(false)
    expect(restoreBackup(kv)).toBe(false)

    // Corrupted backup data is not recognized as valid
    kv.set(BACKUP_KEY, '{')
    expect(hasValidBackup(kv)).toBe(false)
    expect(restoreBackup(kv)).toBe(false)

    // Unsupported version backup is not recognized as valid
    kv.set(BACKUP_KEY, JSON.stringify({ version: 99 }))
    expect(hasValidBackup(kv)).toBe(false)
    expect(restoreBackup(kv)).toBe(false)

    // Save a base DB to primary storage
    const primaryDb = emptyDatabase()
    primaryDb.startedOn = '2026-10-01'
    saveDb(kv, primaryDb)

    // Create a backup with example database
    const backupData = exampleDatabase('2026-10-13')
    saveBackup(kv, backupData)

    expect(hasValidBackup(kv)).toBe(true)

    // Restore backup
    const restoredOk = restoreBackup(kv)
    expect(restoredOk).toBe(true)

    // Primary storage should now have the restored data
    const loaded = loadDb(kv)
    expect(loaded?.startedOn).toBe(backupData.startedOn)
    expect(loaded?.events).toHaveLength(backupData.events.length)

    // After restoration, backup has been consumed
    expect(hasValidBackup(kv)).toBe(false)
    expect(restoreBackup(kv)).toBe(false)
  })

  it('manages sensory settings (haptics and sound) with backward compatibility', () => {
    // 1. Defaults are true
    const defaults = defaultSettings()
    expect(defaults.haptics).toBe(true)
    expect(defaults.sound).toBe(true)

    // 2. updateSettings allows toggling haptics and sound
    let db = emptyDatabase()
    expect(db.settings.haptics).toBe(true)
    expect(db.settings.sound).toBe(true)

    db = updateSettings(db, { haptics: false })
    expect(db.settings.haptics).toBe(false)
    expect(db.settings.sound).toBe(true)

    db = updateSettings(db, { sound: false })
    expect(db.settings.haptics).toBe(false)
    expect(db.settings.sound).toBe(false)

    db = updateSettings(db, { haptics: true, sound: true })
    expect(db.settings.haptics).toBe(true)
    expect(db.settings.sound).toBe(true)

    // 3. sanitizeSettings preserves booleans or falls back to defaults
    const sanitized = sanitizeSettings({
      ...defaults,
      haptics: false,
      sound: false,
    })
    expect(sanitized.haptics).toBe(false)
    expect(sanitized.sound).toBe(false)

    const invalidTypes = sanitizeSettings({
      ...defaults,
      haptics: 'no' as unknown as boolean,
      sound: null as unknown as boolean,
    })
    expect(invalidTypes.haptics).toBe(true)
    expect(invalidTypes.sound).toBe(true)

    // 4. normalizeDatabase backward compatibility: older schema records without haptics/sound default to true
    const legacyRaw = {
      version: 2,
      settings: {
        lang: 'en',
        theme: 'ink',
        maxSessionsPerDay: 3,
        sessionMinutes: 15,
        postponeMinutes: 30,
        focusMinutes: 45,
        pauseSeconds: 10,
        notifications: true,
      },
      triggers: [],
      startedOn: '2026-10-10',
      onboardingComplete: true,
    }
    const normalized = normalizeDatabase(legacyRaw)
    expect(normalized).not.toBeNull()
    expect(normalized?.settings.haptics).toBe(true)
    expect(normalized?.settings.sound).toBe(true)

    // 5. normalizeDatabase preserves explicit false values
    const explicitFalseRaw = {
      ...legacyRaw,
      settings: {
        ...legacyRaw.settings,
        haptics: false,
        sound: false,
      },
    }
    const normalizedFalse = normalizeDatabase(explicitFalseRaw)
    expect(normalizedFalse).not.toBeNull()
    expect(normalizedFalse?.settings.haptics).toBe(false)
    expect(normalizedFalse?.settings.sound).toBe(false)
  })
})

describe('import without triggers', () => {
  const raw = (triggers: unknown[]) => ({
    version: 1,
    settings: {},
    triggers,
    startedOn: '2026-10-10',
    onboardingComplete: true,
  })

  it('reopens onboarding when the file has no trigger', () => {
    const db = normalizeDatabase({ version: 1, settings: {}, onboardingComplete: true })
    expect(db).not.toBeNull()
    expect(db?.triggers).toEqual([])
    expect(db?.onboardingComplete).toBe(false)
    expect(normalizeDatabase(raw([]))?.onboardingComplete).toBe(false)
  })

  it('reopens onboarding when every trigger is unusable or disabled', () => {
    expect(normalizeDatabase(raw([{ id: 7, label: 'broken' }]))?.onboardingComplete).toBe(false)
    expect(normalizeDatabase(raw([{ id: 'news', label: 'News', enabled: false }]))?.onboardingComplete).toBe(false)
  })

  it('keeps onboarding complete when a trigger is usable', () => {
    const db = normalizeDatabase(raw([{ id: 'news', label: 'News', preset: true }]))
    expect(db?.onboardingComplete).toBe(true)
  })
})

describe('a corrupted primary record', () => {
  const good = () => exampleDatabase('2026-10-13', new Date('2026-10-13T12:00:00Z'))

  it('keeps a valid backup instead of overwriting it with the broken text', () => {
    const kv = memoryStore()
    saveBackup(kv, good())
    const backup = kv.get(BACKUP_KEY)
    kv.set(STORAGE_KEY, '{"version":2,"settings":{')
    expect(loadDb(kv)).toBeNull()
    expect(kv.get(BACKUP_KEY)).toBe(backup)
    expect(hasValidBackup(kv)).toBe(true)
    expect(kv.get(CORRUPT_KEY)).toBe('{"version":2,"settings":{')
  })

  it('keeps the backup when the primary parses but has the wrong shape', () => {
    const kv = memoryStore()
    saveBackup(kv, good())
    kv.set(STORAGE_KEY, JSON.stringify({ version: 2, settings: 'nope' }))
    expect(loadDb(kv)).toBeNull()
    expect(hasValidBackup(kv)).toBe(true)
  })

  it('never puts unreadable text into the backup slot, even when there is no backup', () => {
    const kv = memoryStore()
    kv.set(STORAGE_KEY, 'not json')
    expect(loadDb(kv)).toBeNull()
    expect(kv.get(BACKUP_KEY)).toBeNull()
    expect(kv.get(CORRUPT_KEY)).toBe('not json')
  })

  it('recovers from the backup on startup', () => {
    const kv = memoryStore()
    const db = good()
    saveBackup(kv, db)
    kv.set(STORAGE_KEY, '{')
    const result = loadOrRecover(kv)
    expect(result.recovered).toBe(true)
    expect(result.db).toEqual(normalizeDatabase(JSON.parse(JSON.stringify(db))))
    expect(loadDb(kv)).toEqual(result.db)
    expect(kv.get(CORRUPT_KEY)).toBe('{')
  })

  it('does not touch a readable primary or an empty store', () => {
    const kv = memoryStore()
    expect(loadOrRecover(kv)).toEqual({ db: null, recovered: false })
    const primary = emptyDatabase()
    primary.startedOn = '2026-10-01'
    saveDb(kv, primary)
    saveBackup(kv, good())
    const result = loadOrRecover(kv)
    expect(result.recovered).toBe(false)
    expect(result.db?.startedOn).toBe('2026-10-01')
    expect(hasValidBackup(kv)).toBe(true)
  })

  it('starts empty when both the primary and the backup are unreadable', () => {
    const kv = memoryStore()
    kv.set(BACKUP_KEY, '{')
    kv.set(STORAGE_KEY, '[')
    expect(loadOrRecover(kv)).toEqual({ db: null, recovered: false })
    expect(kv.get(BACKUP_KEY)).toBe('{')
  })
})

describe('text normalisation is idempotent', () => {
  const event = (finish: string) => ({
    id: 'e',
    at: '2026-10-13T10:00:00.000Z',
    date: '2026-10-13',
    intent: 'browse',
    triggerId: 'instagram',
    awarenessBefore: 5,
    seeking: 'boredom',
    choice: 'open',
    finish,
  })
  const reimport = (db: Database) => normalizeDatabase(JSON.parse(JSON.stringify(db)))!

  it('a finish line cut right after a space has no trailing space and survives re-import', () => {
    const first = normalizeDatabase({ version: 2, settings: {}, events: [event(`${'a'.repeat(79)} tail`)] })!
    expect(first.events[0]!.finish).toBe('a'.repeat(79))
    expect(reimport(first)).toEqual(first)
  })

  it('a replacement cut right after a space survives re-import', () => {
    const text = `${'b'.repeat(159)} more`
    const first = normalizeDatabase({ version: 2, settings: { replacements: { approval: text } } })!
    expect(first.settings.replacements.approval).toBe('b'.repeat(159))
    expect(reimport(first)).toEqual(first)
  })

  it('what the app saves is already what an import would produce', () => {
    let db = emptyDatabase()
    db = updateSettings(db, { replacements: { ...db.settings.replacements, loss: `${'c'.repeat(159)} x` } })
    expect(db.settings.replacements.loss).toBe('c'.repeat(159))
    db = saveEvening(db, {
      date: '2026-10-13',
      at: '2026-10-13T20:00:00.000Z',
      lowestMoment: `${'d'.repeat(179)} x`,
      note: `${'e'.repeat(599)} x`,
      unloggedMisses: 0,
      likesNote: `${'f'.repeat(299)} x`,
      whereItBroke: `${'g'.repeat(399)} x`,
    })
    db = saveContact(db, { date: '2026-10-13', realContact: true, note: `${'h'.repeat(179)} x` })
    const evening = db.evenings[0]!
    for (const text of [evening.lowestMoment, evening.note, evening.likesNote, evening.whereItBroke, db.dayMarks[0]!.contactNote]) {
      expect(text).toBe(text?.trim())
    }
    expect(reimport(db)).toEqual(db)
  })
})
