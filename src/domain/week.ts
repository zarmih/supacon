import { addDays, diffDays } from './time'
import type { Database, ExperimentResult, WeeklyExperiment } from './types'

/** Below this many browse pauses a week says how many there were and compares nothing. */
export const WEEK_MIN_SAMPLE = 4
/** Days without any record after which Today welcomes the person back. */
export const BREAK_DAYS = 3

export function activeExperiment(db: Database): WeeklyExperiment | null {
  return db.weekly.find((item) => item.status === 'active') ?? null
}

/** Day 1–7 of the experiment, or more once its week is over. Null before it starts. */
export function experimentDay(experiment: WeeklyExperiment, today: string): number | null {
  const day = diffDays(experiment.startDate, today) + 1
  return day >= 1 ? day : null
}

export function experimentOver(experiment: WeeklyExperiment, today: string): boolean {
  return today > experiment.endDate
}

export function checkOn(experiment: WeeklyExperiment, date: string) {
  return experiment.checks.find((check) => check.date === date) ?? null
}

/** The most recent experiment worth reviewing: the active one, or one that ended in the last two weeks. */
export function reviewableExperiment(db: Database, today: string): WeeklyExperiment | null {
  const active = activeExperiment(db)
  if (active) return active
  const recent = [...db.weekly]
    .filter((item) => item.endDate >= addDays(today, -14) && item.startDate <= today)
    .sort((a, b) => (a.startDate < b.startDate ? 1 : -1))
  return recent[0] ?? null
}

function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  const value = sorted.length % 2 === 1 ? sorted[mid] : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2
  return Math.round((value ?? 0) * 10) / 10
}

export type LimitId = 'small-sample' | 'no-compare' | 'self-report' | 'not-causal' | 'gaps' | 'partial-week'
export type StepId = 'start-small' | 'more-pauses' | 'repeat-or-next' | 'simplify' | 'finish-line' | 'keep'

export interface WeekSideSummary {
  n: number
  median: number | null
  openShare: number | null
}

export interface WeekReview {
  start: string
  end: string
  /** Days of the range up to today. */
  elapsed: number
  browse: WeekSideSummary
  opened: number
  postponed: number
  closed: number
  posts: number
  misses: number
  secondScores: { n: number; meanMove: number | null }
  sessions: { n: number; yes: number; partly: number; no: number }
  daysWithRecord: number
  experiment: { id: string; intention: string; did: number; partly: number; notToday: number; unmarked: number } | null
  previous: WeekSideSummary
  /** Both sides have enough pauses to be put next to each other. */
  comparable: boolean
  limits: LimitId[]
  next: StepId
}

function side(db: Database, start: string, end: string): WeekSideSummary {
  const rows = db.events.filter((event) => event.intent === 'browse' && event.date >= start && event.date <= end)
  return {
    n: rows.length,
    median: median(rows.map((row) => row.awarenessBefore)),
    openShare: rows.length === 0 ? null : rows.filter((row) => row.choice === 'open').length / rows.length,
  }
}

/**
 * A plain account of one week: what the record holds, what it cannot say, one next step.
 * The range is the experiment's week when there is one, otherwise the seven days ending today.
 * Nothing here is a score, and nothing claims that the experiment caused a change.
 */
