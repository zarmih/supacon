import type { AwarenessScore, Choice, Impulse, Intent, PauseEvent } from './types'
import { isAwarenessScore } from './types'

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
  seeking?: Impulse
  seekingNote: string
  choice?: Choice
  awarenessAfter?: AwarenessScore
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

export function confirmSeeking(draft: PauseDraft): PauseDraft {
  if (!draft.seeking) return draft
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
    draft.seeking !== undefined
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
