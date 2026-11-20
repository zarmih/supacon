import { describe, expect, it } from 'vitest'
import {
  advanceFromArrive,
  breathDone,
  breathProgress,
  canChoose,
  choose,
  confirmSeeking,
  createDraft,
  goBack,
  setScore,
  setSeeking,
  setSeekingNote,
} from '../src/domain/pause'
import { PAUSE_SECONDS } from '../src/ui/screens/more'
import { ru } from '../src/i18n/ru'

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
    draft = confirmSeeking(setSeekingNote(draft, 'a reply I am waiting for'))
    expect(draft.step).toBe('choose')
    draft = goBack(draft)
    expect(draft.step).toBe('seeking')
  })

  it('does not accept "Something else" without a name', () => {
    let draft = setScore(createDraft({ ...base, completedPauses: 5 }), 4)
    draft = setSeeking(draft, 'other')
    expect(confirmSeeking(draft).step).toBe('seeking')
    expect(confirmSeeking(setSeekingNote(draft, '   \t ')).step).toBe('seeking')
    const named = confirmSeeking(setSeekingNote(draft, ' boredom at the desk '))
    expect(named.step).toBe('choose')
    expect(canChoose(named, base.now + 20_000)).toBe(true)
  })

  it('does not allow a choice for an unnamed "Something else"', () => {
    let draft = setScore(createDraft({ ...base, completedPauses: 5 }), 4)
    draft = setSeeking(draft, 'other')
    const forced = { ...draft, step: 'choose' as const }
    expect(canChoose(forced, base.now + 20_000)).toBe(false)
    expect(choose(forced, 'open', base.now + 20_000)).toBeNull()
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

  describe('in-pause breath duration control', () => {
    it('renders the breath toggle button in the header across all ritual steps', async () => {
      const { pauseScreen } = await import('../src/ui/screens/pause')
      const { emptyDatabase } = await import('../src/store/defaults')
      const { en } = await import('../src/i18n/en')
      const { emptyForm } = await import('../src/ui/model')

      const db = emptyDatabase()
      db.triggers = [{ id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-17' }]
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

      // Step arrive
      const arriveDraft = createDraft({ ...base, completedPauses: 0, minSeconds: 10 })
      const arriveHtml = pauseScreen({ ...viewBase, route: { name: 'pause', intent: 'browse', triggerId: 'instagram' }, pause: arriveDraft })
      expect(arriveHtml).toContain('data-action="toggle-breath"')
      expect(arriveHtml).toContain('10s breath')

      // Step score
      const scoreDraft = setScore(createDraft({ ...base, completedPauses: 5, minSeconds: 5 }), 4)
      const scoreHtml = pauseScreen({ ...viewBase, route: { name: 'pause', intent: 'browse', triggerId: 'instagram' }, pause: scoreDraft })
      expect(scoreHtml).toContain('data-action="toggle-breath"')
      expect(scoreHtml).toContain('5s breath')

      // Step seeking
      const seekingDraft = setScore(createDraft({ ...base, completedPauses: 5, minSeconds: 15 }), 6)
      const seekingHtml = pauseScreen({ ...viewBase, route: { name: 'pause', intent: 'browse', triggerId: 'instagram' }, pause: seekingDraft })
      expect(seekingHtml).toContain('data-action="toggle-breath"')
      expect(seekingHtml).toContain('15s breath')

      // Step choose
      const chooseDraft = setSeeking(scoreDraft, 'boredom')
      const chooseHtml = pauseScreen({ ...viewBase, route: { name: 'pause', intent: 'browse', triggerId: 'instagram' }, pause: chooseDraft })
      expect(chooseHtml).toContain('data-action="toggle-breath"')
      expect(chooseHtml).toContain('5s breath')
    })

    it('formats breath toggle labels correctly in English and Russian', async () => {
      const { pauseScreen } = await import('../src/ui/screens/pause')
      const { emptyDatabase } = await import('../src/store/defaults')
      const { en } = await import('../src/i18n/en')
      const { emptyForm } = await import('../src/ui/model')

      const db = emptyDatabase()
      db.triggers = [{ id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-17' }]
      const viewBase = {
        db,
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

      for (const sec of [5, 10, 15]) {
        expect(en.pause.breathToggle(sec)).toBe(`${sec}s breath`)
        expect(ru.pause.breathToggle(sec)).toBe(`${sec}с дыхание`)

        const draftEn = createDraft({ ...base, completedPauses: 5, minSeconds: sec })
        const htmlEn = pauseScreen({ ...viewBase, dict: en, route: { name: 'pause', intent: 'browse', triggerId: 'instagram' }, pause: draftEn })
        expect(htmlEn).toContain(`${sec}s breath`)

        const draftRu = createDraft({ ...base, completedPauses: 5, minSeconds: sec })
        const htmlRu = pauseScreen({ ...viewBase, dict: ru, route: { name: 'pause', intent: 'browse', triggerId: 'instagram' }, pause: draftRu })
        expect(htmlRu).toContain(`${sec}с дыхание`)
      }
    })

    it('cycles duration correctly through PAUSE_SECONDS (5 -> 10 -> 15 -> 5)', () => {
      expect(PAUSE_SECONDS).toEqual([5, 10, 15])

      const cycle = (current: number) => {
        const currentIndex = PAUSE_SECONDS.indexOf(current)
        const nextIndex = (currentIndex + 1) % PAUSE_SECONDS.length
        return PAUSE_SECONDS[nextIndex]
      }

      expect(cycle(5)).toBe(10)
      expect(cycle(10)).toBe(15)
      expect(cycle(15)).toBe(5)

      // Fallback for unexpected initial value: index -1 -> nextIndex 0 -> 5
      expect(cycle(999)).toBe(5)
    })

    it('dynamically adapts pacing checks (breathDone, breathProgress, canChoose) when minSeconds changes in real-time', () => {
      const now = base.now
      let draft = createDraft({ ...base, completedPauses: 5, minSeconds: 10 })
      draft = setScore(draft, 4)
      draft = setSeeking(draft, 'boredom')

      // At 6 seconds elapsed:
      const at6s = now + 6_000
      expect(breathDone(draft, at6s)).toBe(false)
      expect(breathProgress(draft, at6s)).toBeCloseTo(0.6)
      expect(canChoose(draft, at6s)).toBe(false)

      // Adjust minSeconds to 5s in real-time without resetting draft
      const shortenedDraft = { ...draft, minSeconds: 5 }
      expect(breathDone(shortenedDraft, at6s)).toBe(true)
      expect(breathProgress(shortenedDraft, at6s)).toBe(1)
      expect(canChoose(shortenedDraft, at6s)).toBe(true)

      // Adjust minSeconds to 15s in real-time
      const lengthenedDraft = { ...draft, minSeconds: 15 }
      expect(breathDone(lengthenedDraft, at6s)).toBe(false)
      expect(breathProgress(lengthenedDraft, at6s)).toBeCloseTo(6 / 15)
      expect(canChoose(lengthenedDraft, at6s)).toBe(false)
    })
  })
})
