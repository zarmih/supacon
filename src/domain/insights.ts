import { dominantCycle, trainedLoop, triggerShift, unfinishedOpens } from './cycles'
import type { Cycle } from './types'
import type { Database, Seeking, Session } from './types'
import { isSeeking } from './types'
import { isBrowsePause } from './pause'
import { addDays } from './time'

export interface RateSample {
  rate: number
  n: number
}

export interface Threshold {
  /** Scores below `cut` compared with scores at or above `cut`. */
  cut: number
  openBelow: number
  openAbove: number
  nBelow: number
  nAbove: number
}

export interface TriggerStat {
  id: string
  n: number
  avg: number
  openRate: number
}

export interface DayPoint {
  date: string
  avg: number | null
  pauses: number
  intercept: number | null
}

export interface Insights {
  pauses: number
  misses: number
  avgAwareness: number | null
  interceptRate: number | null
  threshold: Threshold | null
  lowOpenRate: RateSample | null
  highOpenRate: RateSample | null
  seekingLow: { key: Seeking; n: number } | null
  seekingTop: { key: Seeking; n: number } | null
  peakHour: { hour: number; n: number } | null
  naming: { delta: number; n: number } | null
  triggers: TriggerStat[]
  daily: DayPoint[]
  hourly: number[]
  posts: { paused: number; steppedBack: number }
  found: { yes: number; partly: number; no: number }
  postponeReturn: { postponed: number; returned: number }
  highButOpens: boolean
  baseline: { early: number; late: number } | null
  extraMinutes: number
  /** The function most pauses serve, when one leads and the sample is large enough. */
  cycle: { key: Cycle; n: number } | null
  /** Opens that were answered, and mostly did not deliver what was sought. */
  trained: { answered: number; unliked: number } | null
  /** Opens that named no finish line. */
  unfinished: { opens: number; bare: number } | null
  /** The pull moved from one trigger to another across the record. */
  shift: { from: string; to: string } | null
}

interface BrowseRow {
  awareness: number
  seeking: string
  choice: string
  triggerId: string
  at: string
  after?: number
  dayNumber: number | null
  finish?: string
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function browseRows(db: Database): BrowseRow[] {
  return db.events.filter(isBrowsePause).map((event) => ({
    awareness: event.awarenessBefore,
    seeking: event.seeking,
    choice: event.choice,
    triggerId: event.triggerId,
    at: event.at,
    after: event.awarenessAfter,
    dayNumber: event.dayNumber,
    finish: event.finish,
  }))
}

/**
 * The cut is the awareness score where opening becomes less likely.
 * Each side needs 4 pauses, and the open-rate gap must be at least 15 points.
 * The widest gap wins. A tie keeps the higher cut, where choice has clearly opened.
 */
export function findThreshold(rows: BrowseRow[]): Threshold | null {
  let best: Threshold | null = null
  for (let cut = 2; cut <= 9; cut += 1) {
    const below = rows.filter((row) => row.awareness < cut)
    const above = rows.filter((row) => row.awareness >= cut)
    if (below.length < 4 || above.length < 4) continue
    const openBelow = below.filter((row) => row.choice === 'open').length / below.length
    const openAbove = above.filter((row) => row.choice === 'open').length / above.length
    const gap = openBelow - openAbove
    if (gap < 0.15) continue
    const bestGap = best ? best.openBelow - best.openAbove : -1
    if (!best || gap > bestGap + 1e-9 || (Math.abs(gap - bestGap) <= 1e-9 && cut > best.cut)) {
      best = {
        cut,
        openBelow,
        openAbove,
        nBelow: below.length,
        nAbove: above.length,
      }
    }
  }
  return best
}

function rate(rows: BrowseRow[], predicate: (row: BrowseRow) => boolean, min: number): RateSample | null {
  const sample = rows.filter(predicate)
  if (sample.length < min) return null
  return {
    n: sample.length,
    rate: sample.filter((row) => row.choice === 'open').length / sample.length,
  }
}

function modeSeeking(rows: BrowseRow[]): { key: Seeking; n: number } | null {
  const counts = new Map<Seeking, number>()
  for (const row of rows) {
    if (!isSeeking(row.seeking)) continue
    counts.set(row.seeking, (counts.get(row.seeking) ?? 0) + 1)
  }
  let best: { key: Seeking; n: number } | null = null
  for (const [key, n] of counts) {
    if (!best || n > best.n) best = { key, n }
  }
  if (!best || best.n < 2) return null
  return best
}

function peakHour(hourly: number[]): { hour: number; n: number } | null {
  let hour = 0
  let n = 0
  for (let index = 0; index < hourly.length; index += 1) {
    const count = hourly[index] ?? 0
    if (count > n) {
      n = count
      hour = index
    }
  }
  if (n < 4) return null
  return { hour, n }
}

const RETURN_WINDOW_MS = 3 * 60 * 60 * 1000

function postponeReturns(db: Database): { postponed: number; returned: number } {
  let returned = 0
  for (const postpone of db.postpones) {
    const start = new Date(postpone.at).getTime()
    const end = start + RETURN_WINDOW_MS
    const cameBack = db.sessions.some((session) => {
      const at = new Date(session.startedAt).getTime()
      return session.triggerId === postpone.triggerId && at > start && at <= end
    })
    if (cameBack) returned += 1
  }
  return { postponed: db.postpones.length, returned }
}

function baseline(rows: BrowseRow[]): { early: number; late: number } | null {
  const dated = rows.filter((row) => row.dayNumber !== null)
  const early = dated.filter((row) => (row.dayNumber ?? 0) <= 2)
  const late = dated.filter((row) => {
    const day = row.dayNumber ?? 0
    return day >= 5 && day <= 7
  })
  if (early.length < 3 || late.length < 3) return null
  const earlyAvg = mean(early.map((row) => row.awareness))
  const lateAvg = mean(late.map((row) => row.awareness))
  if (earlyAvg === null || lateAvg === null) return null
  return { early: round1(earlyAvg), late: round1(lateAvg) }
}

export function dayStats(db: Database, date: string): {
  pauses: number
  avg: number | null
  opened: number
  postponed: number
  closed: number
  misses: number
  sessionMinutes: number
} {
  const pauses = db.events.filter((event) => event.date === date && isBrowsePause(event))
  const opened = pauses.filter((event) => event.choice === 'open').length
  const postponed = pauses.filter((event) => event.choice === 'postpone').length
  const closed = pauses.filter((event) => event.choice === 'close').length
  const sessionMinutes = db.sessions
    .filter((session) => session.date === date)
    .reduce((sum, session) => sum + loggedSessionMinutes(session), 0)
  return {
    pauses: pauses.length,
    avg: mean(pauses.map((event) => event.awarenessBefore)),
    opened,
    postponed,
    closed,
    misses: db.misses.filter((miss) => miss.date === date).length + (db.evenings.find((entry) => entry.date === date)?.unloggedMisses ?? 0),
    sessionMinutes,
  }
}

export function loggedSessionMinutes(session: Session, now = Date.now()): number {
  const start = new Date(session.startedAt).getTime()
  const plannedEnd = start + (session.plannedMinutes + session.extendedMinutes) * 60_000
  const end = session.endedAt ? new Date(session.endedAt).getTime() : Math.min(now, plannedEnd)
  return Math.max(0, (end - start) / 60_000)
}

export function buildInsights(db: Database, today: string): Insights {
  const rows = browseRows(db)
  const hourly = Array.from({ length: 24 }, () => 0)
  for (const row of rows) {
    const hour = new Date(row.at).getHours()
    hourly[hour] = (hourly[hour] ?? 0) + 1
  }

  const namingSamples = rows.filter((row) => row.after !== undefined)
  const namingDelta = mean(namingSamples.map((row) => (row.after ?? row.awareness) - row.awareness))

  const byTrigger = new Map<string, BrowseRow[]>()
  for (const row of rows) {
    const list = byTrigger.get(row.triggerId) ?? []
    list.push(row)
    byTrigger.set(row.triggerId, list)
  }
  const triggers: TriggerStat[] = [...byTrigger.entries()]
    .map(([id, list]) => ({
      id,
      n: list.length,
      avg: round1(mean(list.map((row) => row.awareness)) ?? 0),
      openRate: list.filter((row) => row.choice === 'open').length / list.length,
    }))
    .sort((a, b) => b.n - a.n || b.openRate - a.openRate)
    .slice(0, 6)

  const daily: DayPoint[] = []
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = addDays(today, -offset)
    const dayRows = db.events.filter((event) => event.date === date && isBrowsePause(event))
    const avgValue = mean(dayRows.map((event) => event.awarenessBefore))
    daily.push({
      date,
      avg: avgValue === null ? null : round1(avgValue),
      pauses: dayRows.length,
      intercept:
        dayRows.length === 0
          ? null
          : dayRows.filter((event) => event.choice === 'postpone' || event.choice === 'close').length / dayRows.length,
    })
  }

