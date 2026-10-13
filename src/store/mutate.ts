import type {
  AwarenessScore,
  Database,
  EveningReview,
  PauseEvent,
  PracticeMode,
  Seeking,
  Session,
  Settings,
} from '../domain/types'
import { PRESET_IDS, isAwarenessScore, isPostMotive, isSeeking } from '../domain/types'
import { createId } from '../domain/ids'
import { isReadyToCommit, type PauseDraft } from '../domain/pause'
import { dayNumber, isOverLimit, phaseFor } from '../domain/protocol'
import { localDate } from '../domain/time'
import { defaultSettings, emptyDatabase } from './defaults'

function clone<T>(value: T): T {
  return structuredClone(value)
}

export interface OnboardingTrigger {
  id: string
  label: string
  preset: boolean
}

export function completeOnboarding(
  db: Database,
  input: { triggers: OnboardingTrigger[]; path: 'protocol' | 'free'; now: Date },
): Database {
  const next = clone(db)
  const at = input.now.toISOString()
  const seen = new Set<string>()
  next.triggers = []
  for (const trigger of input.triggers) {
    const label = trigger.label.trim().slice(0, 40)
    if (!label || seen.has(trigger.id)) continue
    seen.add(trigger.id)
    next.triggers.push({
      id: trigger.id,
      label,
      preset: trigger.preset,
      enabled: true,
      createdAt: at,
    })
  }
  if (!next.triggers.some((trigger) => trigger.id === 'other')) {
    next.triggers.push({
      id: 'other',
      label: 'Something else',
      preset: true,
      enabled: true,
      createdAt: at,
    })
  }
  next.onboardingComplete = next.triggers.length > 0
  next.startedOn = localDate(input.now)
  next.practiceMode = input.path === 'free' ? 'free' : null
  if (input.path === 'free') next.settings.maxSessionsPerDay = 0
  next.demo = false
  return next
}

export function commitPause(
  db: Database,
  draft: PauseDraft,
  now: Date,
): { db: Database; sessionId?: string } | null {
  if (!isReadyToCommit(draft) || !draft.choice || !draft.awarenessBefore || !draft.seeking) return null
  const next = clone(db)
  const date = localDate(now)
  const day = dayNumber(next.startedOn, date)
  const phase = phaseFor(day, next.practiceMode)
  const overLimit = draft.choice === 'open' && isOverLimit(next, date)
  const event: PauseEvent = {
    id: draft.id,
    at: now.toISOString(),
    date,
    intent: draft.intent,
    triggerId: draft.triggerId,
    awarenessBefore: draft.awarenessBefore,
    seeking: draft.seeking,
    seekingNote: draft.seekingNote.trim(),
    choice: draft.choice,
    overLimit,
    elapsedSeconds: Math.max(0, Math.round((now.getTime() - draft.startedAt) / 1000)),
    dayNumber: day,
    phase,
  }
  if (draft.awarenessAfter) event.awarenessAfter = draft.awarenessAfter
  if (draft.choice === 'postpone') {
    const minutes = next.settings.postponeMinutes
    event.postponeMinutes = minutes
    next.postpones.push({
      id: createId(),
      pauseId: event.id,
      triggerId: draft.triggerId,
      at: event.at,
      until: new Date(now.getTime() + minutes * 60_000).toISOString(),
    })
  }
  next.events.push(event)

  let sessionId: string | undefined
  if (draft.choice === 'open' && isSeeking(draft.seeking)) {
    const current = next.sessions.find((session) => !session.endedAt)
    if (current) {
      current.endedAt = event.at
      current.endReason = 'replaced'
    }
    sessionId = createId()
    const session: Session = {
      id: sessionId,
      pauseId: event.id,
      triggerId: draft.triggerId,
      startedAt: event.at,
      date,
      plannedMinutes: next.settings.sessionMinutes,
      extendedMinutes: 0,
      awarenessAtStart: draft.awarenessBefore,
      seeking: draft.seeking,
      overLimit,
    }
    next.sessions.push(session)
  }
  return { db: next, sessionId }
}

export function endSession(
  db: Database,
  sessionId: string,
  found: 'yes' | 'partly' | 'no' | null,
  now: Date,
  reason: 'manual' | 'timer' = 'manual',
): Database {
  const next = clone(db)
  const session = next.sessions.find((item) => item.id === sessionId)
  if (!session || session.endedAt) return db
  session.endedAt = now.toISOString()
  session.endReason = reason
  if (found) session.found = found
  return next
}

export function extendSession(db: Database, sessionId: string): Database {
  const next = clone(db)
  const session = next.sessions.find((item) => item.id === sessionId)
  if (!session || session.endedAt) return db
  session.extendedMinutes += next.settings.sessionMinutes
  return next
}

export function saveMorning(
  db: Database,
  input: { awareness: AwarenessScore; firstDesire: string; now: Date },
): Database {
  const desire = input.firstDesire.trim().slice(0, 180)
  if (!desire) return db
  const next = clone(db)
  const date = localDate(input.now)
  const entry = { date, at: input.now.toISOString(), awareness: input.awareness, firstDesire: desire }
  const index = next.mornings.findIndex((item) => item.date === date)
  if (index >= 0) next.mornings[index] = entry
  else next.mornings.push(entry)
  return next
}

export function saveEvening(db: Database, review: EveningReview): Database {
  const next = clone(db)
  const cleaned: EveningReview = {
    ...review,
    lowestMoment: review.lowestMoment.trim().slice(0, 180),
    note: review.note.trim().slice(0, 600),
    unloggedMisses: Math.max(0, Math.min(20, Math.round(review.unloggedMisses) || 0)),
    likesNote: review.likesNote?.trim().slice(0, 300),
    whereItBroke: review.whereItBroke?.trim().slice(0, 400),
  }
  const index = next.evenings.findIndex((item) => item.date === cleaned.date)
  if (index >= 0) next.evenings[index] = cleaned
  else next.evenings.push(cleaned)
  return next
}

