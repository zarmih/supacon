import { describe, expect, it } from 'vitest'
import { emptyDatabase } from '../src/store/defaults'
import { loadDb, saveDb, memoryStore, type KeyValue } from '../src/store/storage'
import { createSync } from '../src/store/merge'
import type { Database } from '../src/domain/types'

describe('localStorage QuotaExceededError handling and recovery', () => {
  it('preserves existing data when saveDb throws QuotaExceededError and recovers once quota is cleared', () => {
    const underlying = memoryStore()
    let quotaExceeded = false

    const faultyStore: KeyValue = {
      get: (k) => underlying.get(k),
      remove: (k) => underlying.remove(k),
      set: (k, v) => {
        if (quotaExceeded) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        }
        underlying.set(k, v)
      },
    }

    const initialDb = emptyDatabase()
    initialDb.startedOn = '2026-11-01'
    initialDb.events = [
      {
        id: 'initial-1',
        at: '2026-11-01T10:00:00.000Z',
        date: '2026-11-01',
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 5,
        seeking: 'boredom',
        seekingNote: 'existing important note',
        choice: 'open',
        elapsedSeconds: 15,
        dayNumber: 1,
        phase: 'practice',
        overLimit: false,
      },
    ]

    // Save initial good data
    saveDb(faultyStore, initialDb)
    const loadedBefore = loadDb(faultyStore)
    expect(loadedBefore?.events.length).toBe(1)
    expect(loadedBefore?.events[0]?.seekingNote).toBe('existing important note')

    // Simulate quota exceeded
    quotaExceeded = true
    const updatedDb: Database = {
      ...initialDb,
      events: [
        ...initialDb.events,
        {
          id: 'new-2',
          at: '2026-11-02T10:00:00.000Z',
          date: '2026-11-02',
          intent: 'browse',
          triggerId: 'youtube',
          awarenessBefore: 7,
          seeking: 'relief',
          seekingNote: 'new note during quota issue',
          choice: 'postpone',
          elapsedSeconds: 10,
          dayNumber: 2,
          phase: 'practice',
          overLimit: false,
        },
      ],
    }

    let caughtError: unknown = null
    try {
      saveDb(faultyStore, updatedDb)
    } catch (err) {
      caughtError = err
    }
    expect(caughtError).not.toBeNull()
    expect((caughtError as DOMException).name).toBe('QuotaExceededError')

    // Verify existing database in storage was not corrupted or wiped
    const loadedDuring = loadDb(faultyStore)
    expect(loadedDuring).not.toBeNull()
    expect(loadedDuring?.events.length).toBe(1)
    expect(loadedDuring?.events[0]?.id).toBe('initial-1')

    // Relieve quota pressure
    quotaExceeded = false

    // Writing again succeeds
    expect(() => saveDb(faultyStore, updatedDb)).not.toThrow()
    const loadedAfter = loadDb(faultyStore)
    expect(loadedAfter?.events.length).toBe(2)
    expect(loadedAfter?.events[1]?.id).toBe('new-2')
    expect(loadedAfter?.events[1]?.seekingNote).toBe('new note during quota issue')
  })

  it('createSync retains base state on QuotaExceededError and recovers all accumulated changes on retry', () => {
    const underlying = memoryStore()
    let quotaExceeded = false

    const faultyStore: KeyValue = {
      get: (k) => underlying.get(k),
      remove: (k) => underlying.remove(k),
      set: (k, v) => {
        if (quotaExceeded) {
          throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
        }
        underlying.set(k, v)
      },
    }

    const initialDb = emptyDatabase()
    initialDb.startedOn = '2026-11-01'
    saveDb(faultyStore, initialDb)

    const sync = createSync(faultyStore, initialDb)

    // Trigger quota failure
    quotaExceeded = true

    // Attempt mutation 1: settings update
    const mutation1: Database = {
      ...initialDb,
      settings: {
        ...initialDb.settings,
        nightStart: '22:00',
        nightEnd: '07:00',
      },
    }

    let write1Error: unknown = null
    try {
      sync.write(mutation1)
    } catch (err) {
      write1Error = err
    }
    expect(write1Error).not.toBeNull()
    expect((write1Error as DOMException).name).toBe('QuotaExceededError')

    // Attempt mutation 2: new pause event
    const mutation2: Database = {
      ...mutation1,
      events: [
        {
          id: 'pause-during-quota',
          at: '2026-11-01T22:30:00.000Z',
          date: '2026-11-01',
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 8,
          seeking: 'boredom',
          seekingNote: 'night pause during quota issue',
          choice: 'open',
          elapsedSeconds: 12,
          dayNumber: 1,
          phase: 'practice',
          overLimit: false,
        },
      ],
    }

    let write2Error: unknown = null
    try {
      sync.write(mutation2)
    } catch (err) {
      write2Error = err
    }
    expect(write2Error).not.toBeNull()
    expect((write2Error as DOMException).name).toBe('QuotaExceededError')

    // Previous disk state is completely intact
    const diskBefore = loadDb(faultyStore)
    expect(diskBefore?.settings.nightStart).toBeNull()
    expect(diskBefore?.events.length).toBe(0)

    // Relieve quota pressure
    quotaExceeded = false

    // Retrying sync.write with the accumulated state (mutation2) succeeds
    const merged = sync.write(mutation2)
    expect(merged.settings.nightStart).toBe('22:00')
    expect(merged.events.length).toBe(1)
    expect(merged.events[0]?.id).toBe('pause-during-quota')

    // Storage now has both changes safely persisted
    const diskAfter = loadDb(faultyStore)
    expect(diskAfter?.settings.nightStart).toBe('22:00')
    expect(diskAfter?.settings.nightEnd).toBe('07:00')
    expect(diskAfter?.events.length).toBe(1)
    expect(diskAfter?.events[0]?.seekingNote).toBe('night pause during quota issue')
  })
})
