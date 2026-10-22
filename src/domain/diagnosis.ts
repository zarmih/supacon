import { loggedSessionMinutes } from './insights'
import { isBrowsePause } from './pause'
import { dayNumber, diagnosisDate } from './protocol'
import { addDays } from './time'
import type { Database, EveningReview, PauseEvent, Seeking } from './types'
import { isSeeking } from './types'

/**
 * Factual summaries the spec asks for and the rest of the domain does not yet produce:
 * the day 7 evening report (PROTOCOL.md, "Day 7: Diagnosis"), the list of today's pauses
 * for the evening review (APP_SPEC.md §4), and today against yesterday (APP_SPEC.md §1).
 * Nothing here is a model. Every claim waits for a minimum count.
 */

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night'

export const DAY_PARTS: readonly DayPart[] = ['morning', 'afternoon', 'evening', 'night']

/** 05–11 morning, 12–17 afternoon, 18–22 evening, 23–04 night, in the device's local clock. */
export function dayPartOf(hour: number): DayPart {
  if (hour >= 5 && hour <= 11) return 'morning'
  if (hour >= 12 && hour <= 17) return 'afternoon'
  if (hour >= 18 && hour <= 22) return 'evening'
  return 'night'
}

/** A part of the day needs this many browse pauses before its average is named. */
export const MIN_PART_PAUSES = 3
/** A trigger needs this many pauses or misses before it is called a strong one. */
export const MIN_TRIGGER_COUNT = 2

export interface PartStat {
  part: DayPart
  avg: number
  n: number
}

export interface ReportTrigger {
  id: string
  pauses: number
  misses: number
  opened: number
  avg: number | null
}

export interface DiagnosisReport {
  /** Protocol dates, day 1 to day 7 inclusive. */
  from: string
  to: string
  /** The protocol day `today` falls on, capped at 7. Below 7 the report is still forming. */
  day: number
  pauses: number
  opened: number
  postponed: number
  closed: number
  /** Logged misses plus the evening counts of unlogged ones. */
  misses: number
  /** pauses / (pauses + misses), or null when both are zero. */
  caughtShare: number | null
  avgAwareness: number | null
  /** At most three, strongest first. */
  topTriggers: ReportTrigger[]
  highest: PartStat | null
  lowest: PartStat | null
  /** Minutes inside sessions over the seven days (APP_SPEC.md: time spent in trigger apps). */
  sessionMinutes: number
  sessionCount: number
  overLimitSessions: number
  extraMinutes: number
  posts: { paused: number; steppedBack: number }
  likesChanged: EveningReview['likesChanged'] | null
  likesNote: string
  whereItBroke: string
}

function round1(value: number): number {
  return Math.round(value * 10) / 10
}

