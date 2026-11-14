import type { AwarenessScore, Choice, Impulse, Intent, PauseEvent } from './types'
import { isAwarenessScore } from './types'
import { clip } from './text'

export type PauseStep = 'arrive' | 'score' | 'seeking' | 'choose' | 'after'

export interface PauseDraft {
  id: string
  intent: Intent
  triggerId: string
  startedAt: number
  step: PauseStep
  minSeconds: number
  startedWithArrive: boolean
  awarenessBefore?: AwarenessScore
  feelingBefore?: string
  seeking?: Impulse
  seekingNote: string
  /** What would make an open finished. Empty means the open has no finish line. */
  finish: string
  choice?: Choice
  awarenessAfter?: AwarenessScore
  feelingAfter?: string
  whyPastCap?: string
}

const BROWSE_CHOICES: readonly Choice[] = ['open', 'postpone', 'close']
const POST_CHOICES: readonly Choice[] = ['post', 'draft', 'dont-post']

export function createDraft(input: {
  id: string
  intent: Intent
  triggerId: string
  now: number
  minSeconds: number
  completedPauses: number
}): PauseDraft {
  const startedWithArrive = input.intent === 'browse' && input.completedPauses < 3
  return {
    id: input.id,
    intent: input.intent,
    triggerId: input.triggerId,
    startedAt: input.now,
    step: startedWithArrive ? 'arrive' : 'score',
    minSeconds: Math.max(0, input.minSeconds),
    startedWithArrive,
    seekingNote: '',
    finish: '',
  }
}

export function breathDone(draft: PauseDraft, now: number): boolean {
  return now - draft.startedAt >= draft.minSeconds * 1000
}

export function breathProgress(draft: PauseDraft, now: number): number {
  if (draft.minSeconds <= 0) return 1
  return Math.min(1, Math.max(0, (now - draft.startedAt) / (draft.minSeconds * 1000)))
}

export function advanceFromArrive(draft: PauseDraft): PauseDraft {
  if (draft.step !== 'arrive') return draft
  return { ...draft, step: 'score' }
}

export function setScore(draft: PauseDraft, score: number): PauseDraft {
  if (!isAwarenessScore(score)) return draft
  if (draft.step !== 'score' && draft.step !== 'seeking' && draft.step !== 'choose') return draft
  return { ...draft, awarenessBefore: score, step: 'seeking' }
}

export function setFeelingBefore(draft: PauseDraft, feeling: string | undefined): PauseDraft {
  const cleaned = feeling ? clip(feeling, 40) : ''
  if (!cleaned) {
    const next = { ...draft }
    delete next.feelingBefore
    return next
  }
  return { ...draft, feelingBefore: cleaned }
}

export function setFeelingAfter(draft: PauseDraft, feeling: string | undefined): PauseDraft {
  const cleaned = feeling ? clip(feeling, 40) : ''
  if (!cleaned) {
    const next = { ...draft }
    delete next.feelingAfter
    return next
  }
  return { ...draft, feelingAfter: cleaned }
}

export function setWhyPastCap(draft: PauseDraft, why: string | undefined): PauseDraft {
  const cleaned = why ? clip(why, 40) : ''
  if (!cleaned) {
    const next = { ...draft }
    delete next.whyPastCap
    return next
  }
  return { ...draft, whyPastCap: cleaned }
}

export function setSeeking(draft: PauseDraft, seeking: Impulse): PauseDraft {
  if (draft.step !== 'seeking' && draft.step !== 'choose') return draft
  if (draft.intent === 'browse' && seeking === 'other') {
    return { ...draft, seeking, step: 'seeking' }
  }
  return { ...draft, seeking, step: 'choose' }
}

export function setSeekingNote(draft: PauseDraft, note: string): PauseDraft {
  return { ...draft, seekingNote: note.slice(0, 160) }
}

export function setFinish(draft: PauseDraft, finish: string): PauseDraft {
  return { ...draft, finish: finish.slice(0, 80) }
}

export function confirmSeeking(draft: PauseDraft): PauseDraft {
  if (!draft.seeking) return draft
  if (draft.seeking === 'other' && draft.seekingNote.trim() === '') return draft
  return { ...draft, step: 'choose' }
}

export function goBack(draft: PauseDraft): PauseDraft {
  if (draft.step === 'after') return { ...draft, step: 'choose', choice: undefined }
  if (draft.step === 'choose') return { ...draft, step: 'seeking' }
  if (draft.step === 'seeking') return { ...draft, step: 'score' }
  if (draft.step === 'score' && draft.startedWithArrive) return { ...draft, step: 'arrive' }
  return draft
}

