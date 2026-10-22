import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import {
  advanceFromArrive,
  breathDone,
  breathProgress,
  canChoose,
  choicesFor,
  choose,
  confirmSeeking,
  createDraft,
  goBack,
  isBrowsePause,
  isReadyToCommit,
  setAfterScore,
  setFinish,
  setScore,
  setSeeking,
  setSeekingNote,
  type PauseDraft,
  type PauseStep,
} from '../src/domain/pause'
import { POST_MOTIVES, SEEKINGS, type Choice, type Impulse, type Intent } from '../src/domain/types'
import { pauseEvent } from './helpers/factory'

const T0 = 1_000_000

function draft(intent: Intent = 'browse', completedPauses = 5, minSeconds = 10): PauseDraft {
  return createDraft({ id: 'd', intent, triggerId: 't', now: T0, minSeconds, completedPauses })
}

function atStep(step: PauseStep, intent: Intent = 'browse'): PauseDraft {
  const base = draft(intent, 0)
  const seeking: Impulse = intent === 'browse' ? 'boredom' : 'seen'
  switch (step) {
    case 'arrive':
      return intent === 'browse' ? base : { ...base, step: 'arrive', startedWithArrive: true }
    case 'score':
      return advanceFromArrive(base).step === 'score' ? advanceFromArrive(base) : base
    case 'seeking':
      return setScore(atStep('score', intent), 5)
    case 'choose':
      return setSeeking(atStep('seeking', intent), seeking)
    case 'after':
      return choose(atStep('choose', intent), intent === 'browse' ? 'close' : 'dont-post', T0 + 60_000)!
  }
}

describe('pause draft creation', () => {
  it('starts on arrive for the first three browse pauses only, never for posts', () => {
    expect(draft('browse', 0).step).toBe('arrive')
    expect(draft('browse', 2).step).toBe('arrive')
    expect(draft('browse', 3).step).toBe('score')
    expect(draft('post', 0).step).toBe('score')
    expect(draft('post', 0).startedWithArrive).toBe(false)
  })

  it('clamps a negative breath length to zero', () => {
    const d = draft('browse', 5, -10)
    expect(d.minSeconds).toBe(0)
    expect(breathDone(d, T0)).toBe(true)
    expect(breathProgress(d, T0)).toBe(1)
  })

  it('reports breath progress clamped to [0, 1], even if the clock goes backwards', () => {
    const d = draft()
    expect(breathProgress(d, T0 - 5_000)).toBe(0)
    expect(breathProgress(d, T0 + 5_000)).toBe(0.5)
    expect(breathProgress(d, T0 + 50_000)).toBe(1)
    expect(breathDone(d, T0 + 9_999)).toBe(false)
    expect(breathDone(d, T0 + 10_000)).toBe(true)
  })
})

