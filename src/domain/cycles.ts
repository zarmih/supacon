import type { Cycle, Impulse } from './types'
import { CYCLES } from './types'

/**
 * A cycle is the function a pause is serving.
 * Sex is not an input. Habit, "something else", and an unnamed post stay unclassified.
 */
const CYCLE_OF: Partial<Record<Impulse, Cycle>> = {
  validation: 'approval',
  seen: 'approval',
  connection: 'belonging',
  status: 'status',
  boredom: 'novelty',
  stimulation: 'novelty',
  information: 'novelty',
  relief: 'avoidance',
  anxiety: 'avoidance',
  loss: 'loss',
}

export function cycleOf(impulse: string): Cycle | null {
  return CYCLE_OF[impulse as Impulse] ?? null
}

export function isHm(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const match = /^(\d{2}):(\d{2})$/.exec(value)
  if (!match) return false
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour <= 23 && minute <= 59
}

function minutesOf(value: string): number | null {
  if (!isHm(value)) return null
  const [hour, minute] = value.split(':')
  return Number(hour) * 60 + Number(minute)
}

function nowMinutes(now: Date): number {
  return now.getHours() * 60 + now.getMinutes()
}

/** Null when no windows are set. True when `now` sits within `radius` minutes of one, across midnight. */
export function withinWindows(windows: readonly string[], radius: number, now: Date): boolean | null {
  const points = windows.flatMap((value) => {
    const minutes = minutesOf(value)
    return minutes === null ? [] : [minutes]
  })
  if (points.length === 0) return null
  const current = nowMinutes(now)
  return points.some((point) => {
    const diff = Math.abs(current - point)
    return Math.min(diff, 1440 - diff) <= radius
  })
}

/** A night range may cross midnight. Missing or equal ends mean the night is off. */
export function withinNight(start: string | null, end: string | null, now: Date): boolean {
  if (!start || !end) return false
  const from = minutesOf(start)
  const to = minutesOf(end)
  if (from === null || to === null || from === to) return false
  const current = nowMinutes(now)
  if (from < to) return current >= from && current < to
  return current >= from || current < to
}

export function dominantCycle(impulses: readonly string[]): { key: Cycle; n: number } | null {
  const counts = new Map<Cycle, number>()
  for (const impulse of impulses) {
    const cycle = cycleOf(impulse)
    if (!cycle) continue
    counts.set(cycle, (counts.get(cycle) ?? 0) + 1)
  }
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
  const first = ranked[0]
  const second = ranked[1]
  if (!first || first[1] < 5) return null
  if (second && second[1] >= first[1]) return null
  return { key: first[0], n: first[1] }
}

/**
 * Wanting without liking: opens that were answered, and at least half did not deliver.
 * "Partly" counts as not delivered. Pleasure and pull are different measurements.
 */
export function trainedLoop(
  found: readonly ('yes' | 'partly' | 'no' | undefined)[],
): { answered: number; unliked: number } | null {
  const answered = found.filter((value) => value === 'yes' || value === 'partly' || value === 'no')
  if (answered.length < 4) return null
  const unliked = answered.filter((value) => value !== 'yes').length
  if (unliked / answered.length < 0.5) return null
  return { answered: answered.length, unliked }
}

/** An open with no finish line is unfinished. The feed does not supply an ending. */
export function unfinishedOpens(finishes: readonly (string | undefined)[]): { opens: number; bare: number } | null {
  if (finishes.length < 4) return null
  const bare = finishes.filter((finish) => !finish?.trim()).length
  if (bare / finishes.length < 0.5) return null
  return { opens: finishes.length, bare }
}

/** The pull changed apps. Each half needs a mode of at least 3. */
export function triggerShift(
  events: readonly { at: string; triggerId: string }[],
): { from: string; to: string } | null {
  if (events.length < 8) return null
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at))
  const mid = Math.floor(sorted.length / 2)
  const early = modeTrigger(sorted.slice(0, mid))
  const late = modeTrigger(sorted.slice(mid))
  if (!early || !late || early.id === late.id || early.n < 3 || late.n < 3) return null
  return { from: early.id, to: late.id }
}

function modeTrigger(events: readonly { triggerId: string }[]): { id: string; n: number } | null {
  const counts = new Map<string, number>()
  for (const event of events) counts.set(event.triggerId, (counts.get(event.triggerId) ?? 0) + 1)
  let best: { id: string; n: number } | null = null
  for (const [id, n] of counts) {
    if (!best || n > best.n) best = { id, n }
  }
  return best
}

export function emptyReplacements(): Record<Cycle, string> {
  return { approval: '', belonging: '', status: '', novelty: '', avoidance: '', loss: '' }
}

export function knownCycle(value: string): value is Cycle {
  return (CYCLES as readonly string[]).includes(value)
}