export function canChoose(draft: PauseDraft, now: number): boolean {
  return (
    draft.step === 'choose' &&
    breathDone(draft, now) &&
    draft.awarenessBefore !== undefined &&
    draft.seeking !== undefined &&
    !(draft.seeking === 'other' && draft.seekingNote.trim() === '')
  )
}

export function choicesFor(intent: Intent): readonly Choice[] {
  return intent === 'post' ? POST_CHOICES : BROWSE_CHOICES
}

export function choose(draft: PauseDraft, choice: Choice, now: number): PauseDraft | null {
  if (!canChoose(draft, now)) return null
  if (!choicesFor(draft.intent).includes(choice)) return null
  return { ...draft, choice, step: 'after' }
}

export function setAfterScore(draft: PauseDraft, score: number): PauseDraft {
  if (draft.step !== 'after') return draft
  if (!isAwarenessScore(score)) return draft
  return { ...draft, awarenessAfter: score }
}

export function isReadyToCommit(draft: PauseDraft): boolean {
  return draft.step === 'after' && draft.choice !== undefined && draft.awarenessBefore !== undefined && draft.seeking !== undefined
}

/** Browse pauses only. Posting has its own counts, and misses are stored apart. */
export function isBrowsePause(event: PauseEvent): boolean {
  return event.intent === 'browse'
}

const STEPS: readonly PauseStep[] = ['arrive', 'score', 'seeking', 'choose', 'after']

/** A draft older than this is not offered back: the moment it described has passed. */
export const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000

/**
 * Rebuilds a draft from stored JSON. Anything malformed returns null instead of a half-valid
 * draft, so a damaged or foreign value can never reach commitPause.
 */
export function normalizeDraft(raw: unknown): PauseDraft | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null
  const item = raw as Record<string, unknown>
  if (typeof item.id !== 'string' || item.id === '') return null
  if (item.intent !== 'browse' && item.intent !== 'post') return null
  if (typeof item.triggerId !== 'string' || item.triggerId === '') return null
  if (typeof item.startedAt !== 'number' || !Number.isFinite(item.startedAt) || item.startedAt <= 0) return null
  const step = STEPS.includes(item.step as PauseStep) ? (item.step as PauseStep) : 'score'
  const intent = item.intent
  const choices = choicesFor(intent)
  const draft: PauseDraft = {
    id: item.id,
    intent,
    triggerId: item.triggerId,
    startedAt: item.startedAt,
    step,
    minSeconds: typeof item.minSeconds === 'number' && item.minSeconds >= 0 ? item.minSeconds : 10,
    startedWithArrive: item.startedWithArrive === true,
    seekingNote: typeof item.seekingNote === 'string' ? item.seekingNote.slice(0, 160) : '',
    finish: typeof item.finish === 'string' ? item.finish.slice(0, 80) : '',
  }
  if (typeof item.awarenessBefore === 'number' && isAwarenessScore(item.awarenessBefore)) draft.awarenessBefore = item.awarenessBefore
  if (typeof item.feelingBefore === 'string' && clip(item.feelingBefore, 40)) {
    draft.feelingBefore = clip(item.feelingBefore, 40)
  }
  if (typeof item.seeking === 'string' && item.seeking !== '') draft.seeking = item.seeking as Impulse
  if (typeof item.choice === 'string' && choices.includes(item.choice as Choice)) draft.choice = item.choice as Choice
  if (typeof item.awarenessAfter === 'number' && isAwarenessScore(item.awarenessAfter)) draft.awarenessAfter = item.awarenessAfter
  if (typeof item.feelingAfter === 'string' && clip(item.feelingAfter, 40)) {
    draft.feelingAfter = clip(item.feelingAfter, 40)
  }
  if (typeof item.whyPastCap === 'string' && clip(item.whyPastCap, 40)) {
    draft.whyPastCap = clip(item.whyPastCap, 40)
  }
  // A step that needs an answer the draft does not have falls back to the step that asks for it.
  if (draft.step === 'after' && !draft.choice) draft.step = 'choose'
  if ((draft.step === 'choose' || draft.step === 'after') && !draft.seeking) draft.step = 'seeking'
  if (draft.step !== 'arrive' && draft.step !== 'score' && !draft.awarenessBefore) draft.step = 'score'
  return draft
}

/** Worth offering back: the person already gave at least one answer. An untouched start is just dropped. */
export function isRecoverable(draft: PauseDraft, now: number): boolean {
  if (now - draft.startedAt > DRAFT_MAX_AGE_MS) return false
  return draft.awarenessBefore !== undefined || Boolean(draft.feelingBefore)
}
