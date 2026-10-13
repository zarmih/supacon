import { describe, expect, it } from 'vitest'
import { exampleDatabase } from '../src/domain/example'
import { buildInsights, dayStats } from '../src/domain/insights'
import { letterLines, type LetterCopy } from '../src/domain/letter'
import { pickHint } from '../src/domain/hints'
import { addDays } from '../src/domain/time'
import type { Seeking } from '../src/domain/types'
import { emptyDatabase } from '../src/store/defaults'

const copy: LetterCopy = {
  paused: (n) => `paused ${n}`,
  threshold: (cut, below, above) => `cut ${cut} ${below} ${above}`,
  seekingLow: (label) => `low ${label}`,
  namingUp: (delta) => `up ${delta}`,
  namingDown: (delta) => `down ${delta}`,
  baselineUp: (early, late) => `base ${early} ${late}`,
  baselineDown: (early, late) => `base down ${early} ${late}`,
  hour: (label) => `hour ${label}`,
  posts: (paused, back) => `posts ${paused} ${back}`,
  highOpens: () => 'high opens',
}

describe('insights', () => {
  it('stays quiet when there is not enough to claim a pattern', () => {
    const report = buildInsights(emptyDatabase(), '2026-10-13')
    expect(report.threshold).toBeNull()
    expect(report.avgAwareness).toBeNull()
    expect(report.peakHour).toBeNull()
    expect(letterLines(report, copy, (key) => key, (hour) => String(hour))).toEqual([])
    expect(report.daily).toHaveLength(7)
  })

  it('reads the example week as a real shift, not a flat average', () => {
    const today = '2026-10-13'
    const db = exampleDatabase(today)
    const report = buildInsights(db, today)
    expect(report.pauses).toBe(28)
    expect(report.threshold).toMatchObject({ cut: 7, openBelow: 1, openAbove: 0 })
    expect(report.seekingLow?.key).toBe('validation')
    expect(report.peakHour?.hour).toBe(22)
    expect(report.naming?.delta).toBeGreaterThan(0)
    expect(report.baseline).toEqual({ early: 5, late: 7.5 })
    expect(report.posts).toEqual({ paused: 2, steppedBack: 1 })
    expect(report.highButOpens).toBe(false)
    const lines = letterLines(report, copy, (key: Seeking) => key, (hour) => `${hour}:00`)
    expect(lines[0]).toBe('paused 28')
    expect(lines.some((line) => line.startsWith('cut 7'))).toBe(true)
    expect(lines.length).toBeLessThanOrEqual(4)

    const day7 = addDays(db.startedOn!, 6)
    expect(dayStats(db, day7).pauses).toBe(4)
    expect(dayStats(db, addDays(db.startedOn!, 1)).misses).toBe(2)
  })
})

describe('hints', () => {
  it('names the over-limit before any pattern', () => {
    const db = exampleDatabase('2026-10-13')
    expect(
      pickHint(db, {
        intent: 'browse',
        awareness: 8,
        seeking: 'habit',
        triggerId: 'instagram',
        overLimit: true,
        hour: 22,
        now: Date.parse('2026-10-13T22:00:00'),
      }),
    ).toBe('over-limit')
  })

  it('notices when this seeking was postponed and did not return', () => {
    const db = exampleDatabase('2026-10-13')
    expect(
      pickHint(db, {
        intent: 'browse',
        awareness: 6,
        seeking: 'validation',
        triggerId: 'instagram',
        overLimit: false,
        hour: 15,
        now: Date.parse('2026-10-13T15:00:00'),
      }),
    ).toBe('urge-passed')
  })

  it('says nothing when the sample is thin', () => {
    expect(
      pickHint(emptyDatabase(), {
        intent: 'browse',
        awareness: 3,
        seeking: 'habit',
        triggerId: 'other',
        overLimit: false,
        hour: 9,
        now: Date.parse('2026-10-13T09:00:00'),
      }),
    ).toBeNull()
  })
})
