import { describe, expect, it } from 'vitest'
import {
  calibrationVsContrast,
  EXPERIMENTS,
  experimentForWeek,
  intentionId,
  isOverLimit,
  phaseFor,
  protocolPausesCount,
  weekIndex,
  dayNumber,
} from '../src/domain/protocol'
import { dominantCycle, isHm, knownCycle, triggerShift, unfinishedOpens, withinWindows } from '../src/domain/cycles'
import { pendingPostpones, focusEndsAt } from '../src/domain/clock'
import { advanceFromArrive, choose, createDraft, setScore, setSeeking } from '../src/domain/pause'
import { commitPause, completeOnboarding, restartProtocol, setPracticeMode } from '../src/store/mutate'
import { emptyDatabase } from '../src/store/defaults'
import type { Choice, Database } from '../src/domain/types'
import { dbWith, many, pauseEvent } from './helpers/factory'

function onboarded(startedOn: Date, path: 'protocol' | 'free' = 'protocol'): Database {
  return completeOnboarding(emptyDatabase(), {
    triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
    path,
    now: startedOn,
  })
}

function commit(db: Database, at: Date, id: string, choice: Choice = 'close') {
  let d = createDraft({ id, intent: 'browse', triggerId: 'instagram', now: at.getTime() - 20_000, minSeconds: 10, completedPauses: 9 })
  d = advanceFromArrive(d)
  d = setSeeking(setScore(d, 5), 'boredom')
  const chosen = choose(d, choice, at.getTime())!
  return commitPause(db, chosen, at)!
}

describe('cycle of weeks after day 7', () => {
  it('week 0 is the protocol; weeks start counting on day 8', () => {
    expect(weekIndex(null)).toBe(0)
    expect(weekIndex(0)).toBe(0)
    expect(weekIndex(-3)).toBe(0)
    expect(weekIndex(7)).toBe(0)
    expect(weekIndex(8)).toBe(1)
    expect(weekIndex(14)).toBe(1)
    expect(weekIndex(15)).toBe(2)
  })

  it('rotates through the five experiments and wraps around', () => {
    expect(experimentForWeek(0)).toBeNull()
    expect(experimentForWeek(-1)).toBeNull()
    const ids = Array.from({ length: 11 }, (_, i) => experimentForWeek(i + 1)?.id)
    expect(ids.slice(0, 5)).toEqual(EXPERIMENTS.map((e) => e.id))
    expect(ids[5]).toBe(EXPERIMENTS[0]!.id)
    expect(ids[10]).toBe(EXPERIMENTS[0]!.id)
  })

  it('day 8+ without a chosen mode is practice phase with the practice intention and a live cap', () => {
    for (const day of [8, 9, 14, 15, 100]) {
      expect(phaseFor(day, null)).toBe('practice')
      expect(intentionId(day, phaseFor(day, null))).toBe('practice')
    }
  })

  it('commits a day-8 pause as practice and keeps counting days without a reset', () => {
    let db = onboarded(new Date(2026, 9, 1, 9))
    db = commit(db, new Date(2026, 9, 8, 12), 'p8').db
    db = commit(db, new Date(2026, 9, 21, 12), 'p21').db
    expect(db.events.map((e) => [e.dayNumber, e.phase])).toEqual([
      [8, 'practice'],
      [21, 'practice'],
    ])
  })

  it('a mode chosen during the protocol turns the remaining days into practice', () => {
    let db = setPracticeMode(onboarded(new Date(2026, 9, 1, 9)), 'deepening')
    db = commit(db, new Date(2026, 9, 3, 12), 'p3').db
    expect(db.events[0]).toMatchObject({ dayNumber: 3, phase: 'practice' })
  })

  it('switching to free removes the cap; leaving free restores a cap of 3', () => {
    let db = onboarded(new Date(2026, 9, 1, 9))
    db = setPracticeMode(db, 'free')
    expect(db.settings.maxSessionsPerDay).toBe(0)
    expect(isOverLimit(db, '2026-10-09')).toBe(false)
    db = setPracticeMode(db, 'maintenance')
    expect(db.settings.maxSessionsPerDay).toBe(3)
    const freeStart = onboarded(new Date(2026, 9, 1, 9), 'free')
    expect(freeStart.practiceMode).toBe('free')
    expect(freeStart.settings.maxSessionsPerDay).toBe(0)
  })

  it('restarting after day 7 begins a new day 1, keeps history, and restores the cap', () => {
    let db = setPracticeMode(onboarded(new Date(2026, 9, 1, 9)), 'free')
    db = commit(db, new Date(2026, 9, 10, 12), 'old').db
    db = restartProtocol(db, new Date(2026, 9, 20, 7))
    expect(db.startedOn).toBe('2026-10-20')
    expect(db.practiceMode).toBeNull()
    expect(db.settings.maxSessionsPerDay).toBe(3)
    expect(db.events).toHaveLength(1)
    expect(dayNumber(db.startedOn, '2026-10-20')).toBe(1)
    expect(phaseFor(1, db.practiceMode)).toBe('calibration')
  })

  it('protocol pause count keeps days 1–7 only, browse only, preferring the stored day number', () => {
    const db = dbWith({
      startedOn: '2026-10-01',
      events: [
        pauseEvent({ date: '2026-10-01', dayNumber: 1 }),
        pauseEvent({ date: '2026-10-07', dayNumber: 7 }),
        pauseEvent({ date: '2026-10-08', dayNumber: 8 }),
        pauseEvent({ date: '2026-10-03', dayNumber: null }), // derived → day 3
        pauseEvent({ date: '2026-10-20', dayNumber: 2 }), // stored day wins over date
        pauseEvent({ date: '2026-10-02', intent: 'post', choice: 'post', seeking: 'seen' }),
      ],
    })
    expect(protocolPausesCount(db)).toBe(4)
  })

  it('calibration vs contrast needs both sides and ignores day 7+', () => {
    const cal = many(2, 3, 'open', { dayNumber: 1 })
    const con = [...many(1, 7, 'open', { dayNumber: 5 }), ...many(3, 7, 'close', { dayNumber: 6 })]
    expect(calibrationVsContrast(dbWith({ events: cal }))).toBeNull()
    expect(calibrationVsContrast(dbWith({ events: [...cal, ...many(3, 9, 'close', { dayNumber: 8 })] }))).toBeNull()
    expect(calibrationVsContrast(dbWith({ events: [...cal, ...con] }))).toEqual({
      calibration: { pauses: 2, avgAwareness: 3, openRate: 100 },
      contrast: { pauses: 4, avgAwareness: 7, openRate: 25 },
    })
  })
})

