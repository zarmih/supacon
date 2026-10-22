import { describe, expect, it } from 'vitest'
import { MIN_BROWSE_FOR_HINTS, pickHint } from '../src/domain/hints'
import { emptyDatabase } from '../src/store/defaults'
import type { Database, Impulse, PauseEvent } from '../src/domain/types'

const MINUTE = 60 * 1000

function browse(id: string, at: Date, awareness: number, seeking: Impulse, choice: PauseEvent['choice']): PauseEvent {
  return {
    id,
    at: at.toISOString(),
    date: '2026-10-10',
    intent: 'browse',
    triggerId: 'news',
    awarenessBefore: awareness as PauseEvent['awarenessBefore'],
    seeking,
    seekingNote: '',
    choice,
    overLimit: false,
    elapsedSeconds: 10,
    dayNumber: 1,
    phase: 'calibration',
  }
}

function input(now: Date, awareness: number, seeking: Impulse = 'habit') {
  return {
    intent: 'browse' as const,
    awareness,
    seeking,
    triggerId: 'news',
    overLimit: false,
    hour: now.getHours(),
    now: now.getTime(),
  }
}

/** Browse pauses spread over distinct hours so the loud hour stays silent. */
function withBrowse(count: number, awareness: number, choice: PauseEvent['choice']): Database {
  const db = emptyDatabase()
  for (let index = 0; index < count; index += 1) {
    db.events.push(browse(`b${index}`, new Date(2026, 9, 9, index, 0), awareness, 'habit', choice))
  }
  return db
}

describe('hint threshold', () => {
  it('stays silent below six browse pauses, even for a spacious score', () => {
    const now = new Date(2026, 9, 13, 15, 0)
    for (let count = 1; count < MIN_BROWSE_FOR_HINTS; count += 1) {
      expect(pickHint(withBrowse(count, 8, 'close'), input(now, 9))).toBeNull()
      expect(pickHint(withBrowse(count, 2, 'open'), input(now, 2))).toBeNull()
    }
  })

  it('speaks once six browse pauses exist', () => {
    const now = new Date(2026, 9, 13, 15, 0)
    expect(pickHint(withBrowse(MIN_BROWSE_FOR_HINTS, 8, 'close'), input(now, 9))).toBe('space')
    expect(pickHint(withBrowse(MIN_BROWSE_FOR_HINTS, 2, 'open'), input(now, 2))).toBe('low-score-pattern')
  })

  it('does not name a loud hour from five pauses', () => {
    const db = emptyDatabase()
    for (let index = 0; index < 5; index += 1) {
      db.events.push(browse(`h${index}`, new Date(2026, 9, 10, 15, index), 5, 'habit', 'close'))
    }
    expect(pickHint(db, input(new Date(2026, 9, 13, 15, 30), 5))).toBeNull()
    db.events.push(browse('h5', new Date(2026, 9, 10, 15, 5), 5, 'habit', 'close'))
    expect(pickHint(db, input(new Date(2026, 9, 13, 15, 30), 5))).toBe('loud-hour')
  })

  it('still names the cap, the night and an outside window with no pauses', () => {
    const db = emptyDatabase()
    const now = new Date(2026, 9, 13, 23, 0)
    expect(pickHint(db, { ...input(now, 5), overLimit: true })).toBe('over-limit')
    db.settings.nightStart = '22:00'
    db.settings.nightEnd = '07:00'
    expect(pickHint(db, input(now, 5))).toBe('night')
  })
})

describe('urge-passed', () => {
  function postponed(start: Date): Database {
    const db = withBrowse(3, 6, 'close')
    for (let index = 0; index < 3; index += 1) {
      const at = new Date(start.getTime() + index * 10 * MINUTE)
      db.events.push(browse(`p${index}`, at, 6, 'information', 'postpone'))
      db.postpones.push({
        id: `pp${index}`,
        pauseId: `p${index}`,
        triggerId: 'news',
        at: at.toISOString(),
        until: new Date(at.getTime() + 30 * MINUTE).toISOString(),
      })
    }
    return db
  }

  const start = new Date(2026, 9, 13, 9, 0)
  const lastAt = start.getTime() + 20 * MINUTE

  it('waits while the last return window is still open', () => {
    const db = postponed(start)
    const now = new Date(lastAt + 89 * MINUTE)
    expect(pickHint(db, input(now, 6, 'information'))).toBeNull()
  })

  it('fires once every return window has closed with no session', () => {
    const db = postponed(start)
    const now = new Date(lastAt + 90 * MINUTE)
    expect(pickHint(db, input(now, 6, 'information'))).toBe('urge-passed')
  })

  it('does not fire when a session started inside a window', () => {
    const db = postponed(start)
    db.sessions.push({
      id: 's1',
      pauseId: 'p1',
      triggerId: 'news',
      startedAt: new Date(start.getTime() + 40 * MINUTE).toISOString(),
      date: '2026-10-13',
      plannedMinutes: 15,
      extendedMinutes: 0,
      awarenessAtStart: 6,
      seeking: 'information',
    } as Database['sessions'][number])
    const now = new Date(lastAt + 3 * 60 * MINUTE)
    expect(pickHint(db, input(now, 6, 'information'))).toBeNull()
  })
})