  const posts = db.events.filter((event) => event.intent === 'post')
  const avg = mean(rows.map((row) => row.awareness))
  const opens = rows.filter((row) => row.choice === 'open').length
  const highButOpens = rows.length >= 6 && avg !== null && avg >= 7.5 && opens / rows.length >= 0.75

  const lowRows = rows.filter((row) => row.awareness <= 4)
  const seekingLow = modeSeeking(lowRows)
  const seekingTop = modeSeeking(rows)

  return {
    pauses: rows.length,
    misses: db.misses.length + db.evenings.reduce((sum, entry) => sum + entry.unloggedMisses, 0),
    avgAwareness: avg === null ? null : round1(avg),
    interceptRate:
      rows.length === 0
        ? null
        : rows.filter((row) => row.choice === 'postpone' || row.choice === 'close').length / rows.length,
    threshold: findThreshold(rows),
    lowOpenRate: rate(rows, (row) => row.awareness <= 4, 4),
    highOpenRate: rate(rows, (row) => row.awareness >= 7, 4),
    seekingLow,
    seekingTop,
    peakHour: peakHour(hourly),
    naming:
      namingSamples.length >= 3 && namingDelta !== null
        ? { delta: round1(namingDelta), n: namingSamples.length }
        : null,
    triggers,
    daily,
    hourly,
    posts: {
      paused: posts.length,
      steppedBack: posts.filter((event) => event.choice === 'dont-post' || event.choice === 'draft').length,
    },
    found: {
      yes: db.sessions.filter((session) => session.found === 'yes').length,
      partly: db.sessions.filter((session) => session.found === 'partly').length,
      no: db.sessions.filter((session) => session.found === 'no').length,
    },
    postponeReturn: postponeReturns(db),
    highButOpens,
    baseline: baseline(rows),
    extraMinutes: Math.round(db.sessions.reduce((sum, session) => sum + session.extendedMinutes, 0)),
    cycle: dominantCycle(rows.map((row) => row.seeking)),
    trained: trainedLoop(db.sessions.map((session) => session.found)),
    unfinished: unfinishedOpens(rows.filter((row) => row.choice === 'open').map((row) => row.finish)),
    shift: triggerShift(rows.map((row) => ({ at: row.at, triggerId: row.triggerId }))),
  }
}
