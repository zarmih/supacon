import type { AwarenessScore, Choice, Database, Impulse, PauseEvent, Session } from '../../src/domain/types'
import { emptyDatabase } from '../../src/store/defaults'

let seq = 0

/** A browse pause with sensible defaults. Override anything. */
export function pauseEvent(overrides: Partial<PauseEvent> = {}): PauseEvent {
  seq += 1
  return {
    id: `e-${seq}`,
    at: '2026-10-10T09:00:00.000Z',
    date: '2026-10-10',
    intent: 'browse',
    triggerId: 'instagram',
    awarenessBefore: 5 as AwarenessScore,
    seeking: 'boredom' as Impulse,
    seekingNote: '',
    choice: 'close' as Choice,
    overLimit: false,
    elapsedSeconds: 12,
    dayNumber: null,
    phase: 'practice',
    ...overrides,
  }
}

export function session(overrides: Partial<Session> = {}): Session {
  seq += 1
  return {
    id: `s-${seq}`,
    pauseId: `e-${seq}`,
    triggerId: 'instagram',
    startedAt: '2026-10-10T09:00:00.000Z',
    date: '2026-10-10',
    plannedMinutes: 15,
    extendedMinutes: 0,
    awarenessAtStart: 3 as AwarenessScore,
    seeking: 'boredom',
    overLimit: false,
    ...overrides,
  }
}

export function dbWith(overrides: Partial<Database> = {}): Database {
  return { ...emptyDatabase(), ...overrides }
}

/** `n` browse pauses at the given score and choice. */
export function many(n: number, awareness: number, choice: Choice, extra: Partial<PauseEvent> = {}): PauseEvent[] {
  return Array.from({ length: n }, () =>
    pauseEvent({ awarenessBefore: awareness as AwarenessScore, choice, ...extra }),
  )
}