describe('cycles: further edges', () => {
  it('ties at the top of the dominant cycle break alphabetically in ranking but still refuse', () => {
    expect(dominantCycle([...Array(5).fill('relief'), ...Array(6).fill('boredom')])).toEqual({ key: 'novelty', n: 6 })
    expect(dominantCycle([...Array(5).fill('habit'), ...Array(4).fill('loss')])).toBeNull()
    expect(dominantCycle([])).toBeNull()
  })

  it('unfinishedOpens needs four opens and half of them bare', () => {
    expect(unfinishedOpens(['a', 'b', '', 'c'])).toBeNull()
    expect(unfinishedOpens(['a', 'b', '', ' '])).toEqual({ opens: 4, bare: 2 })
  })

  it('triggerShift needs eight events and a mode of three on each side', () => {
    const at = (i: number) => `2026-10-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`
    const seven = Array.from({ length: 7 }, (_, i) => ({ at: at(i), triggerId: i < 4 ? 'a' : 'b' }))
    expect(triggerShift(seven)).toBeNull()
    const thinMode = ['a', 'a', 'x', 'y', 'b', 'b', 'z', 'w'].map((triggerId, i) => ({ at: at(i), triggerId }))
    expect(triggerShift(thinMode)).toBeNull()
    // input order does not matter, only timestamps
    const shuffled = ['a', 'a', 'a', 'c', 'b', 'b', 'b', 'c'].map((triggerId, i) => ({ at: at(i), triggerId })).reverse()
    expect(triggerShift(shuffled)).toEqual({ from: 'a', to: 'b' })
  })

  it('validates HH:MM strictly and ignores invalid windows', () => {
    expect(isHm('00:00')).toBe(true)
    expect(isHm('23:59')).toBe(true)
    expect(isHm('24:00')).toBe(false)
    expect(isHm('12:60')).toBe(false)
    expect(isHm('9:00')).toBe(false)
    expect(isHm(900)).toBe(false)
    expect(isHm(null)).toBe(false)
    expect(withinWindows(['25:00', 'nope'], 45, new Date(2026, 9, 1, 12))).toBeNull()
    expect(knownCycle('approval')).toBe(true)
    expect(knownCycle('sex')).toBe(false)
  })
})

describe('pending postpones', () => {
  const now = Date.parse('2026-10-10T12:00:00.000Z')
  const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString()

  it('keeps the latest postpone per trigger, marks waiting ones, and sorts by deadline', () => {
    const db = dbWith({
      postpones: [
        { id: 'a1', pauseId: 'x', triggerId: 'a', at: iso(-40), until: iso(-10) },
        { id: 'a2', pauseId: 'x', triggerId: 'a', at: iso(-20), until: iso(10) },
        { id: 'b1', pauseId: 'x', triggerId: 'b', at: iso(-30), until: iso(5) },
      ],
    })
    expect(pendingPostpones(db, now)).toEqual([
      { id: 'b1', triggerId: 'b', until: now + 5 * 60_000, waiting: true },
      { id: 'a2', triggerId: 'a', until: now + 10 * 60_000, waiting: true },
    ])
  })

  it('drops postpones older than six hours and those followed by another pause on the trigger', () => {
    const db = dbWith({
      postpones: [
        { id: 'old', pauseId: 'x', triggerId: 'a', at: iso(-500), until: iso(-370) },
        { id: 'followed', pauseId: 'x', triggerId: 'b', at: iso(-60), until: iso(-30) },
        { id: 'due', pauseId: 'x', triggerId: 'c', at: iso(-60), until: iso(-30) },
      ],
      events: [pauseEvent({ triggerId: 'b', at: iso(-10) }), pauseEvent({ triggerId: 'c', at: iso(-90) })],
    })
    expect(pendingPostpones(db, now)).toEqual([{ id: 'due', triggerId: 'c', until: now - 30 * 60_000, waiting: false }])
  })

  it('a later-registered but earlier-ending postpone does not replace a longer one', () => {
    const db = dbWith({
      postpones: [
        { id: 'long', pauseId: 'x', triggerId: 'a', at: iso(-20), until: iso(40) },
        { id: 'short', pauseId: 'x', triggerId: 'a', at: iso(-10), until: iso(5) },
      ],
    })
    expect(pendingPostpones(db, now).map((p) => p.id)).toEqual(['long'])
  })

  it('a focus block ends after its planned minutes', () => {
    expect(
      focusEndsAt({ id: 'f', date: '2026-10-10', startedAt: iso(0), plannedMinutes: 45, completed: false }),
    ).toBe(now + 45 * 60_000)
  })
})
