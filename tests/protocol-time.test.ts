import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { withTZ, ZONES } from './helpers/tz'
import { dbWith, pauseEvent } from './helpers/factory'
import {
  addDays,
  diffDays,
  formatClock,
  formatHour,
  isIsoDate,
  localDate,
  parseDate,
} from '../src/domain/time'
import {
  bandOf,
  checklist,
  contrastFocusSuggestion,
  dayNumber,
  diagnosisDate,
  intentionId,
  isOverLimit,
  isProtocolCompleted,
  limitActive,
  loudestHour,
  phaseFor,
} from '../src/domain/protocol'
import { localDateTime, sessionEndsAt } from '../src/domain/clock'
import { withinNight } from '../src/domain/cycles'
import type { Phase } from '../src/domain/types'
import { session } from './helpers/factory'

const HOUR = 3_600_000

/** Expected phase per protocol day, 1-based. Day 8+ is open-ended practice. */
const PHASES: Record<number, Phase> = {
  1: 'calibration',
  2: 'calibration',
  3: 'boundary',
  4: 'boundary',
  5: 'contrast',
  6: 'contrast',
  7: 'diagnosis',
  8: 'practice',
}

describe('time helpers', () => {
  it('parses only well-formed dates and rejects garbage with NaN', () => {
    expect(Number.isNaN(parseDate('').getTime())).toBe(true)
    expect(Number.isNaN(parseDate('2026-10').getTime())).toBe(true)
    expect(Number.isNaN(parseDate('abc-de-fg').getTime())).toBe(true)
    expect(parseDate('2026-10-22').toISOString()).toBe('2026-10-22T00:00:00.000Z')
  })

  it('adds days across month, year and leap boundaries', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2026-10-22', 0)).toBe('2026-10-22')
  })

  it('addDays and diffDays are inverse for any date and offset (property)', () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date('1990-01-01T00:00:00Z'), max: new Date('2090-12-31T00:00:00Z'), noInvalidDate: true }),
        fc.integer({ min: -2000, max: 2000 }),
        (date, offset) => {
          const iso = date.toISOString().slice(0, 10)
          expect(diffDays(iso, addDays(iso, offset))).toBe(offset)
        },
      ),
    )
  })

  it('formats hours modulo 24, including negatives', () => {
    expect(formatHour(0)).toBe('00:00')
    expect(formatHour(23)).toBe('23:00')
    expect(formatHour(24)).toBe('00:00')
    expect(formatHour(-1)).toBe('23:00')
    expect(formatHour(49)).toBe('01:00')
  })

  it('formats a countdown, rounding up partial seconds and never going negative', () => {
    expect(formatClock(0)).toBe('0:00')
    expect(formatClock(-5000)).toBe('0:00')
    expect(formatClock(1)).toBe('0:01')
    expect(formatClock(59_001)).toBe('1:00')
    expect(formatClock(15 * 60_000)).toBe('15:00')
  })

  it('recognises an ISO calendar date shape', () => {
    expect(isIsoDate('2026-10-22')).toBe(true)
    expect(isIsoDate('2026-1-2')).toBe(false)
    expect(isIsoDate('22.10.2026')).toBe(false)
    expect(isIsoDate('0000-00-00')).toBe(false)
  })

  // BUG (minor, helper is currently unused): parseDate() lets Date.UTC roll an impossible
  // day over into the next month, so isIsoDate('2026-02-30') is true. If isIsoDate is ever
  // used to validate imports this would accept non-existent dates.
  it('rejects impossible calendar dates such as February 30', () => {
    expect(isIsoDate('2026-02-30')).toBe(false)
    expect(isIsoDate('2026-13-01')).toBe(false)
    expect(isIsoDate('2026-00-10')).toBe(false)
    expect(isIsoDate('2026-04-31')).toBe(false)
    expect(isIsoDate('2026-10-00')).toBe(false)
    expect(isIsoDate('2026-02-29')).toBe(false)
    expect(isIsoDate('2028-02-29')).toBe(true) // leap year
    expect(isIsoDate('2100-02-29')).toBe(false) // century, not a leap year
    expect(isIsoDate('2000-02-29')).toBe(true)
    expect(isIsoDate('2026-12-31')).toBe(true)
  })

  it('accepts every real day of a year and nothing past month end (property)', () => {
    let day = '2028-01-01'
    for (let i = 0; i < 366; i += 1) {
      expect(isIsoDate(day)).toBe(true)
      day = addDays(day, 1)
    }
    expect(day).toBe('2029-01-01')
  })
})

