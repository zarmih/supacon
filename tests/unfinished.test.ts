import { describe, expect, it, vi } from 'vitest'
import { dictionary } from '../src/i18n'
import { emptyDatabase } from '../src/store/defaults'
import type { PauseDraft } from '../src/domain/pause'
import type { ViewModel } from '../src/ui/model'
import { recoveryCard, remaining } from '../src/ui/screens/unfinished'
import { todayScreen } from '../src/ui/screens/today'

const NOW = new Date(2026, 9, 10, 12, 0, 0).getTime()

function createMockView(recovery: PauseDraft | null = null, dict = dictionary('en'), now = NOW): ViewModel {
  const db = emptyDatabase()
  db.triggers = [
    { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-10' },
  ]
  return {
    db,
    route: { name: 'today' },
    now,
    pause: null,
    recovery,
    toast: null,
    flash: null,
    confirm: null,
    installReady: false,
    presets: ['instagram'],
    customs: [],
    form: { unlogged: 0, pendingEnd: false },
    fields: {},
    dict,
  }
}

function sampleDraft(overrides: Partial<PauseDraft> = {}): PauseDraft {
  return {
    id: 'draft-1',
    intent: 'browse',
    triggerId: 'instagram',
    startedAt: NOW - 60 * 60 * 1000, // 1 hour ago
    step: 'score',
    minSeconds: 10,
    startedWithArrive: false,
    seekingNote: '',
    finish: '',
    ...overrides,
  }
}

describe('unfinished screen helpers & recovery card', () => {
  describe('remaining() calculation', () => {
    it('formats remaining time with implicit Date.now() when system time is set', () => {
      vi.setSystemTime(NOW)
      const startedAt = NOW - 1 * 60 * 60 * 1000 // 1 hour elapsed
      expect(remaining(startedAt)).toBe('23h 0m')

      const startedAt2 = NOW - (1 * 60 * 60 * 1000 + 30 * 60 * 1000) // 1h 30m elapsed
      expect(remaining(startedAt2)).toBe('22h 30m')
      vi.useRealTimers()
    })

    it('formats remaining time using an explicit now parameter', () => {
      // 0 time elapsed
      expect(remaining(NOW, NOW)).toBe('24h 0m')

      // 5 hours 15 minutes elapsed -> 18h 45m remaining
      const started5h15m = NOW - (5 * 3600 * 1000 + 15 * 60 * 1000)
      expect(remaining(started5h15m, NOW)).toBe('18h 45m')

      // 23 hours 59 minutes elapsed -> 0h 1m remaining
      const startedAlmost24h = NOW - (23 * 3600 * 1000 + 59 * 60 * 1000)
      expect(remaining(startedAlmost24h, NOW)).toBe('0h 1m')
    })

    it('clamps remaining time to 0h 0m when draft is expired', () => {
      // Exactly 24 hours elapsed
      const exactly24h = NOW - 24 * 3600 * 1000
      expect(remaining(exactly24h, NOW)).toBe('0h 0m')

      // 25 hours elapsed
      const overdue = NOW - 25 * 3600 * 1000
      expect(remaining(overdue, NOW)).toBe('0h 0m')

      // 100 hours elapsed
      const veryOld = NOW - 100 * 3600 * 1000
      expect(remaining(veryOld, NOW)).toBe('0h 0m')
    })

    it('clamps remaining time to 24h 0m if startedAt is in the future (clock skew)', () => {
      const future = NOW + 10 * 60 * 1000
      expect(remaining(future, NOW)).toBe('24h 0m')
    })
  })

  describe('recoveryCard() rendering', () => {
    it('returns an empty string when there is no recovery draft', () => {
      const view = createMockView(null)
      expect(recoveryCard(view)).toBe('')
    })

    it('renders the recovery card with expiration cue and action buttons', () => {
      const draft = sampleDraft({
        startedAt: NOW - (2 * 3600 * 1000 + 30 * 60 * 1000), // 2h 30m ago -> 21h 30m remaining
      })
      const view = createMockView(draft)
      const html = recoveryCard(view)

      expect(html).toContain('data-card="recovery"')
      expect(html).toContain('role="region"')
      expect(html).toContain('aria-labelledby="recovery-title"')
      expect(html).toContain('Expires in 21h 30m')
      expect(html).toContain('data-action="draft-resume"')
      expect(html).toContain('data-action="draft-discard"')
      expect(html).toContain('Instagram')
    })

    it('renders fallback custom trigger name when trigger is unknown', () => {
      const draft = sampleDraft({ triggerId: 'my-custom-app' })
      const view = createMockView(draft)
      const html = recoveryCard(view)

      expect(html).toContain('my-custom-app')
      expect(html).toContain('Expires in 23h 0m')
    })

    it('renders properly in Russian locale', () => {
      const dictRu = dictionary('ru')
      const draft = sampleDraft()
      const view = createMockView(draft, dictRu)
      const html = recoveryCard(view)

      expect(html).toContain(dictRu.unfinished.title)
      expect(html).toContain(dictRu.unfinished.resume)
      expect(html).toContain(dictRu.unfinished.discard)
      expect(html).toContain('Истекает через 23 ч 0 мин')
    })

    it('integrates seamlessly with todayScreen', () => {
      const draft = sampleDraft()
      const viewWithDraft = createMockView(draft)
      const viewWithoutDraft = createMockView(null)

      const htmlWith = todayScreen(viewWithDraft)
      expect(htmlWith).toContain('data-card="recovery"')
      expect(htmlWith).toContain('Expires in 23h 0m')

      const htmlWithout = todayScreen(viewWithoutDraft)
      expect(htmlWithout).not.toContain('data-card="recovery"')
      expect(htmlWithout).not.toContain('Expires in')
    })
  })
})
