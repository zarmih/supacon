import type { Database, PauseEvent, Phase, PracticeMode } from './types'
import { addDays, diffDays, localDate } from './time'
import { isBrowsePause } from './pause'

/**
 * Day 1 is `startedOn`. A clock set backwards still counts as day 1.
 * Days keep moving if the person skips a date. Absence is data, not a freeze.
 */
export function dayNumber(startedOn: string | null, today: string): number | null {
  if (!startedOn) return null
  const delta = diffDays(startedOn, today)
  if (Number.isNaN(delta)) return null
  return delta < 0 ? 1 : delta + 1
}

export function phaseFor(day: number | null, mode: PracticeMode | null): Phase {
  if (mode !== null) return 'practice'
  if (day === null) return 'practice'
  if (day <= 2) return 'calibration'
  if (day <= 4) return 'boundary'
  if (day <= 6) return 'contrast'
  if (day === 7) return 'diagnosis'
  return 'practice'
}

export type IntentionId = 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' | 'practice'

export function intentionId(day: number | null, phase: Phase): IntentionId {
  if (phase === 'practice') return 'practice'
  if (day === 2) return 'd2'
  if (day === 3) return 'd3'
  if (day === 4) return 'd4'
  if (day === 5) return 'd5'
  if (day === 6) return 'd6'
  if (day === 7) return 'd7'
  return 'd1'
}

/** The session cap is off during calibration and whenever the setting is unlimited. */
export function limitActive(day: number | null, mode: PracticeMode | null, maxSessions: number): boolean {
  if (maxSessions <= 0) return false
  if (mode === null && day !== null && day <= 2) return false
  return true
}

export function sessionsStartedOn(db: Database, date: string): number {
  return db.sessions.filter((session) => session.date === date).length
}

export function isOverLimit(db: Database, date: string): boolean {
  const day = dayNumber(db.startedOn, date)
  if (!limitActive(day, db.practiceMode, db.settings.maxSessionsPerDay)) return false
  return sessionsStartedOn(db, date) >= db.settings.maxSessionsPerDay
}

export function diagnosisDate(startedOn: string | null): string | null {
  if (!startedOn) return null
  return addDays(startedOn, 6)
}

export interface CheckItem {
  id: 'morning' | 'focus' | 'evening' | 'contact' | 'diagnosis'
  done: boolean
}

export function checklist(db: Database, today: string): CheckItem[] {
  const day = dayNumber(db.startedOn, today)
  const phase = phaseFor(day, db.practiceMode)
  const items: CheckItem[] = []

  items.push({
    id: 'morning',
    done: db.mornings.some((entry) => entry.date === today && entry.firstDesire.trim().length > 0),
  })

  const focus = db.focuses.find((entry) => entry.date === today && entry.endedAt)
  items.push({ id: 'focus', done: Boolean(focus) })

  if (phase === 'contrast') {
    const mark = db.dayMarks.find((entry) => entry.date === today)
    items.push({ id: 'contact', done: mark?.realContact !== null && mark !== undefined })
  }

  const evening = db.evenings.find((entry) => entry.date === today)
  items.push({ id: 'evening', done: Boolean(evening) })

  if (phase === 'diagnosis') {
    items.push({
      id: 'diagnosis',
      done: Boolean(evening?.whereItBroke && evening.whereItBroke.trim().length > 0),
    })
  }

  return items
}

export interface ExperimentDef {
  id: 'name-aloud' | 'body-score' | 'one-urge' | 'real-voice' | 'second-look'
}

export const EXPERIMENTS: readonly ExperimentDef[] = [
  { id: 'name-aloud' },
  { id: 'body-score' },
  { id: 'one-urge' },
  { id: 'real-voice' },
  { id: 'second-look' },
]

/** Week 0 is the protocol itself. Experiments start the week after. */
export function experimentForWeek(weekIndex: number): ExperimentDef | null {
  if (weekIndex < 1) return null
  const index = (weekIndex - 1) % EXPERIMENTS.length
  return EXPERIMENTS[index] ?? null
}

export function weekIndex(day: number | null): number {
  if (day === null || day < 1) return 0
  return Math.floor((day - 1) / 7)
}

export function bandOf(score: number): 'autopilot' | 'partial' | 'clear' | 'spacious' {
  if (score <= 3) return 'autopilot'
  if (score <= 6) return 'partial'
  if (score <= 8) return 'clear'
  return 'spacious'
}

