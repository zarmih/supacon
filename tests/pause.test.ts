import { describe, expect, it } from 'vitest'
import {
  advanceFromArrive,
  breathDone,
  canChoose,
  choose,
  confirmSeeking,
  createDraft,
  goBack,
  setScore,
  setSeeking,
} from '../src/domain/pause'

const base = {
  id: 'p1',
  intent: 'browse' as const,
  triggerId: 'instagram',
  now: 1_000_000,
  minSeconds: 10,
}

describe('pause ritual', () => {
  it('starts on the stop screen for the first pauses and on the score after that', () => {
    expect(createDraft({ ...base, completedPauses: 0 }).step).toBe('arrive')
    expect(createDraft({ ...base, completedPauses: 2 }).step).toBe('arrive')
    expect(createDraft({ ...base, completedPauses: 3 }).step).toBe('score')
    expect(createDraft({ ...base, intent: 'post', completedPauses: 0 }).step).toBe('score')
  })

  it('refuses the choice until the breath and both answers are done', () => {
    let draft = advanceFromArrive(createDraft({ ...base, completedPauses: 0 }))
    draft = setScore(draft, 4)
    draft = setSeeking(draft, 'boredom')
    expect(canChoose(draft, base.now + 4_000)).toBe(false)
    expect(choose(draft, 'open', base.now + 4_000)).toBeNull()
    expect(breathDone(draft, base.now + 10_000)).toBe(true)
    const chosen = choose(draft, 'postpone', base.now + 10_000)
    expect(chosen?.step).toBe('after')
    expect(chosen?.choice).toBe('postpone')
  })

  it('keeps a custom seeking on the note step until it is confirmed', () => {
    let draft = setScore(createDraft({ ...base, completedPauses: 5 }), 8)
    draft = setSeeking(draft, 'other')
    expect(draft.step).toBe('seeking')
    draft = confirmSeeking(draft)
    expect(draft.step).toBe('choose')
    draft = goBack(draft)
    expect(draft.step).toBe('seeking')
  })

  it('does not treat a post motive as a browse choice', () => {
    let draft = setScore(createDraft({ ...base, intent: 'post', completedPauses: 0 }), 5)
    draft = setSeeking(draft, 'seen')
    expect(draft.step).toBe('choose')
    expect(choose(draft, 'open', base.now + 20_000)).toBeNull()
    expect(choose(draft, 'dont-post', base.now + 20_000)?.choice).toBe('dont-post')
  })
})