export function saveContact(
  db: Database,
  input: { date: string; realContact: boolean; note: string },
): Database {
  const next = clone(db)
  const mark = {
    date: input.date,
    realContact: input.realContact,
    contactNote: input.note.trim().slice(0, 180),
  }
  const index = next.dayMarks.findIndex((item) => item.date === input.date)
  if (index >= 0) next.dayMarks[index] = mark
  else next.dayMarks.push(mark)
  return next
}

export function startFocus(db: Database, now: Date): Database {
  const next = clone(db)
  const running = next.focuses.find((item) => !item.endedAt)
  if (running) return db
  next.focuses.push({
    id: createId(),
    date: localDate(now),
    startedAt: now.toISOString(),
    plannedMinutes: next.settings.focusMinutes,
    completed: false,
  })
  return next
}

export function endFocus(db: Database, id: string, completed: boolean, now: Date): Database {
  const next = clone(db)
  const focus = next.focuses.find((item) => item.id === id)
  if (!focus || focus.endedAt) return db
  focus.endedAt = now.toISOString()
  focus.completed = completed
  return next
}

export function logMiss(
  db: Database,
  input: { triggerId: string; awareness?: number; seeking?: Seeking; note: string; now: Date },
): Database | null {
  if (!db.triggers.some((trigger) => trigger.id === input.triggerId)) return null
  const next = clone(db)
  next.misses.push({
    id: createId(),
    at: input.now.toISOString(),
    date: localDate(input.now),
    triggerId: input.triggerId,
    ...(input.awareness && isAwarenessScore(input.awareness) ? { awareness: input.awareness } : {}),
    ...(input.seeking && isSeeking(input.seeking) ? { seeking: input.seeking } : {}),
    note: input.note.trim().slice(0, 180),
  })
  return next
}

export function setPracticeMode(db: Database, mode: PracticeMode): Database {
  const next = clone(db)
  next.practiceMode = mode
  if (mode === 'free') next.settings.maxSessionsPerDay = 0
  if (mode !== 'free' && next.settings.maxSessionsPerDay <= 0) next.settings.maxSessionsPerDay = 3
  return next
}

export function restartProtocol(db: Database, now: Date): Database {
  const next = clone(db)
  next.startedOn = localDate(now)
  next.practiceMode = null
  next.demo = false
  if (next.settings.maxSessionsPerDay <= 0) next.settings.maxSessionsPerDay = 3
  return next
}

const SESSION_CHOICES = [0, 1, 2, 3, 4, 5, 6]
const SESSION_MINUTES = [10, 15, 20, 25, 30]
const POSTPONE_MINUTES = [15, 30, 45, 60]
const FOCUS_MINUTES = [25, 45, 60, 90]
const PAUSE_SECONDS = [5, 10, 15]

export function updateSettings(db: Database, patch: Partial<Settings>): Database {
  const next = clone(db)
  const settings = { ...next.settings, ...patch }
  if (!SESSION_CHOICES.includes(settings.maxSessionsPerDay)) settings.maxSessionsPerDay = next.settings.maxSessionsPerDay
  if (!SESSION_MINUTES.includes(settings.sessionMinutes)) settings.sessionMinutes = next.settings.sessionMinutes
  if (!POSTPONE_MINUTES.includes(settings.postponeMinutes)) settings.postponeMinutes = next.settings.postponeMinutes
  if (!FOCUS_MINUTES.includes(settings.focusMinutes)) settings.focusMinutes = next.settings.focusMinutes
  if (!PAUSE_SECONDS.includes(settings.pauseSeconds)) settings.pauseSeconds = next.settings.pauseSeconds
  if (settings.eveningReminder && !/^\d{2}:\d{2}$/.test(settings.eveningReminder)) settings.eveningReminder = null
  if (settings.lang !== 'auto' && settings.lang !== 'en' && settings.lang !== 'ru') settings.lang = 'auto'
  if (settings.theme !== 'ink' && settings.theme !== 'paper' && settings.theme !== 'system') settings.theme = 'ink'
  next.settings = settings
  return next
}

export function addTrigger(db: Database, label: string, now: Date): Database {
  const name = label.trim().slice(0, 40)
  if (!name) return db
  const next = clone(db)
  next.triggers.push({
    id: createId(),
    label: name,
    preset: false,
    enabled: true,
    createdAt: now.toISOString(),
  })
  return next
}

export function toggleTrigger(db: Database, id: string): Database {
  const next = clone(db)
  const trigger = next.triggers.find((item) => item.id === id)
  if (!trigger) return db
  const enabledCount = next.triggers.filter((item) => item.enabled).length
  if (trigger.enabled && enabledCount <= 1) return db
  trigger.enabled = !trigger.enabled
  return next
}

export function setExperiment(
  db: Database,
  input: { id: string; weekIndex: number; status: 'done' | 'dismissed' | 'open' },
): Database {
  const next = clone(db)
  const index = next.experiments.findIndex((item) => item.id === input.id && item.weekIndex === input.weekIndex)
  const mark = { id: input.id, weekIndex: input.weekIndex, status: input.status }
  if (index >= 0) next.experiments[index] = mark
  else next.experiments.push(mark)
  return next
}

export function activeSession(db: Database): Session | null {
  return db.sessions.find((session) => !session.endedAt) ?? null
}

export function activeFocus(db: Database) {
  return db.focuses.find((focus) => !focus.endedAt) ?? null
}

export { PRESET_IDS, isPostMotive, isSeeking, defaultSettings, emptyDatabase }