/**
 * Day 7 is complete when the evening review with `whereItBroke` diagnosis is filled,
 * or when the person reaches day 8 or later, provided practice mode has not yet been chosen.
 */
export function isProtocolCompleted(db: Database, today: string): boolean {
  if (db.practiceMode !== null) return false
  const day = dayNumber(db.startedOn, today)
  if (day === null) return false
  if (day >= 8) return true
  if (day === 7) {
    const diagDate = diagnosisDate(db.startedOn) ?? today
    const evening = db.evenings.find((entry) => entry.date === diagDate || entry.date === today)
    return Boolean(evening?.whereItBroke && evening.whereItBroke.trim().length > 0)
  }
  return false
}

/**
 * Counts all completed browse pauses that occurred during the seven-day protocol (days 1 through 7).
 */
export function protocolPausesCount(db: Database): number {
  return db.events.filter((event) => {
    if (!isBrowsePause(event)) return false
    const day = event.dayNumber ?? dayNumber(db.startedOn, event.date)
    return day !== null && day >= 1 && day <= 7
  }).length
}

export interface PhaseComparison {
  calibration: {
    pauses: number
    avgAwareness: number
    openRate: number
  }
  contrast: {
    pauses: number
    avgAwareness: number
    openRate: number
  }
}

/**
 * Compares calibration (days 1–2) and contrast (days 5–6) if data exists for both phases.
 */
export function calibrationVsContrast(db: Database): PhaseComparison | null {
  const browse = db.events.filter(isBrowsePause)
  const calEvents = browse.filter((event) => {
    const day = event.dayNumber ?? dayNumber(db.startedOn, event.date)
    return day === 1 || day === 2
  })
  const conEvents = browse.filter((event) => {
    const day = event.dayNumber ?? dayNumber(db.startedOn, event.date)
    return day === 5 || day === 6
  })

  if (calEvents.length === 0 || conEvents.length === 0) return null

  const calAvg = calEvents.reduce((sum, e) => sum + e.awarenessBefore, 0) / calEvents.length
  const conAvg = conEvents.reduce((sum, e) => sum + e.awarenessBefore, 0) / conEvents.length
  const calOpens = calEvents.filter((e) => e.choice === 'open').length
  const conOpens = conEvents.filter((e) => e.choice === 'open').length

  return {
    calibration: {
      pauses: calEvents.length,
      avgAwareness: Math.round(calAvg * 10) / 10,
      openRate: Math.round((calOpens / calEvents.length) * 100),
    },
    contrast: {
      pauses: conEvents.length,
      avgAwareness: Math.round(conAvg * 10) / 10,
      openRate: Math.round((conOpens / conEvents.length) * 100),
    },
  }
}

/**
 * Calculates the loudest hour across all pause events.
 * Returns null if the peak hour has fewer than 4 pauses.
 */
export function loudestHour(events: readonly PauseEvent[]): { hour: number; n: number } | null {
  const hourly = Array.from({ length: 24 }, () => 0)
  for (const event of events) {
    if (!isBrowsePause(event)) continue
    const d = new Date(event.at)
    if (Number.isNaN(d.getTime())) continue
    const hour = d.getHours()
    hourly[hour] = (hourly[hour] ?? 0) + 1
  }
  let bestHour = 0
  let maxCount = 0
  for (let h = 0; h < 24; h += 1) {
    const count = hourly[h] ?? 0
    if (count > maxCount) {
      maxCount = count
      bestHour = h
    }
  }
  if (maxCount < 4) return null
  return { hour: bestHour, n: maxCount }
}

export interface ContrastFocusSuggestion {
  suggestedHour: number
  isSuggestedNow: boolean
}

/**
 * In contrast phase (protocol days 5-6), suggests taking a focus block
 * during the person's loudest hour of urges/pauses.
 * Returns null if not in contrast phase or if not enough data (< 4 pauses in loudest hour).
 */
export function contrastFocusSuggestion(
  db: Database,
  now: number = Date.now(),
): ContrastFocusSuggestion | null {
  const nowDate = new Date(now)
  const today = localDate(nowDate)
  const day = dayNumber(db.startedOn, today)
  const phase = phaseFor(day, db.practiceMode)
  if (phase !== 'contrast') return null

  const loud = loudestHour(db.events)
  if (!loud) return null

  const currentHour = nowDate.getHours()
  return {
    suggestedHour: loud.hour,
    isSuggestedNow: currentHour === loud.hour,
  }
}