describe('pause state machine: valid transitions', () => {
  it('walks arrive → score → seeking → choose → after for a browse pause', () => {
    let d = draft('browse', 0)
    d = advanceFromArrive(d)
    expect(d.step).toBe('score')
    d = setScore(d, 4)
    expect(d).toMatchObject({ step: 'seeking', awarenessBefore: 4 })
    d = setSeeking(d, 'validation')
    expect(d.step).toBe('choose')
    expect(canChoose(d, T0 + 10_000)).toBe(true)
    const after = choose(d, 'open', T0 + 10_000)!
    expect(after).toMatchObject({ step: 'after', choice: 'open' })
    expect(isReadyToCommit(after)).toBe(true)
    expect(setAfterScore(after, 8).awarenessAfter).toBe(8)
  })

  it('lets the score be changed again from seeking and choose', () => {
    const fromChoose = setScore(atStep('choose'), 9)
    expect(fromChoose).toMatchObject({ step: 'seeking', awarenessBefore: 9 })
    const fromSeeking = setScore(atStep('seeking'), 2)
    expect(fromSeeking.awarenessBefore).toBe(2)
  })

  it('keeps "other" on the seeking step for browse until it is confirmed', () => {
    const d = setSeeking(atStep('seeking'), 'other')
    expect(d.step).toBe('seeking')
    expect(confirmSeeking(d).step).toBe('choose')
    expect(confirmSeeking(atStep('score')).step).toBe('score')
  })

  it('moves straight on for post intents, including their motives', () => {
    for (const motive of POST_MOTIVES) {
      expect(setSeeking(atStep('seeking', 'post'), motive).step).toBe('choose')
    }
  })

  it('goes back one step at a time and clears the choice when leaving after', () => {
    const after = atStep('after')
    const back1 = goBack(after)
    expect(back1).toMatchObject({ step: 'choose', choice: undefined })
    expect(goBack(back1).step).toBe('seeking')
    expect(goBack(goBack(back1)).step).toBe('score')
    expect(goBack(goBack(goBack(back1))).step).toBe('arrive')
  })

  it('cuts the free-text note to 160 chars and the finish line to 80', () => {
    const d = atStep('choose')
    expect(setSeekingNote(d, 'x'.repeat(500)).seekingNote).toHaveLength(160)
    expect(setFinish(d, 'y'.repeat(500)).finish).toHaveLength(80)
    expect(setFinish(d, '🙂'.repeat(10)).finish).toBe('🙂'.repeat(10))
  })

  it('offers browse and post choices separately', () => {
    expect(choicesFor('browse')).toEqual(['open', 'postpone', 'close'])
    expect(choicesFor('post')).toEqual(['post', 'draft', 'dont-post'])
  })
})

