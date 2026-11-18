import { describe, expect, it } from 'vitest'
import { filterJournalEvents, isJournalPeriod, periodDateRange, type JournalPeriod } from '../src/domain/journal'
import { addDays, localDate, startOfWeek } from '../src/domain/time'
import type { PauseEvent } from '../src/domain/types'
import { emptyDatabase } from '../src/store/defaults'
import { dictionary } from '../src/i18n'
import type { ViewModel } from '../src/ui/model'
import { pauseHistory } from '../src/ui/screens/journal'

function makeEvent(id: string, date: string, triggerId = 'instagram'): PauseEvent {
  return {
    id,
    at: `${date}T12:00:00.000Z`,
    date,
    intent: 'browse',
    triggerId,
    awarenessBefore: 5,
    seeking: 'boredom',
    seekingNote: '',
    choice: 'close',
    overLimit: false,
    elapsedSeconds: 10,
    dayNumber: 1,
    phase: 'calibration',
  }
}

describe('Journal Period Filtering Domain Logic', () => {
  it('identifies valid journal periods', () => {
    expect(isJournalPeriod('all')).toBe(true)
    expect(isJournalPeriod('this-week')).toBe(true)
    expect(isJournalPeriod('7d')).toBe(true)
    expect(isJournalPeriod('month')).toBe(false)
    expect(isJournalPeriod(null)).toBe(false)
  })

  it('calculates startOfWeek correctly for different days of the week', () => {
    // 2026-11-16 is Monday
    expect(startOfWeek('2026-11-16')).toBe('2026-11-16')
    // 2026-11-18 is Wednesday -> Monday was 2026-11-16
    expect(startOfWeek('2026-11-18')).toBe('2026-11-16')
    // 2026-11-22 is Sunday -> Monday was 2026-11-16
    expect(startOfWeek('2026-11-22')).toBe('2026-11-16')
  })

  it('determines date boundaries by local calendar day (not hardcoded Europe/Moscow)', () => {
    const today = '2026-11-19' // Thursday
    const rangeThisWeek = periodDateRange('this-week', today)
    expect(rangeThisWeek).toEqual({
      start: '2026-11-16', // Monday
      end: '2026-11-22',   // Sunday
    })

    const range7d = periodDateRange('7d', today)
    expect(range7d).toEqual({
      start: '2026-11-13', // 7 days inclusive: Nov 13, 14, 15, 16, 17, 18, 19
      end: '2026-11-19',
    })

    expect(periodDateRange('all', today)).toBeNull()
  })

  it('filters events by "this-week", "7d", and "all"', () => {
    const today = '2026-11-19' // Thursday. This week: 2026-11-16 to 2026-11-22. Last 7d: 2026-11-13 to 2026-11-19.
    const events: PauseEvent[] = [
      makeEvent('e-today', '2026-11-19'),
      makeEvent('e-mon', '2026-11-16'),
      makeEvent('e-last-sat', '2026-11-14'), // in 7d, but NOT in this-week (previous week Saturday)
      makeEvent('e-10d-ago', '2026-11-09'),  // outside both 7d and this-week
    ]

    // "all": returns all 4
    expect(filterJournalEvents(events, 'all', 'all', today).map((e) => e.id)).toEqual([
      'e-today',
      'e-mon',
      'e-last-sat',
      'e-10d-ago',
    ])

    // "this-week": returns Monday and Thursday only
    expect(filterJournalEvents(events, 'this-week', 'all', today).map((e) => e.id)).toEqual([
      'e-today',
      'e-mon',
    ])

    // "7d": returns Nov 19, Nov 16, Nov 14 (3 events)
    expect(filterJournalEvents(events, '7d', 'all', today).map((e) => e.id)).toEqual([
      'e-today',
      'e-mon',
      'e-last-sat',
    ])
  })

  it('combines period and trigger filters', () => {
    const today = '2026-11-19'
    const events: PauseEvent[] = [
      makeEvent('e1', '2026-11-19', 'instagram'),
      makeEvent('e2', '2026-11-19', 'youtube'),
      makeEvent('e3', '2026-11-14', 'instagram'),
    ]

    expect(filterJournalEvents(events, 'this-week', 'instagram', today).map((e) => e.id)).toEqual(['e1'])
    expect(filterJournalEvents(events, '7d', 'instagram', today).map((e) => e.id)).toEqual(['e1', 'e3'])
    expect(filterJournalEvents(events, 'this-week', 'youtube', today).map((e) => e.id)).toEqual(['e2'])
  })

  it('filter is completely reversible: resetting to "all" restores full record', () => {
    const today = '2026-11-19'
    const events: PauseEvent[] = [
      makeEvent('e1', '2026-11-19'),
      makeEvent('e2', '2026-11-01'),
    ]
    const filtered = filterJournalEvents(events, 'this-week', 'all', today)
    expect(filtered).toHaveLength(1)

    const restored = filterJournalEvents(events, 'all', 'all', today)
    expect(restored).toHaveLength(2)
  })
})

