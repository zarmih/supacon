import { describe, expect, it } from 'vitest'
import { logMiss } from '../src/store/mutate'
import { emptyDatabase } from '../src/store/defaults'
import { en } from '../src/i18n/en'
import { ru } from '../src/i18n/ru'
import { emptyForm } from '../src/ui/model'
import { eveningScreen, missScreen } from '../src/ui/screens/journal'
import { todayScreen, eveningReview } from '../src/ui/screens/today'

describe('missed pause UX', () => {
  it('logMiss persists miss with optional awareness, seeking, and notes capped at 180 chars', () => {
    let db = emptyDatabase()
    db.triggers = [{ id: 'insta', label: 'Instagram', enabled: true, preset: true, createdAt: '2026-10-17' }]

    const now = new Date('2026-10-17T14:30:00Z')
    const longNote = 'A'.repeat(250)
    const next = logMiss(db, {
      triggerId: 'insta',
      awareness: 3,
      seeking: 'boredom',
      note: longNote,
      now,
    })

    expect(next).not.toBeNull()
    expect(next!.misses).toHaveLength(1)
    const saved = next!.misses[0]!
    expect(saved.triggerId).toBe('insta')
    expect(saved.awareness).toBe(3)
    expect(saved.seeking).toBe('boredom')
    expect(saved.date).toBe('2026-10-17')
    expect(saved.note).toHaveLength(180)
  })

  it('missScreen presents calm tone, trigger chips, optional score/seeking, and 180-char note', () => {
    const db = emptyDatabase()
    db.triggers = [
      { id: 'insta', label: 'Instagram', enabled: true, preset: true, createdAt: '2026-10-17' },
      { id: 'telegram', label: 'Telegram', enabled: false, preset: true, createdAt: '2026-10-17' },
    ]

    const htmlRu = missScreen({
      db,
      dict: ru,
      route: { name: 'miss' },
      now: Date.now(),
      pause: null,
      toast: null,
      flash: null,
      confirm: null,
      installReady: false,
      presets: [],
      customs: [],
      form: emptyForm(),
      fields: { trigger: 'insta' },
    })

    expect(htmlRu).toContain('Пропуск — часть практики. Запиши то, что вспомнишь, или просто зафиксируй факт.')
    expect(htmlRu).toContain('data-action="miss-trigger"')
    expect(htmlRu).toContain('data-value="insta"')
    expect(htmlRu).toContain('is-on')
    expect(htmlRu).toContain('data-action="form-score"')
    expect(htmlRu).toContain('data-action="miss-seeking"')
    expect(htmlRu).toContain('maxlength="180"')
    expect(htmlRu).toContain('data-action="miss-save"')

    const htmlEn = missScreen({
      db,
      dict: en,
      route: { name: 'miss' },
      now: Date.now(),
      pause: null,
      toast: null,
      flash: null,
      confirm: null,
      installReady: false,
      presets: [],
      customs: [],
      form: emptyForm(),
      fields: {},
    })

    expect(htmlEn).toContain('A miss is part of the practice.')
    expect(htmlEn).toContain('Optional')
  })

  it('todayScreen displays eveningReview card and link with count of today logged misses', () => {
    let db = emptyDatabase()
    db.triggers = [{ id: 'insta', label: 'Instagram', enabled: true, preset: true, createdAt: '2026-10-17' }]
    const today = '2026-10-17'
    const now = new Date(`${today}T19:00:00Z`).getTime()

    // Add 2 logged misses for today
    db.misses.push(
      { id: 'm1', date: today, at: `${today}T10:00:00Z`, triggerId: 'insta', note: '' },
      { id: 'm2', date: today, at: `${today}T15:00:00Z`, triggerId: 'insta', note: '' },
    )

    const html = todayScreen({
      db,
      dict: ru,
      route: { name: 'today' },
      now,
      pause: null,
      toast: null,
      flash: null,
      confirm: null,
      installReady: false,
      presets: [],
      customs: [],
      form: emptyForm(),
      fields: {},
    })

    expect(html).toContain('data-card="eveningReview"')
    expect(html).toContain('Записано 2 пропуска сегодня')
    expect(html).toContain('data-card="eveningReviewLink"')
  })

  it('eveningReview function renders card when evening or misses are present', () => {
    const card = eveningReview(ru, undefined, 3, new Date('2026-10-17T12:00:00Z').getTime())
    expect(card).toContain('evening-review')
    expect(card).toContain('Записано 3 пропуска сегодня')
  })

  it('eveningScreen clarifies unlogged misses and displays logged misses breakdown', () => {
    let db = emptyDatabase()
    const today = '2026-10-17'
    const now = new Date(`${today}T20:00:00Z`).getTime()
    db.misses.push({ id: 'm1', date: today, at: `${today}T10:00:00Z`, triggerId: 'insta', note: '' })

    const html = eveningScreen({
      db,
      dict: ru,
      route: { name: 'evening' },
      now,
      pause: null,
      toast: null,
      flash: null,
      confirm: null,
      installReady: false,
      presets: [],
      customs: [],
      form: { unlogged: 2, pendingEnd: false },
      fields: {},
    })

    expect(html).toContain('Записан 1 пропуск сегодня.')
    expect(html).toContain('Счётчик ниже — только для дополнительных пауз')
    expect(html).toContain('Всего пропусков за сегодня: 3 (1 записано + 2 неотмеченных).')
  })
})