describe('protocol day and phase boundaries', () => {
  it('maps every day number to its phase, and any practice mode overrides the protocol', () => {
    for (let day = 1; day <= 8; day += 1) expect(phaseFor(day, null)).toBe(PHASES[day])
    expect(phaseFor(30, null)).toBe('practice')
    expect(phaseFor(null, null)).toBe('practice')
    expect(phaseFor(0, null)).toBe('calibration')
    for (const mode of ['maintenance', 'deepening', 'free'] as const) {
      expect(phaseFor(1, mode)).toBe('practice')
      expect(phaseFor(7, mode)).toBe('practice')
    }
  })

  it('numbers days from startedOn, clamps a clock set backwards to day 1, and refuses garbage', () => {
    expect(dayNumber(null, '2026-10-22')).toBeNull()
    expect(dayNumber('2026-10-22', '2026-10-22')).toBe(1)
    expect(dayNumber('2026-10-22', '2026-10-28')).toBe(7)
    expect(dayNumber('2026-10-22', '2026-10-29')).toBe(8)
    expect(dayNumber('2026-10-22', '2026-10-01')).toBe(1)
    expect(dayNumber('not-a-date', '2026-10-22')).toBeNull()
    expect(dayNumber('2026-10-22', 'garbage')).toBeNull()
  })

  it('picks the intention of each protocol day and the practice one afterwards', () => {
    const expected = ['d1', 'd2', 'd3', 'd4', 'd5', 'd6', 'd7']
    for (let day = 1; day <= 7; day += 1) expect(intentionId(day, phaseFor(day, null))).toBe(expected[day - 1])
    expect(intentionId(8, phaseFor(8, null))).toBe('practice')
    expect(intentionId(null, 'calibration')).toBe('d1')
    expect(intentionId(3, 'practice')).toBe('practice')
  })

  it('switches the session cap on at day 3 and treats 0 as unlimited', () => {
    expect(limitActive(1, null, 3)).toBe(false)
    expect(limitActive(2, null, 3)).toBe(false)
    expect(limitActive(3, null, 3)).toBe(true)
    expect(limitActive(1, 'maintenance', 3)).toBe(true)
    expect(limitActive(null, null, 3)).toBe(true)
    expect(limitActive(5, null, 0)).toBe(false)
    expect(limitActive(5, 'deepening', -1)).toBe(false)
  })

  it('counts the cap per local date', () => {
    const db = dbWith({
      startedOn: '2026-10-01',
      sessions: [session({ date: '2026-10-05' }), session({ date: '2026-10-05' }), session({ date: '2026-10-04' })],
    })
    db.settings.maxSessionsPerDay = 2
    expect(isOverLimit(db, '2026-10-05')).toBe(true)
    expect(isOverLimit(db, '2026-10-04')).toBe(false)
    expect(isOverLimit(db, '2026-10-02')).toBe(false)
  })

  it('places the diagnosis on day 7 and splits awareness into bands at 3/6/8', () => {
    expect(diagnosisDate(null)).toBeNull()
    expect(diagnosisDate('2026-10-26')).toBe('2026-11-01')
    expect([1, 3, 4, 6, 7, 8, 9, 10].map(bandOf)).toEqual([
      'autopilot',
      'autopilot',
      'partial',
      'partial',
      'clear',
      'clear',
      'spacious',
      'spacious',
    ])
  })
})

describe.each(ZONES)('local midnight in %s', (zone) => {
  it('rolls the local date exactly at 00:00 local, not at UTC midnight', () => {
    withTZ(zone, () => {
      const lastMs = new Date(2026, 9, 21, 23, 59, 59, 999)
      const firstMs = new Date(lastMs.getTime() + 1)
      expect(localDate(lastMs)).toBe('2026-10-21')
      expect(localDate(firstMs)).toBe('2026-10-22')
      const startedOn = '2026-10-16'
      expect(dayNumber(startedOn, localDate(lastMs))).toBe(6)
      expect(dayNumber(startedOn, localDate(firstMs))).toBe(7)
      expect(phaseFor(6, null)).toBe('contrast')
      expect(phaseFor(7, null)).toBe('diagnosis')
    })
  })

  it('localDateTime builds wall-clock time in the zone', () => {
    withTZ(zone, () => {
      const at = localDateTime('2026-10-22', 23, 59)
      expect(at.getHours()).toBe(23)
      expect(at.getMinutes()).toBe(59)
      expect(localDate(at)).toBe('2026-10-22')
    })
  })
})

/**
 * Walks hour by hour across a span that contains a DST change and checks that the
 * protocol day increments exactly once per local calendar date.
 */
