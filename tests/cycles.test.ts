import { describe, expect, it } from 'vitest'
import {
  cycleOf,
  dominantCycle,
  trainedLoop,
  triggerShift,
  unfinishedOpens,
  windowDue,
  withinNight,
  withinWindows,
} from '../src/domain/cycles'
import { emptyDatabase } from '../src/store/defaults'
import { pickHint } from '../src/domain/hints'

describe('cycles', () => {
  it('maps a named impulse to a function and leaves habit unclassified', () => {
    expect(cycleOf('validation')).toBe('approval')
    expect(cycleOf('seen')).toBe('approval')
    expect(cycleOf('connection')).toBe('belonging')
    expect(cycleOf('status')).toBe('status')
    expect(cycleOf('boredom')).toBe('novelty')
    expect(cycleOf('relief')).toBe('avoidance')
    expect(cycleOf('anxiety')).toBe('avoidance')
    expect(cycleOf('loss')).toBe('loss')
    expect(cycleOf('habit')).toBeNull()
    expect(cycleOf('other')).toBeNull()
  })

  it('refuses a tie and a thin sample for the dominant cycle', () => {
    expect(dominantCycle(['validation', 'validation', 'validation', 'validation'])).toBeNull()
    expect(dominantCycle(['validation', 'validation', 'validation', 'validation', 'validation', 'boredom', 'boredom', 'boredom', 'boredom', 'boredom'])).toBeNull()
    expect(dominantCycle(['status', 'status', 'status', 'status', 'status', 'boredom'])).toEqual({ key: 'status', n: 5 })
  })

  it('names a trained loop only when half the answered opens did not deliver', () => {
    expect(trainedLoop(['no', 'no', 'no'])).toBeNull()
    expect(trainedLoop(['yes', 'yes', 'yes', 'no'])).toBeNull()
    expect(trainedLoop(['no', 'partly', 'no', 'yes'])).toEqual({ answered: 4, unliked: 3 })
  })

  it('counts an open without a finish line as unfinished', () => {
    expect(unfinishedOpens(['a', 'b', 'c'])).toBeNull()
    expect(unfinishedOpens(['one', '', undefined, '  '])).toEqual({ opens: 4, bare: 3 })
  })

  it('treats windows and nights as ranges, including across midnight', () => {
    const noon = new Date(2026, 9, 13, 12, 0, 0)
    expect(withinWindows([], 45, noon)).toBeNull()
    expect(withinWindows(['12:30'], 45, noon)).toBe(true)
    expect(withinWindows(['18:00'], 45, noon)).toBe(false)
    expect(withinWindows(['00:10'], 30, new Date(2026, 9, 13, 23, 50, 0))).toBe(true)
    expect(withinNight(null, null, noon)).toBe(false)
    expect(withinNight('23:00', '07:00', new Date(2026, 9, 13, 23, 30, 0))).toBe(true)
    expect(withinNight('23:00', '07:00', noon)).toBe(false)
    expect(withinNight('22:00', '22:00', noon)).toBe(false)
  })

  it('notices when the pull changes triggers', () => {
    const early = Array.from({ length: 4 }, (_, index) => ({ at: `2026-10-01T0${index}:00:00.000Z`, triggerId: 'instagram' }))
    const late = Array.from({ length: 4 }, (_, index) => ({ at: `2026-10-02T0${index}:00:00.000Z`, triggerId: 'news' }))
    expect(triggerShift([...early, ...late])).toEqual({ from: 'instagram', to: 'news' })
    expect(triggerShift([...early, ...early])).toBeNull()
  })

  it('keeps a postponement hint when the loop is not trained', () => {
    const db = emptyDatabase()
    for (let index = 0; index < 3; index += 1) {
      const at = new Date(2026, 9, 10, 12, index).toISOString()
      db.events.push({
        id: `p${index}`,
        at,
        date: '2026-10-10',
        intent: 'browse',
        triggerId: 'news',
        awarenessBefore: 6,
        seeking: 'information',
        seekingNote: '',
        choice: 'postpone',
        overLimit: false,
        elapsedSeconds: 10,
        dayNumber: 1,
        phase: 'calibration',
      })
      db.postpones.push({
        id: `pp${index}`,
        pauseId: `p${index}`,
        triggerId: 'news',
        at,
        until: new Date(2026, 9, 10, 13, index).toISOString(),
      })
    }
    expect(
      pickHint(db, {
        intent: 'browse',
        awareness: 6,
        seeking: 'information',
        triggerId: 'news',
        overLimit: false,
        hour: 15,
        now: Date.parse('2026-10-13T15:00:00'),
      }),
    ).toBe('urge-passed')
  })

  it('names a window only during its own minute', () => {
    const windows = ['09:00', '14:30']
    expect(windowDue(windows, new Date(2026, 9, 13, 14, 30, 40))).toBe('14:30')
    expect(windowDue(windows, new Date(2026, 9, 13, 14, 31, 0))).toBeNull()
    expect(windowDue(windows, new Date(2026, 9, 13, 9, 0, 1))).toBe('09:00')
    expect(windowDue([], new Date(2026, 9, 13, 9, 0))).toBeNull()
  })
})