describe('Journal Screen Period Filter UI', () => {
  function createView(events: PauseEvent[], fields: Record<string, string> = {}, lang: 'en' | 'ru' = 'en'): ViewModel {
    const db = emptyDatabase()
    db.events = events
    db.triggers = [{ id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-01' }]
    return {
      db,
      route: { name: 'journal' },
      now: new Date('2026-11-19T12:00:00.000Z').getTime(),
      pause: null,
      toast: null,
      flash: null,
      confirm: null,
      installReady: false,
      presets: ['instagram'],
      customs: [],
      form: { unlogged: 0, pendingEnd: false },
      fields,
      dict: dictionary(lang),
    }
  }

  it('renders period chips in RU and EN with active states', () => {
    const today = '2026-11-19'
    const events = [makeEvent('e1', today)]

    // English
    const viewEn = createView(events, { 'journal-period': 'this-week' }, 'en')
    const htmlEn = pauseHistory(viewEn)
    expect(htmlEn).toContain('Period')
    expect(htmlEn).toContain('All time')
    expect(htmlEn).toContain('This week')
    expect(htmlEn).toContain('Last 7 days')
    expect(htmlEn).toMatch(/class="chip is-on"[^>]*data-action="journal-period"[^>]*data-value="this-week"/)

    // Russian
    const viewRu = createView(events, { 'journal-period': '7d' }, 'ru')
    const htmlRu = pauseHistory(viewRu)
    expect(htmlRu).toContain('Период')
    expect(htmlRu).toContain('Всё время')
    expect(htmlRu).toContain('Эта неделя')
    expect(htmlRu).toContain('Последние 7 дней')
    expect(htmlRu).toMatch(/class="chip is-on"[^>]*data-action="journal-period"[^>]*data-value="7d"/)
  })

  it('renders clear empty state with reset button when period has no matching pauses', () => {
    const events = [makeEvent('e-old', '2026-10-01')] // old event outside this week
    const view = createView(events, { 'journal-period': 'this-week' }, 'ru')
    const html = pauseHistory(view)

    expect(html).toContain('data-card="journalFilteredEmpty"')
    expect(html).toContain('Нет пауз за выбранный период.')
    expect(html).toContain('data-action="journal-reset"')
    expect(html).toContain('Сбросить фильтры')
  })

  it('renders clear empty state when both period and trigger filter out pauses', () => {
    const events = [makeEvent('e-old', '2026-10-01', 'instagram')]
    const view = createView(events, { 'journal-period': 'this-week', 'journal-filter': 'tiktok' }, 'en')
    const html = pauseHistory(view)

    expect(html).toContain('data-card="journalFilteredEmpty"')
    expect(html).toContain('No pauses match these filters.')
    expect(html).toContain('data-action="journal-reset"')
    expect(html).toContain('Reset filters')
  })
})
