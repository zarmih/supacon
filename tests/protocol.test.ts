import { describe, expect, it } from 'vitest'
import { addDays, diffDays, localDate } from '../src/domain/time'
import {
  checklist,
  dayNumber,
  experimentForWeek,
  intentionId,
  isOverLimit,
  limitActive,
  phaseFor,
  weekIndex,
} from '../src/domain/protocol'
import { emptyDatabase } from '../src/store/defaults'
import { completeOnboarding, saveContact, saveEvening, saveMorning, startFocus, endFocus } from '../src/store/mutate'

describe('calendar', () => {
  it('counts local dates and does not skip a day across a DST-sized gap', () => {
    const evening = new Date(2026, 9, 13, 23, 30, 0)
    expect(localDate(evening)).toBe('2026-10-13')
    expect(diffDays('2026-10-13', '2026-10-20')).toBe(7)
    expect(addDays('2026-10-13', 6)).toBe('2026-10-19')
  })
})

describe('protocol phase', () => {
  it('maps the seven days and the days after them', () => {
    expect(dayNumber('2026-10-01', '2026-10-01')).toBe(1)
    expect(dayNumber('2026-10-01', '2026-10-07')).toBe(7)
    expect(dayNumber('2026-10-01', '2026-10-08')).toBe(8)
    expect(dayNumber('2026-10-01', '2026-09-30')).toBe(1)
    expect(dayNumber(null, '2026-10-01')).toBeNull()

    expect(phaseFor(1, null)).toBe('calibration')
    expect(phaseFor(2, null)).toBe('calibration')
    expect(phaseFor(3, null)).toBe('boundary')
    expect(phaseFor(4, null)).toBe('boundary')
    expect(phaseFor(5, null)).toBe('contrast')
    expect(phaseFor(6, null)).toBe('contrast')
    expect(phaseFor(7, null)).toBe('diagnosis')
    expect(phaseFor(8, null)).toBe('practice')
    expect(phaseFor(1, 'free')).toBe('practice')
    expect(intentionId(4, 'boundary')).toBe('d4')
    expect(intentionId(12, 'practice')).toBe('practice')
  })

  it('keeps the session cap off during calibration and on from day 3', () => {
    expect(limitActive(1, null, 3)).toBe(false)
    expect(limitActive(3, null, 3)).toBe(true)
    expect(limitActive(3, null, 0)).toBe(false)
    expect(limitActive(1, 'maintenance', 3)).toBe(true)

    const now = new Date(2026, 9, 3, 12, 0, 0)
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date(2026, 9, 1, 8, 0, 0),
    })
    expect(isOverLimit(db, '2026-10-01')).toBe(false)
    db.sessions.push(
      {
        id: 'a',
        pauseId: 'p',
        triggerId: 'instagram',
        startedAt: now.toISOString(),
        date: '2026-10-03',
        plannedMinutes: 15,
        extendedMinutes: 0,
        awarenessAtStart: 4,
        seeking: 'habit',
        overLimit: false,
      },
      {
        id: 'b',
        pauseId: 'p2',
        triggerId: 'instagram',
        startedAt: now.toISOString(),
        date: '2026-10-03',
        plannedMinutes: 15,
        extendedMinutes: 0,
        awarenessAtStart: 4,
        seeking: 'habit',
        overLimit: false,
      },
      {
        id: 'c',
        pauseId: 'p3',
        triggerId: 'instagram',
        startedAt: now.toISOString(),
        date: '2026-10-03',
        plannedMinutes: 15,
        extendedMinutes: 0,
        awarenessAtStart: 4,
        seeking: 'habit',
        overLimit: false,
      },
    )
    expect(isOverLimit(db, '2026-10-03')).toBe(true)
    expect(isOverLimit(db, '2026-10-02')).toBe(false)
  })
})

describe('checklist and experiments', () => {
  it('tracks the day without turning pauses into a guilt checkbox', () => {
    const now = new Date(2026, 9, 5, 18, 0, 0)
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date(2026, 9, 1, 8, 0, 0),
    })
    expect(checklist(db, '2026-10-05').map((item) => item.id)).toEqual(['morning', 'focus', 'contact', 'evening'])
    db = saveMorning(db, { awareness: 6, firstDesire: 'Coffee', now })
    db = startFocus(db, now)
    const focus = db.focuses[0]
    expect(focus).toBeDefined()
    db = endFocus(db, focus!.id, true, new Date(2026, 9, 5, 18, 45, 0))
    db = saveContact(db, { date: '2026-10-05', realContact: false, note: '' })
    db = saveEvening(db, {
      date: '2026-10-05',
      at: now.toISOString(),
      lowestMoment: 'Evening',
      note: '',
      unloggedMisses: 0,
    })
    expect(checklist(db, '2026-10-05').every((item) => item.done)).toBe(true)
    expect(weekIndex(8)).toBe(1)
    expect(experimentForWeek(0)).toBeNull()
    expect(experimentForWeek(1)?.id).toBe('name-aloud')
    expect(experimentForWeek(6)?.id).toBe('name-aloud')
  })
})
