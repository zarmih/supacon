import type { Database, Phase, PracticeMode } from './types'
import { addDays, diffDays } from './time'

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
