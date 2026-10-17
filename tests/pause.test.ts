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

  it('supports stepping back through goBack until the first step', () => {
    // With arrive step
    const draftArrive = createDraft({ ...base, completedPauses: 0 })
    expect(draftArrive.step).toBe('arrive')
    expect(goBack(draftArrive).step).toBe('arrive') // first step cannot go back further

    let draft = advanceFromArrive(draftArrive) // 'score'
    expect(draft.step).toBe('score')
    expect(goBack(draft).step).toBe('arrive')

    draft = setScore(draft, 7) // 'seeking'
    expect(draft.step).toBe('seeking')
    expect(goBack(draft).step).toBe('score')

    draft = setSeeking(draft, 'boredom') // 'choose'
    expect(draft.step).toBe('choose')
    expect(goBack(draft).step).toBe('seeking')

    const chosen = choose(draft, 'close', base.now + 15_000)
    expect(chosen?.step).toBe('after')
    if (chosen) {
      const backFromAfter = goBack(chosen)
      expect(backFromAfter.step).toBe('choose')
      expect(backFromAfter.choice).toBeUndefined()
    }

    // Without arrive step (first step is score)
    const draftNoArrive = createDraft({ ...base, completedPauses: 5 })
    expect(draftNoArrive.step).toBe('score')
    expect(goBack(draftNoArrive).step).toBe('score') // first step
  })

  it('renders accessibility attributes on timer, score grid, and choice groups', async () => {
    const { pauseScreen } = await import('../src/ui/screens/pause')
    const { emptyDatabase } = await import('../src/store/defaults')
    const { en } = await import('../src/i18n/en')
    const { emptyForm } = await import('../src/ui/model')

    const db = emptyDatabase()
    db.triggers = [{ id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-17' }]
    const draft = createDraft({ ...base, completedPauses: 5 })
    const scoreDraft = setScore(draft, 5)

    const viewBase = {
      db,
      dict: en,
      now: base.now,
      toast: null,
      flash: null,
      confirm: null,
      installReady: false,
      presets: [],
      customs: [],
      form: emptyForm(),
      fields: {},
    }

    // Score step has role="group" and aria-label
    const scoreHtml = pauseScreen({
      ...viewBase,
      route: { name: 'pause', intent: 'browse', triggerId: 'instagram' },
      pause: draft,
    })
    expect(scoreHtml).toContain('role="group"')
    expect(scoreHtml).toContain(`aria-label="${en.pause.scoreLabel}"`)

    // Seeking step has chips group
    const seekingHtml = pauseScreen({
      ...viewBase,
      route: { name: 'pause', intent: 'browse', triggerId: 'instagram' },
      pause: scoreDraft,
    })
    expect(seekingHtml).toContain('class="chips" role="group"')
    expect(seekingHtml).toContain(`aria-label="${en.pause.seeking}"`)

    // Choose step has breath timer with aria-live="polite" and role="group" on choice-list
    const chooseDraft = setSeeking(scoreDraft, 'boredom')
    const chooseHtml = pauseScreen({
      ...viewBase,
      route: { name: 'pause', intent: 'browse', triggerId: 'instagram' },
      pause: chooseDraft,
    })
    expect(chooseHtml).toContain('data-breath-note role="timer" aria-live="polite"')
    expect(chooseHtml).toContain('class="choice-list" role="group"')
    expect(chooseHtml).toContain(`aria-label="${en.pause.choose}"`)
  })
})