describe('pause state machine: invalid transitions are no-ops', () => {
  it('advanceFromArrive does nothing outside arrive', () => {
    for (const step of ['score', 'seeking', 'choose', 'after'] as const) {
      const d = atStep(step)
      expect(advanceFromArrive(d)).toBe(d)
    }
  })

  it('setScore refuses non-scores and the arrive/after steps', () => {
    const score = atStep('score')
    for (const bad of [0, 11, -1, 2.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(setScore(score, bad)).toBe(score)
    }
    const arrive = draft('browse', 0)
    expect(setScore(arrive, 5)).toBe(arrive)
    const after = atStep('after')
    expect(setScore(after, 5)).toBe(after)
  })

  it('setSeeking refuses arrive, score and after', () => {
    for (const step of ['arrive', 'score', 'after'] as const) {
      const d = atStep(step)
      expect(setSeeking(d, 'habit')).toBe(d)
    }
  })

  it('goBack from the first step stays put', () => {
    const arrive = draft('browse', 0)
    expect(goBack(arrive)).toBe(arrive)
    const scoreFirst = draft('browse', 10)
    expect(goBack(scoreFirst)).toBe(scoreFirst)
  })

  it('choose refuses before the breath ends, outside choose, and a choice of the other intent', () => {
    const d = atStep('choose')
    expect(choose(d, 'open', T0 + 1_000)).toBeNull()
    expect(choose(d, 'post', T0 + 60_000)).toBeNull()
    expect(choose(atStep('choose', 'post'), 'open', T0 + 60_000)).toBeNull()
    expect(choose(atStep('seeking'), 'close', T0 + 60_000)).toBeNull()
    const missingScore: PauseDraft = { ...d, awarenessBefore: undefined }
    expect(canChoose(missingScore, T0 + 60_000)).toBe(false)
  })

  it('setAfterScore only works on after and only with a real score', () => {
    const choosing = atStep('choose')
    expect(setAfterScore(choosing, 5)).toBe(choosing)
    const after = atStep('after')
    expect(setAfterScore(after, 0)).toBe(after)
    expect(isReadyToCommit(choosing)).toBe(false)
  })

  it('only browse events count as browse pauses', () => {
    expect(isBrowsePause(pauseEvent({ intent: 'browse' }))).toBe(true)
    expect(isBrowsePause(pauseEvent({ intent: 'post', choice: 'post' }))).toBe(false)
  })
})

type Action =
  | { kind: 'arrive' }
  | { kind: 'score'; value: number }
  | { kind: 'seeking'; value: Impulse }
  | { kind: 'confirm' }
  | { kind: 'back' }
  | { kind: 'choose'; value: Choice; dt: number }
  | { kind: 'after'; value: number }
  | { kind: 'note'; value: string }

const actionArb: fc.Arbitrary<Action> = fc.oneof(
  fc.constant<Action>({ kind: 'arrive' }),
  fc.integer({ min: -2, max: 12 }).map<Action>((value) => ({ kind: 'score', value })),
  fc.constantFrom<Impulse>(...SEEKINGS, ...POST_MOTIVES).map<Action>((value) => ({ kind: 'seeking', value })),
  fc.constant<Action>({ kind: 'confirm' }),
  fc.constant<Action>({ kind: 'back' }),
  fc
    .record({
      value: fc.constantFrom<Choice>('open', 'postpone', 'close', 'post', 'draft', 'dont-post'),
      dt: fc.integer({ min: 0, max: 30_000 }),
    })
    .map<Action>(({ value, dt }) => ({ kind: 'choose', value, dt })),
  fc.integer({ min: -2, max: 12 }).map<Action>((value) => ({ kind: 'after', value })),
  fc.string({ maxLength: 300 }).map<Action>((value) => ({ kind: 'note', value })),
)

describe('pause state machine: model-based invariants (fast-check)', () => {
  it('never reaches an inconsistent draft from any action sequence', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<Intent>('browse', 'post'),
        fc.integer({ min: 0, max: 5 }),
        fc.array(actionArb, { maxLength: 40 }),
        (intent, completed, actions) => {
          let d = createDraft({ id: 'x', intent, triggerId: 't', now: T0, minSeconds: 10, completedPauses: completed })
          for (const action of actions) {
            const before = d
            switch (action.kind) {
              case 'arrive':
                d = advanceFromArrive(d)
                break
              case 'score':
                d = setScore(d, action.value)
                break
              case 'seeking':
                d = setSeeking(d, action.value)
                break
              case 'confirm':
                d = confirmSeeking(d)
                break
              case 'back':
                d = goBack(d)
                break
              case 'choose': {
                const allowed = canChoose(d, T0 + action.dt) && choicesFor(d.intent).includes(action.value)
                const next = choose(d, action.value, T0 + action.dt)
                expect(next !== null).toBe(allowed)
                if (next) d = next
                break
              }
              case 'after':
                d = setAfterScore(d, action.value)
                break
              case 'note':
                d = setSeekingNote(d, action.value)
                expect(d.seekingNote.length).toBeLessThanOrEqual(160)
                break
            }
            // Identity fields never change.
            expect(d.id).toBe(before.id)
            expect(d.intent).toBe(intent)
            // arrive is reachable only when the draft started there.
            if (d.step === 'arrive') expect(d.startedWithArrive).toBe(true)
            // After a choice, everything needed to commit is present and legal.
            if (d.step === 'after') {
              expect(d.choice).toBeDefined()
              expect(choicesFor(intent)).toContain(d.choice)
              expect(isReadyToCommit(d)).toBe(true)
            } else {
              expect(isReadyToCommit(d)).toBe(false)
            }
            if (d.step === 'choose') expect(d.awarenessBefore).toBeDefined()
            if (d.awarenessBefore !== undefined) {
              expect(Number.isInteger(d.awarenessBefore)).toBe(true)
              expect(d.awarenessBefore).toBeGreaterThanOrEqual(1)
              expect(d.awarenessBefore).toBeLessThanOrEqual(10)
            }
          }
        },
      ),
      { numRuns: 300 },
    )
  })
})