function walkProtocol(zone: string, startLocal: [number, number, number], hours: number) {
  return withTZ(zone, () => {
    const start = new Date(startLocal[0], startLocal[1], startLocal[2], 0, 30)
    const startedOn = localDate(start)
    const seen = new Map<number, string>()
    let previous = 1
    for (let h = 0; h < hours; h += 1) {
      const t = new Date(start.getTime() + h * HOUR)
      const today = localDate(t)
      const day = dayNumber(startedOn, today)!
      expect(day === previous || day === previous + 1).toBe(true)
      previous = day
      const known = seen.get(day)
      if (known) expect(known).toBe(today)
      else seen.set(day, today)
    }
    return seen
  })
}

describe('protocol across DST transitions', () => {
  it('Los Angeles spring-forward (2026-03-08, 23h day) still counts as exactly one protocol day', () => {
    const days = walkProtocol('America/Los_Angeles', [2026, 2, 5], 24 * 8 - 2)
    expect(days.get(4)).toBe('2026-03-08')
    expect(days.get(5)).toBe('2026-03-09')
    expect([...days.keys()]).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('Los Angeles fall-back (2026-11-01, 25h day) does not double-count a day', () => {
    const days = walkProtocol('America/Los_Angeles', [2026, 9, 26], 24 * 8)
    expect(days.get(7)).toBe('2026-11-01')
    expect(days.get(8)).toBe('2026-11-02')
  })

  it('Moscow historical DST (2010-03-28 and 2010-10-31) keeps one day per date', () => {
    const spring = walkProtocol('Europe/Moscow', [2010, 2, 25], 24 * 7)
    expect(spring.get(4)).toBe('2010-03-28')
    const fall = walkProtocol('Europe/Moscow', [2010, 9, 29], 24 * 7)
    expect(fall.get(3)).toBe('2010-10-31')
    expect(fall.get(4)).toBe('2010-11-01')
  })

  it('Moscow 2014-10-26 offset change (+4 → +3, 25h day) keeps one day per date', () => {
    const days = walkProtocol('Europe/Moscow', [2014, 9, 24], 24 * 5)
    expect(days.get(3)).toBe('2014-10-26')
    expect(days.get(4)).toBe('2014-10-27')
  })

  it('a non-existent local time (02:30 on spring-forward) is pushed forward, not to another date', () => {
    withTZ('America/Los_Angeles', () => {
      const at = localDateTime('2026-03-08', 2, 30)
      expect(localDate(at)).toBe('2026-03-08')
      expect(at.getHours()).toBe(3)
    })
  })

  it('an ambiguous local time (01:30 on fall-back) stays on its date', () => {
    withTZ('America/Los_Angeles', () => {
      const at = localDateTime('2026-11-01', 1, 30)
      expect(localDate(at)).toBe('2026-11-01')
      expect(at.getHours()).toBe(1)
    })
  })

  it('a session ends after its planned minutes of real time even when the wall clock jumps', () => {
    withTZ('America/Los_Angeles', () => {
      // 01:50 PDT on fall-back night; 15 minutes later it is 01:05 PST.
      const startedAt = new Date('2026-11-01T08:50:00.000Z')
      expect(startedAt.getHours()).toBe(1)
      const ends = sessionEndsAt(session({ startedAt: startedAt.toISOString(), plannedMinutes: 15 }))
      expect(ends - startedAt.getTime()).toBe(15 * 60_000)
      expect(new Date(ends).getHours()).toBe(1)
      expect(new Date(ends).getMinutes()).toBe(5)
    })
  })

  it('loudestHour buckets by local hour; the repeated 01:00 hour on fall-back lands in one bucket', () => {
    withTZ('America/Los_Angeles', () => {
      const instants = [
        '2026-11-01T08:10:00.000Z', // 01:10 PDT
        '2026-11-01T08:40:00.000Z', // 01:40 PDT
        '2026-11-01T09:10:00.000Z', // 01:10 PST
        '2026-11-01T09:40:00.000Z', // 01:40 PST
      ]
      const events = instants.map((at) => pauseEvent({ at, date: '2026-11-01' }))
      expect(loudestHour(events)).toEqual({ hour: 1, n: 4 })
    })
  })

  it('night range crossing midnight follows local time in Moscow', () => {
    withTZ('Europe/Moscow', () => {
      // 21:30Z = 00:30 MSK
      expect(withinNight('23:00', '06:00', new Date('2026-10-21T21:30:00.000Z'))).toBe(true)
      // 19:30Z = 22:30 MSK
      expect(withinNight('23:00', '06:00', new Date('2026-10-21T19:30:00.000Z'))).toBe(false)
      // 03:00Z = 06:00 MSK: end is exclusive
      expect(withinNight('23:00', '06:00', new Date('2026-10-22T03:00:00.000Z'))).toBe(false)
    })
  })
})

describe('contrast focus suggestion uses the local date', () => {
  const loudEvents = (date: string, hourUtc: string) =>
    Array.from({ length: 4 }, (_, i) =>
      pauseEvent({ at: `${date}T${hourUtc}:${String(10 + i).padStart(2, '0')}:00.000Z`, date }),
    )

  it('at 00:30 MSK on day 5 the phase is already contrast even though UTC is still day 4', () => {
    withTZ('Europe/Moscow', () => {
      // startedOn 10-17 → day 5 is 10-21 local. 2026-10-20T21:30Z is 00:30 MSK on 10-21.
      const db = dbWith({ startedOn: '2026-10-17', events: loudEvents('2026-10-19', '19') })
      const now = new Date('2026-10-20T21:30:00.000Z').getTime()
      const suggestion = contrastFocusSuggestion(db, now)
      expect(suggestion).toEqual({ suggestedHour: 22, isSuggestedNow: false })
      const atLoud = new Date('2026-10-20T19:05:00.000Z').getTime() // 22:05 MSK, still day 4
      expect(contrastFocusSuggestion(db, atLoud)).toBeNull()
    })
  })

  it('is silent outside contrast and when the loudest hour is thin', () => {
    withTZ('America/Los_Angeles', () => {
      const db = dbWith({ startedOn: '2026-10-17', events: loudEvents('2026-10-18', '17').slice(0, 3) })
      expect(contrastFocusSuggestion(db, new Date(2026, 9, 21, 12).getTime())).toBeNull()
      const full = dbWith({ startedOn: '2026-10-17', events: loudEvents('2026-10-18', '17') })
      const noon = new Date(2026, 9, 21, 10, 0).getTime() // 10:xx PDT = 17:xx UTC
      expect(contrastFocusSuggestion(full, noon)).toEqual({ suggestedHour: 10, isSuggestedNow: true })
      expect(contrastFocusSuggestion(full, new Date(2026, 9, 23, 10).getTime())).toBeNull()
    })
  })
})

describe('checklist and completion around day 7', () => {
  it('adds the contact item on days 5–6 only and the diagnosis item on day 7 only', () => {
    const db = dbWith({ startedOn: '2026-10-01' })
    const ids = (date: string) => checklist(db, date).map((item) => item.id)
    expect(ids('2026-10-04')).toEqual(['morning', 'focus', 'evening'])
    expect(ids('2026-10-05')).toEqual(['morning', 'focus', 'contact', 'evening'])
    expect(ids('2026-10-06')).toEqual(['morning', 'focus', 'contact', 'evening'])
    expect(ids('2026-10-07')).toEqual(['morning', 'focus', 'evening', 'diagnosis'])
    expect(ids('2026-10-08')).toEqual(['morning', 'focus', 'evening'])
  })

  it('marks contact done only after an explicit yes/no, and diagnosis only with text', () => {
    const db = dbWith({
      startedOn: '2026-10-01',
      dayMarks: [{ date: '2026-10-05', realContact: null, contactNote: '' }, { date: '2026-10-06', realContact: false, contactNote: '' }],
      evenings: [{ date: '2026-10-07', at: '', lowestMoment: '', note: '', unloggedMisses: 0, whereItBroke: '   ' }],
      mornings: [{ date: '2026-10-05', at: '', awareness: 5, firstDesire: '  ' }],
    })
    expect(checklist(db, '2026-10-05').find((i) => i.id === 'contact')?.done).toBe(false)
    expect(checklist(db, '2026-10-05').find((i) => i.id === 'morning')?.done).toBe(false)
    expect(checklist(db, '2026-10-06').find((i) => i.id === 'contact')?.done).toBe(true)
    expect(checklist(db, '2026-10-07').find((i) => i.id === 'diagnosis')?.done).toBe(false)
    expect(checklist(db, '2026-10-07').find((i) => i.id === 'evening')?.done).toBe(true)
  })

  it('completes on day 7 only with a diagnosis, always on day 8+, never once a mode is chosen', () => {
    const base = dbWith({ startedOn: '2026-10-01' })
    expect(isProtocolCompleted(dbWith(), '2026-10-07')).toBe(false)
    expect(isProtocolCompleted(base, '2026-10-06')).toBe(false)
    expect(isProtocolCompleted(base, '2026-10-07')).toBe(false)
    const diagnosed = dbWith({
      startedOn: '2026-10-01',
      evenings: [{ date: '2026-10-07', at: '', lowestMoment: '', note: '', unloggedMisses: 0, whereItBroke: 'at 23:00' }],
    })
    expect(isProtocolCompleted(diagnosed, '2026-10-07')).toBe(true)
    expect(isProtocolCompleted(base, '2026-10-08')).toBe(true)
    expect(isProtocolCompleted(base, '2027-01-01')).toBe(true)
    expect(isProtocolCompleted({ ...base, practiceMode: 'maintenance' }, '2026-10-08')).toBe(false)
  })
})