export function weekReview(db: Database, today: string, experiment: WeeklyExperiment | null = reviewableExperiment(db, today)): WeekReview {
  const start = experiment ? experiment.startDate : addDays(today, -6)
  const end = experiment ? experiment.endDate : today
  const last = end < today ? end : today
  const elapsed = Math.max(0, Math.min(7, diffDays(start, last) + 1))
  const inRange = (date: string) => date >= start && date <= last
  const browseRows = db.events.filter((event) => event.intent === 'browse' && inRange(event.date))
  const browse = side(db, start, last)
  const previous = side(db, addDays(start, -7), addDays(start, -1))
  const moved = browseRows.filter((row) => row.awarenessAfter !== undefined)
  const sessions = db.sessions.filter((item) => inRange(item.date))
  const dates = new Set<string>([
    ...db.events.filter((item) => inRange(item.date)).map((item) => item.date),
    ...db.misses.filter((item) => inRange(item.date)).map((item) => item.date),
    ...db.mornings.filter((item) => inRange(item.date)).map((item) => item.date),
    ...db.evenings.filter((item) => inRange(item.date)).map((item) => item.date),
    ...(experiment ? experiment.checks.filter((item) => inRange(item.date)).map((item) => item.date) : []),
  ])
  const count = (result: ExperimentResult) => experiment?.checks.filter((check) => check.result === result && inRange(check.date)).length ?? 0
  const experimentSummary = experiment
    ? {
        id: experiment.id,
        intention: experiment.intention,
        did: count('did'),
        partly: count('partly'),
        notToday: count('not-today'),
        unmarked: Math.max(0, elapsed - count('did') - count('partly') - count('not-today')),
      }
    : null
  const comparable = browse.n >= WEEK_MIN_SAMPLE && previous.n >= WEEK_MIN_SAMPLE

  const limits: LimitId[] = []
  if (browse.n < WEEK_MIN_SAMPLE) limits.push('small-sample')
  else if (!comparable) limits.push('no-compare')
  if (elapsed < 7) limits.push('partial-week')
  if (elapsed - dates.size >= BREAK_DAYS) limits.push('gaps')
  limits.push('self-report')
  if (experimentSummary) limits.push('not-causal')

  let next: StepId = 'keep'
  const marked = experimentSummary ? experimentSummary.did + experimentSummary.partly + experimentSummary.notToday : 0
  const opened = browseRows.filter((row) => row.choice === 'open').length
  if (browse.n === 0 && marked === 0) next = 'start-small'
  else if (browse.n < WEEK_MIN_SAMPLE) next = 'more-pauses'
  else if (experimentSummary && experimentSummary.did + experimentSummary.partly >= 3) next = 'repeat-or-next'
  else if (experimentSummary && marked < 3) next = 'simplify'
  else if (opened / browse.n >= 0.75) next = 'finish-line'

  return {
    start,
    end,
    elapsed,
    browse,
    opened,
    postponed: browseRows.filter((row) => row.choice === 'postpone').length,
    closed: browseRows.filter((row) => row.choice === 'close').length,
    posts: db.events.filter((event) => event.intent === 'post' && inRange(event.date)).length,
    misses: db.misses.filter((item) => inRange(item.date)).length,
    secondScores: {
      n: moved.length,
      meanMove: moved.length === 0 ? null : Math.round((moved.reduce((sum, row) => sum + ((row.awarenessAfter ?? 0) - row.awarenessBefore), 0) / moved.length) * 10) / 10,
    },
    sessions: {
      n: sessions.length,
      yes: sessions.filter((item) => item.found === 'yes').length,
      partly: sessions.filter((item) => item.found === 'partly').length,
      no: sessions.filter((item) => item.found === 'no').length,
    },
    daysWithRecord: dates.size,
    experiment: experimentSummary,
    previous,
    comparable,
    limits,
    next,
  }
}

/** The last calendar date with anything in the record, or null for an empty record. */
export function lastActivity(db: Database): string | null {
  const dates = [
    // Onboarding counts, so someone who never came back after day 1 is greeted too.
    ...(db.startedOn ? [db.startedOn] : []),
    ...db.events.map((item) => item.date),
    ...db.misses.map((item) => item.date),
    ...db.mornings.map((item) => item.date),
    ...db.evenings.map((item) => item.date),
    ...db.sessions.map((item) => item.date),
    ...db.focuses.map((item) => item.date),
    ...db.dayMarks.map((item) => item.date),
    ...db.weekly.flatMap((item) => item.checks.map((check) => check.date)),
  ]
  if (dates.length === 0) return null
  return dates.reduce((a, b) => (a > b ? a : b))
}

/** A gap of at least BREAK_DAYS without any record, ending today. Nothing is lost; this only changes the greeting. */
export function returnAfterBreak(db: Database, today: string): { last: string; days: number } | null {
  const last = lastActivity(db)
  if (!last || last >= today) return null
  const days = diffDays(last, today)
  return days >= BREAK_DAYS ? { last, days } : null
}
