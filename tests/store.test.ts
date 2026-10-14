import { describe, expect, it } from 'vitest'
import { createDraft, advanceFromArrive, choose, setScore, setSeeking } from '../src/domain/pause'
import { exampleDatabase } from '../src/domain/example'
import { emptyDatabase } from '../src/store/defaults'
import {
  commitPause,
  completeOnboarding,
  endSession,
  extendSession,
  logMiss,
  restartProtocol,
  saveMorning,
  setPracticeMode,
  toggleTrigger,
  updateSettings,
} from '../src/store/mutate'
import { loadDb, memoryStore, normalizeDatabase, saveDb } from '../src/store/storage'

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
    expect(kv.get('supacon.v1.bak')).toBe('{')

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
})