function mean(values: number[]): number | null {
  if (values.length === 0) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function inRange(date: string, from: string, to: string): boolean {
  return date >= from && date <= to
}

function protocolDay(db: Database, event: PauseEvent): number | null {
  return event.dayNumber ?? dayNumber(db.startedOn, event.date)
}

/**
 * The day 7 report. Null without a protocol start.
 * It can be read before day 7: `day` says how far the record goes.
 */
export function diagnosisReport(db: Database, today: string, now = Date.now()): DiagnosisReport | null {
  const from = db.startedOn
  const to = diagnosisDate(db.startedOn)
  if (!from || !to) return null
  const current = dayNumber(from, today) ?? 1
  const day = Math.min(7, Math.max(1, current))

  const inProtocol = db.events.filter((event) => {
    const n = protocolDay(db, event)
    return n !== null && n >= 1 && n <= 7 && inRange(event.date, from, to)
  })
  const browse = inProtocol.filter(isBrowsePause)
  const posts = inProtocol.filter((event) => event.intent === 'post')

  const loggedMisses = db.misses.filter((miss) => inRange(miss.date, from, to))
  const evenings = db.evenings.filter((entry) => inRange(entry.date, from, to))
  const misses = loggedMisses.length + evenings.reduce((sum, entry) => sum + Math.max(0, entry.unloggedMisses), 0)

  const opened = browse.filter((event) => event.choice === 'open').length
  const postponed = browse.filter((event) => event.choice === 'postpone').length
  const closed = browse.filter((event) => event.choice === 'close').length
  const avg = mean(browse.map((event) => event.awarenessBefore))

  const byTrigger = new Map<string, { pauses: PauseEvent[]; misses: number }>()
  for (const event of browse) {
    const entry = byTrigger.get(event.triggerId) ?? { pauses: [], misses: 0 }
    entry.pauses.push(event)
    byTrigger.set(event.triggerId, entry)
  }
  for (const miss of loggedMisses) {
    const entry = byTrigger.get(miss.triggerId) ?? { pauses: [], misses: 0 }
    entry.misses += 1
    byTrigger.set(miss.triggerId, entry)
  }
  const topTriggers: ReportTrigger[] = [...byTrigger.entries()]
    .map(([id, entry]) => {
      const scoreAvg = mean(entry.pauses.map((event) => event.awarenessBefore))
      return {
        id,
        pauses: entry.pauses.length,
        misses: entry.misses,
        opened: entry.pauses.filter((event) => event.choice === 'open').length,
        avg: scoreAvg === null ? null : round1(scoreAvg),
      }
    })
    .filter((item) => item.pauses + item.misses >= MIN_TRIGGER_COUNT)
    .sort(
      (a, b) =>
        b.pauses + b.misses - (a.pauses + a.misses) ||
        b.opened - a.opened ||
        a.id.localeCompare(b.id),
    )
    .slice(0, 3)

  const { highest, lowest } = partExtremes(browse)

  const sessions = db.sessions.filter((session) => inRange(session.date, from, to))
  const review = db.evenings.find((entry) => entry.date === to)

  return {
    from,
    to,
    day,
    pauses: browse.length,
    opened,
    postponed,
    closed,
    misses,
    caughtShare: browse.length + misses === 0 ? null : browse.length / (browse.length + misses),
    avgAwareness: avg === null ? null : round1(avg),
    topTriggers,
    highest,
    lowest,
    sessionMinutes: Math.round(sessions.reduce((sum, session) => sum + loggedSessionMinutes(session, now), 0)),
    sessionCount: sessions.length,
    overLimitSessions: sessions.filter((session) => session.overLimit).length,
    extraMinutes: Math.round(sessions.reduce((sum, session) => sum + session.extendedMinutes, 0)),
    posts: {
      paused: posts.length,
      steppedBack: posts.filter((event) => event.choice === 'dont-post' || event.choice === 'draft').length,
    },
    likesChanged: review?.likesChanged ?? null,
    likesNote: review?.likesNote?.trim() ?? '',
    whereItBroke: review?.whereItBroke?.trim() ?? '',
  }
}

/**
 * When awareness was highest and lowest, by part of the day.
 * Each part needs MIN_PART_PAUSES pauses, and two parts must qualify with different averages.
 * A tie on average keeps the larger sample, then the earlier part.
 */
export function partExtremes(events: readonly PauseEvent[]): { highest: PartStat | null; lowest: PartStat | null } {
  const buckets = new Map<DayPart, number[]>()
  for (const event of events) {
    if (!isBrowsePause(event)) continue
    const d = new Date(event.at)
    if (Number.isNaN(d.getTime())) continue
    const part = dayPartOf(d.getHours())
    const list = buckets.get(part) ?? []
    list.push(event.awarenessBefore)
    buckets.set(part, list)
  }
  const stats: PartStat[] = DAY_PARTS.flatMap((part) => {
    const scores = buckets.get(part) ?? []
    if (scores.length < MIN_PART_PAUSES) return []
    return [{ part, avg: round1(mean(scores) ?? 0), n: scores.length }]
  })
  if (stats.length < 2) return { highest: null, lowest: null }
  const order = (part: DayPart): number => DAY_PARTS.indexOf(part)
  const byHigh = [...stats].sort((a, b) => b.avg - a.avg || b.n - a.n || order(a.part) - order(b.part))
  const byLow = [...stats].sort((a, b) => a.avg - b.avg || b.n - a.n || order(a.part) - order(b.part))
  const highest = byHigh[0] ?? null
  const lowest = byLow[0] ?? null
  if (!highest || !lowest || highest.avg === lowest.avg) return { highest: null, lowest: null }
  return { highest, lowest }
}

/** Today's pauses, browse and post, oldest first. The evening review lists them all. */
export function pausesOn(db: Database, date: string): PauseEvent[] {
  return db.events.filter((event) => event.date === date).sort((a, b) => a.at.localeCompare(b.at))
}

/**
 * The pause with the lowest first score on that date. Ties keep the earliest.
 * It answers “When was awareness lowest today?” with the record, not with a guess.
 */
export function lowestPause(db: Database, date: string): PauseEvent | null {
  let lowest: PauseEvent | null = null
  for (const event of pausesOn(db, date)) {
    if (!lowest || event.awarenessBefore < lowest.awarenessBefore) lowest = event
  }
  return lowest
}

export interface DayComparison {
  today: number | null
  yesterday: number | null
  todayPauses: number
  yesterdayPauses: number
  /** today − yesterday, rounded to one decimal, when both days have browse pauses. */
  delta: number | null
}

/** Average awareness today against yesterday (APP_SPEC.md §1). Browse pauses only. */
export function todayVsYesterday(db: Database, today: string): DayComparison {
  const yesterdayDate = addDays(today, -1)
  const pick = (date: string): number[] =>
    db.events.filter((event) => event.date === date && isBrowsePause(event)).map((event) => event.awarenessBefore)
  const t = pick(today)
  const y = pick(yesterdayDate)
  const tAvg = mean(t)
  const yAvg = mean(y)
  return {
    today: tAvg === null ? null : round1(tAvg),
    yesterday: yAvg === null ? null : round1(yAvg),
    todayPauses: t.length,
    yesterdayPauses: y.length,
    delta: tAvg === null || yAvg === null ? null : round1(tAvg - yAvg),
  }
}

/**
 * The most common seeking among today's browse pauses scored 4 or below.
 * Needs two such pauses with the same name (the same bar as the insight on the whole record).
 */
export function seekingWhenLowOn(db: Database, date: string): { key: Seeking; n: number } | null {
  const counts = new Map<Seeking, number>()
  for (const event of db.events) {
    if (event.date !== date || !isBrowsePause(event) || event.awarenessBefore > 4) continue
    if (!isSeeking(event.seeking)) continue
    counts.set(event.seeking, (counts.get(event.seeking) ?? 0) + 1)
  }
  let best: { key: Seeking; n: number } | null = null
  for (const [key, n] of counts) {
    if (!best || n > best.n) best = { key, n }
  }
  return best && best.n >= 2 ? best : null
}
