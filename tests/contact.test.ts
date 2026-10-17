import { describe, expect, it } from 'vitest'
import { contactCard, todayScreen } from '../src/ui/screens/today'
import { emptyDatabase } from '../src/store/defaults'
import { dictionary } from '../src/i18n'
import type { Database, DayMark } from '../src/domain/types'
import type { ViewModel } from '../src/ui/model'

const dictRu = dictionary('ru')
const dictEn = dictionary('en')

function createMockView(db: Database, now: number, dict = dictRu): ViewModel {
  return {
    db,
    route: { name: 'today' },
    now,
    pause: null,
    toast: null,
    flash: null,
    confirm: null,
    installReady: false,
    presets: ['instagram', 'youtube'],
    customs: [],
    form: { unlogged: 0, pendingEnd: false },
    fields: {},
    dict,
  }
}

describe('Contrast Real Contact Card', () => {

  describe('contactCard rendering', () => {
    it('renders unanswered state with question, cue and yes/no buttons (RU)', () => {
      const html = contactCard(dictRu, undefined)

      expect(html).toContain('contact-card')
      expect(html).toContain('data-card="contactCard"')
      expect(html).toContain('Случился ли сегодня хотя бы один живой разговор?')
      expect(html).toContain('Сравни ощущение от живого контакта с лайками: по длительности и глубине.')
      expect(html).toContain('data-action="contact" data-value="yes"')
      expect(html).toContain('data-action="contact" data-value="no"')
      expect(html).not.toContain('id="contact-note"')
    })

    it('renders unanswered state with question, cue and yes/no buttons (EN)', () => {
      const html = contactCard(dictEn, undefined)

      expect(html).toContain('One real conversation today?')
      expect(html).toContain('Compare the feeling of real contact to likes: duration and depth.')
      expect(html).toContain('data-action="contact" data-value="yes"')
      expect(html).toContain('data-action="contact" data-value="no"')
      expect(html).not.toContain('id="contact-note"')
    })

    it('renders "Yes" state with note textarea (up to 180 chars) and save button', () => {
      const mark: DayMark = {
        date: '2026-10-15',
        realContact: true,
        contactNote: 'Тёплый спокойный разговор с другом за чаем',
      }
      const html = contactCard(dictRu, mark)

      expect(html).toContain('Живой разговор был.')
      expect(html).toContain('id="contact-note"')
      expect(html).toContain('name="contactNote"')
      expect(html).toContain('maxlength="180"')
      expect(html).toContain('Чем отличалось ощущение?')
      expect(html).toContain('Тёплый спокойный разговор с другом за чаем')
      expect(html).toContain('data-action="save-contact-note"')
      expect(html).toContain('data-action="contact" data-value="no"')
    })

    it('renders "No" state calmly with no pressure or guilt', () => {
      const mark: DayMark = {
        date: '2026-10-15',
        realContact: false,
        contactNote: '',
      }
      const html = contactCard(dictRu, mark)

      expect(html).toContain('Не сегодня. Этот ответ тоже считается.')
      expect(html).not.toContain('id="contact-note"')
      expect(html).toContain('data-action="contact" data-value="yes"')
    })
  })

  describe('todayScreen integration in contrast phase', () => {
    it('shows contactCard on Day 5 (contrast phase)', () => {
      // Started 4 days ago -> today is day 5 (contrast)
      const now = new Date('2026-10-15T12:00:00Z').getTime()
      const db: Database = {
        ...emptyDatabase(),
        startedOn: '2026-10-11',
      }
      const view = createMockView(db, now, dictRu)
      const html = todayScreen(view)
      expect(html).toContain('data-card="contactCard"')
      expect(html).toContain('Случился ли сегодня хотя бы один живой разговор?')
    })

    it('shows contactCard on Day 6 (contrast phase)', () => {
      // Started 5 days ago -> today is day 6 (contrast)
      const now = new Date('2026-10-16T12:00:00Z').getTime()
      const db: Database = {
        ...emptyDatabase(),
        startedOn: '2026-10-11',
      }
      const view = createMockView(db, now, dictRu)
      const html = todayScreen(view)
      expect(html).toContain('data-card="contactCard"')
    })

    it('does NOT show contactCard on Day 1 (calibration phase)', () => {
      const now = new Date('2026-10-11T12:00:00Z').getTime()
      const db: Database = {
        ...emptyDatabase(),
        startedOn: '2026-10-11',
      }
      const view = createMockView(db, now, dictRu)
      const html = todayScreen(view)
      expect(html).not.toContain('data-card="contactCard"')
    })

    it('does NOT show contactCard on Day 3 (boundary phase)', () => {
      const now = new Date('2026-10-13T12:00:00Z').getTime()
      const db: Database = {
        ...emptyDatabase(),
        startedOn: '2026-10-11',
      }
      const view = createMockView(db, now, dictRu)
      const html = todayScreen(view)
      expect(html).not.toContain('data-card="contactCard"')
    })
  })
})
