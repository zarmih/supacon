import { describe, expect, it } from 'vitest'
import { emptyDatabase } from '../src/store/defaults'
import { dictionary } from '../src/i18n'
import type { PauseEvent, Session } from '../src/domain/types'
import { localDate, addDays } from '../src/domain/time'
import { eveningDaySummary, eveningScreen, journalScreen, morningScreen, pauseHistory, sessionScreen } from '../src/ui/screens/journal'
import { parseHash } from '../src/ui/route'
import type { ViewModel } from '../src/ui/model'

function createMockView(events: PauseEvent[] = [], fields: Record<string, string> = {}, lang: 'en' | 'ru' = 'en'): ViewModel {
  const db = emptyDatabase()
  db.events = events
  db.triggers = [
    { id: 'instagram', label: 'Instagram', enabled: true, preset: true, createdAt: '2026-10-17T00:00:00.000Z' },
    { id: 'youtube', label: 'YouTube', enabled: true, preset: true, createdAt: '2026-10-17T00:00:00.000Z' },
    { id: 'news', label: 'News', enabled: true, preset: false, createdAt: '2026-10-17T00:00:00.000Z' },
  ]
  const now = new Date('2026-10-17T12:00:00.000Z').getTime()
  const dict = dictionary(lang)

  return {
    db,
    route: { name: 'journal' },
    now,
    pause: null,
    toast: null,
    flash: null,
    confirm: null,
    installReady: false,
    presets: ['instagram', 'youtube'],
    customs: [{ id: 'news', label: 'News' }],
    form: { unlogged: 0, pendingEnd: false },
    fields,
    dict,
  }
}

describe('Journal Filtering and Grouping', () => {
  it('parses #/journal and #/history routes', () => {
    expect(parseHash('#/journal')).toEqual({ name: 'journal' })
    expect(parseHash('#/history')).toEqual({ name: 'history' })
  })

  it('renders calm empty state when no pauses exist', () => {
    const view = createMockView([])
    const html = pauseHistory(view)

    expect(html).toContain('data-card="journalEmpty"')
    expect(html).toContain(view.dict.home.noPauses)
    expect(html).toContain('data-action="journal-filter"')
    expect(html).toContain('class="chip is-on"')
  })

  it('renders filter chips with active chip highlighted', () => {
    const today = localDate(new Date('2026-10-17T12:00:00.000Z'))
    const events: PauseEvent[] = [
      {
        id: '1',
        at: '2026-10-17T10:00:00.000Z',
        date: today,
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 5,
        seeking: 'boredom',
        seekingNote: '',
        choice: 'close',
        overLimit: false,
        elapsedSeconds: 12,
        dayNumber: 1,
        phase: 'calibration',
      },
    ]

    // Default: 'all' is active
    const viewAll = createMockView(events, {})
    const htmlAll = pauseHistory(viewAll)
    expect(htmlAll).toMatch(/class="chip is-on"[^>]*data-value="all"/)
    expect(htmlAll).toMatch(/class="chip"[^>]*data-value="instagram"/)

    // Filter by instagram
    const viewInsta = createMockView(events, { 'journal-filter': 'instagram' })
    const htmlInsta = pauseHistory(viewInsta)
    expect(htmlInsta).toMatch(/class="chip"[^>]*data-value="all"/)
    expect(htmlInsta).toMatch(/class="chip is-on"[^>]*data-value="instagram"/)
    expect(htmlInsta).toContain('Instagram')
    expect(htmlInsta).not.toContain('data-card="journalFilteredEmpty"')

    // Filter by youtube (no pauses for youtube)
    const viewYt = createMockView(events, { 'journal-filter': 'youtube' })
    const htmlYt = pauseHistory(viewYt)
    expect(htmlYt).toMatch(/class="chip is-on"[^>]*data-value="youtube"/)
    expect(htmlYt).toContain('data-card="journalFilteredEmpty"')
    expect(htmlYt).toContain(viewYt.dict.journal.emptyFiltered)
  })

  it('groups pauses by day with Today, Yesterday, and dates in reverse chronological order', () => {
    const today = '2026-10-17'
    const yesterday = '2026-10-16'
    const older = '2026-10-14'

    const events: PauseEvent[] = [
      {
        id: 'e1',
        at: '2026-10-14T09:00:00.000Z',
        date: older,
        intent: 'browse',
        triggerId: 'youtube',
        awarenessBefore: 4,
        seeking: 'stimulation',
        seekingNote: '',
        choice: 'open',
        overLimit: false,
        elapsedSeconds: 15,
        dayNumber: 1,
        phase: 'calibration',
      },
      {
        id: 'e2',
        at: '2026-10-17T11:30:00.000Z',
        date: today,
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 7,
        seeking: 'connection',
        seekingNote: '',
        choice: 'close',
        overLimit: false,
        elapsedSeconds: 10,
        dayNumber: 4,
        phase: 'boundary',
      },
      {
        id: 'e3',
        at: '2026-10-16T15:00:00.000Z',
        date: yesterday,
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 6,
        seeking: 'habit',
        seekingNote: '',
        choice: 'postpone',
        overLimit: false,
        elapsedSeconds: 10,
        dayNumber: 3,
        phase: 'boundary',
      },
    ]

    const view = createMockView(events, {}, 'ru')
    const html = pauseHistory(view)

    // Check headings
    expect(html).toContain('<h2>Сегодня</h2>')
    expect(html).toContain('<h2>Вчера</h2>')
    expect(html).toContain(`<h2>${older}</h2>`)

    // Today appears before Yesterday, which appears before older date
    const todayPos = html.indexOf('<h2>Сегодня</h2>')
    const yesterdayPos = html.indexOf('<h2>Вчера</h2>')
    const olderPos = html.indexOf(`<h2>${older}</h2>`)

    expect(todayPos).toBeGreaterThan(-1)
    expect(yesterdayPos).toBeGreaterThan(todayPos)
    expect(olderPos).toBeGreaterThan(yesterdayPos)

    // Check choice text and awareness score
    expect(html).toContain('Instagram')
    expect(html).toContain('YouTube')
    expect(html).toContain('Закрыто')
    expect(html).toContain('Отложено')
    expect(html).toContain('Открыто')
  })

  it('renders English day headers correctly', () => {
    const today = '2026-10-17'
    const yesterday = '2026-10-16'

    const events: PauseEvent[] = [
      {
        id: 'e1',
        at: '2026-10-17T09:00:00.000Z',
        date: today,
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 8,
        seeking: 'boredom',
        seekingNote: '',
        choice: 'close',
        overLimit: false,
        elapsedSeconds: 10,
        dayNumber: 2,
        phase: 'calibration',
      },
      {
        id: 'e2',
        at: '2026-10-16T09:00:00.000Z',
        date: yesterday,
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 3,
        seeking: 'habit',
        seekingNote: '',
        choice: 'open',
        overLimit: true,
        elapsedSeconds: 10,
        dayNumber: 1,
        phase: 'calibration',
      },
    ]

    const view = createMockView(events, {}, 'en')
    const html = pauseHistory(view)

    expect(html).toContain('<h2>Today</h2>')
    expect(html).toContain('<h2>Yesterday</h2>')
    expect(html).toContain(view.dict.pause.openPast)
  })

  it('renders journalScreen wrapper with back link and title', () => {
    const viewRu = createMockView([], {}, 'ru')
    const htmlRu = journalScreen(viewRu)
    expect(htmlRu).toContain('href="#/today"')
    expect(htmlRu).toContain('История пауз')

    const viewEn = createMockView([], {}, 'en')
    const htmlEn = journalScreen(viewEn)
    expect(htmlEn).toContain('href="#/today"')
    expect(htmlEn).toContain('Pause history')
  })
})

describe('Evening Review Contact Integration', () => {
  it('displays "пока не отмечено" during contrast phase without mark', () => {
    const today = '2026-10-17'
    const view = createMockView([], {}, 'ru')
    view.route = { name: 'evening' }
    // Day 5 is contrast phase (startedOn: 4 days before today)
    view.db.startedOn = addDays(today, -4)
    view.now = new Date(`${today}T20:00:00Z`).getTime()

    const html = eveningScreen(view)
    expect(html).toContain('data-card="eveningContact"')
    expect(html).toContain('Живой контакт сегодня: пока не отмечено')
  })

  it('displays "был" and contact note during contrast phase when contact happened', () => {
    const today = '2026-10-17'
    const view = createMockView([], {}, 'ru')
    view.route = { name: 'evening' }
    view.db.startedOn = addDays(today, -4)
    view.now = new Date(`${today}T20:00:00Z`).getTime()
    view.db.dayMarks.push({
      date: today,
      realContact: true,
      contactNote: 'Долгий разговор за кофе с другом',
    })

    const html = eveningScreen(view)
    expect(html).toContain('data-card="eveningContact"')
    expect(html).toContain('Живой контакт сегодня: был')
    expect(html).toContain('Долгий разговор за кофе с другом')
  })

  it('displays "не было" when contact was marked as false', () => {
    const today = '2026-10-17'
    const view = createMockView([], {}, 'ru')
    view.route = { name: 'evening' }
    view.db.startedOn = addDays(today, -5) // Day 6 (contrast)
    view.now = new Date(`${today}T20:00:00Z`).getTime()
    view.db.dayMarks.push({
      date: today,
      realContact: false,
      contactNote: '',
    })

    const html = eveningScreen(view)
    expect(html).toContain('data-card="eveningContact"')
    expect(html).toContain('Живой контакт сегодня: не было')
  })

  it('displays contact block in English correctly', () => {
    const today = '2026-10-17'
    const view = createMockView([], {}, 'en')
    view.route = { name: 'evening' }
    view.db.startedOn = addDays(today, -4)
    view.now = new Date(`${today}T20:00:00Z`).getTime()
    view.db.dayMarks.push({
      date: today,
      realContact: true,
      contactNote: 'Walk in the park with Alex',
    })

    const html = eveningScreen(view)
    expect(html).toContain('data-card="eveningContact"')
    expect(html).toContain('Real contact today: happened')
    expect(html).toContain('Walk in the park with Alex')
  })

  it('displays contact block outside contrast phase if mark exists', () => {
    const today = '2026-10-17'
    const view = createMockView([], {}, 'ru')
    view.route = { name: 'evening' }
    view.db.startedOn = addDays(today, -6) // Day 7 (diagnosis phase)
    view.now = new Date(`${today}T20:00:00Z`).getTime()
    view.db.dayMarks.push({
      date: today,
      realContact: true,
      contactNote: 'Разговор состоялся',
    })

    const html = eveningScreen(view)
    expect(html).toContain('data-card="eveningContact"')
    expect(html).toContain('Живой контакт сегодня: был')
    expect(html).toContain('Разговор состоялся')
  })

  it('does NOT display contact block in calibration phase when no mark exists', () => {
    const today = '2026-10-17'
    const view = createMockView([], {}, 'ru')
    view.route = { name: 'evening' }
    view.db.startedOn = today // Day 1 (calibration phase)
    view.now = new Date(`${today}T20:00:00Z`).getTime()

    const html = eveningScreen(view)
    expect(html).not.toContain('data-card="eveningContact"')
    expect(html).not.toContain('Живой контакт сегодня')
  })
})

describe('morningScreen', () => {
  it('renders morning screen with guidance, 3 breath pips, score grid and desire field in Russian', () => {
    const view = createMockView([], {}, 'ru')
    const html = morningScreen(view)

    expect(html).toContain('class="breath-pips"')
    expect(html).toContain('class="breath-pip is-on"')
    expect(html).toContain('aria-label="3 вдоха"')
    expect(html).toContain(
      'Первые 15 минут после пробуждения — без телефона. 3 спокойных вдоха и выдоха. Назови осознанность прямо сейчас и первое желание.',
    )
    expect(html).toContain('data-action="form-score"')
    expect(html).toContain('name="desire"')
    expect(html).toContain('data-action="morning-save"')
    expect(html).toContain('Сохранить')
  })

  it('renders morning screen with guidance and breath pips in English', () => {
    const view = createMockView([], {}, 'en')
    const html = morningScreen(view)

    expect(html).toContain('class="breath-pips"')
    expect(html).toContain('aria-label="3 breaths"')
    expect(html).toContain(
      'First 15 minutes after waking: no phone. 3 calm breaths. Name your awareness right now and first desire.',
    )
    expect(html).toContain('data-action="morning-save"')
    expect(html).toContain('Save')
  })
})

function mockPause(
  date: string,
  choice: 'open' | 'close' | 'postpone',
  awarenessBefore: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 = 7,
  id = 'p1',
): PauseEvent {
  return {
    id,
    at: `${date}T10:00:00Z`,
    date,
    intent: 'browse',
    triggerId: 'instagram',
    awarenessBefore,
    awarenessAfter: awarenessBefore,
    seeking: 'boredom',
    seekingNote: '',
    choice,
    overLimit: false,
    elapsedSeconds: 10,
    dayNumber: 1,
    phase: 'calibration',
  }
}

describe('eveningDaySummary', () => {
  const today = '2026-10-17'

  it('renders factual summary card with calm empty state in Russian', () => {
    const db = emptyDatabase()
    const dict = dictionary('ru')

    const html = eveningDaySummary(db, today, dict)

    expect(html).toContain('data-card="eveningDaySummary"')
    expect(html).toContain('class="card evening-summary-card"')
    expect(html).toContain('Фактура сегодняшнего дня')
    expect(html).toContain('Утренняя отметка: не записана')
    expect(html).toContain('Пауз сегодня: 0 (открыто 0, закрыто 0, отложено 0)')
    expect(html).toContain('Средняя осознанность за день: нет данных')
    expect(html).toContain('Блок фокуса: не выполнялся')
    expect(html).toContain('Записано пропусков сегодня: 0.')
  })

  it('renders factual summary card with full data in Russian', () => {
    const db = emptyDatabase()
    const dict = dictionary('ru')

    db.mornings.push({
      date: today,
      awareness: 8,
      firstDesire: 'прогулка в парке',
      at: `${today}T07:30:00Z`,
    })

    db.events = [
      mockPause(today, 'open', 7, 'p1'),
      mockPause(today, 'close', 7, 'p2'),
      mockPause(today, 'postpone', 7, 'p3'),
    ]

    db.focuses.push({
      id: 'f1',
      date: today,
      startedAt: `${today}T14:00:00Z`,
      plannedMinutes: 25,
      endedAt: `${today}T14:25:00Z`,
      completed: true,
    })

    db.misses.push(
      { id: 'm1', date: today, at: `${today}T11:00:00Z`, triggerId: 'instagram', note: '' },
      { id: 'm2', date: today, at: `${today}T16:00:00Z`, triggerId: 'youtube', note: '' },
    )

    const html = eveningDaySummary(db, today, dict)

    expect(html).toContain('data-card="eveningDaySummary"')
    expect(html).toContain('Утренняя отметка: осознанность 8, первое желание: «прогулка в парке»')
    expect(html).toContain('Пауз сегодня: 3 (открыто 1, закрыто 1, отложено 1)')
    expect(html).toContain('Средняя осознанность за день: 7')
    expect(html).toContain('Блок фокуса: выполнен')
    expect(html).toContain('Записано 2 пропуска сегодня.')
  })

  it('renders morning check-in without desire when desire was left blank', () => {
    const db = emptyDatabase()
    db.mornings.push({
      date: today,
      awareness: 9,
      firstDesire: '   ',
      at: `${today}T08:00:00Z`,
    })

    const htmlRu = eveningDaySummary(db, today, dictionary('ru'))
    expect(htmlRu).toContain('Утренняя отметка: осознанность 9')
    expect(htmlRu).not.toContain('первое желание')

    const htmlEn = eveningDaySummary(db, today, dictionary('en'))
    expect(htmlEn).toContain('Morning check-in: awareness 9')
    expect(htmlEn).not.toContain('first desire')
  })

  it('renders factual summary card in English with empty and full states', () => {
    const db = emptyDatabase()
    const dict = dictionary('en')

    // Empty state
    const htmlEmpty = eveningDaySummary(db, today, dict)
    expect(htmlEmpty).toContain('Today’s factual record')
    expect(htmlEmpty).toContain('Morning check-in: not logged')
    expect(htmlEmpty).toContain('Pauses today: 0 (opened 0, closed 0, postponed 0)')
    expect(htmlEmpty).toContain('Average awareness today: no data')
    expect(htmlEmpty).toContain('Focus block: not completed')
    expect(htmlEmpty).toContain('0 misses already logged today.')

    // Full state
    db.mornings.push({
      date: today,
      awareness: 6,
      firstDesire: 'warm tea',
      at: `${today}T07:15:00Z`,
    })
    db.events = [mockPause(today, 'close', 6, 'p1')]
    db.focuses.push({
      id: 'f1',
      date: today,
      startedAt: `${today}T11:00:00Z`,
      plannedMinutes: 25,
      endedAt: `${today}T11:25:00Z`,
      completed: true,
    })
    db.misses.push({ id: 'm1', date: today, at: `${today}T13:00:00Z`, triggerId: 'instagram', note: '' })

    const htmlFull = eveningDaySummary(db, today, dict)
    expect(htmlFull).toContain('Morning check-in: awareness 6, first desire: &quot;warm tea&quot;')
    expect(htmlFull).toContain('Pauses today: 1 (opened 0, closed 1, postponed 0)')
    expect(htmlFull).toContain('Average awareness today: 6')
    expect(htmlFull).toContain('Focus block: completed')
    expect(htmlFull).toContain('1 miss already logged today.')
  })

  it('eveningScreen integrates eveningDaySummary card before input fields', () => {
    const view = createMockView([], {}, 'ru')
    view.route = { name: 'evening' }
    view.now = new Date(`${today}T21:00:00Z`).getTime()

    const html = eveningScreen(view)

    expect(html).toContain('data-card="eveningDaySummary"')
    expect(html).toContain('name="lowest"')

    const summaryIdx = html.indexOf('data-card="eveningDaySummary"')
    const inputIdx = html.indexOf('name="lowest"')
    expect(summaryIdx).toBeGreaterThan(0)
    expect(summaryIdx).toBeLessThan(inputIdx)
  })
})

describe('sessionScreen overLimit polish', () => {
  it('renders calm non-judgmental note without guilt when session is overLimit in Russian', () => {
    const view = createMockView([], {}, 'ru')
    const session: Session = {
      id: 's1',
      pauseId: 'p1',
      triggerId: 'instagram',
      startedAt: '2026-10-17T12:00:00.000Z',
      date: '2026-10-17',
      plannedMinutes: 10,
      extendedMinutes: 0,
      awarenessAtStart: 6,
      seeking: 'boredom',
      overLimit: true,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's1' }

    const html = sessionScreen(view)

    expect(html).toContain('class="overlimit-note"')
    expect(html).toContain('Сессия сверх лимита. Записана честно, как есть. Приложение не блокирует и не осуждает.')
  })

  it('renders calm non-judgmental note in English when session is overLimit', () => {
    const view = createMockView([], {}, 'en')
    const session: Session = {
      id: 's2',
      pauseId: 'p2',
      triggerId: 'youtube',
      startedAt: '2026-10-17T12:00:00.000Z',
      date: '2026-10-17',
      plannedMinutes: 15,
      extendedMinutes: 0,
      awarenessAtStart: 7,
      seeking: 'habit',
      overLimit: true,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's2' }

    const html = sessionScreen(view)

    expect(html).toContain('class="overlimit-note"')
    expect(html).toContain('Session over the limit. Logged honestly, as it is. The app does not block or judge.')
  })

  it('does NOT render overlimit-note when session is within limit', () => {
    const view = createMockView([], {}, 'ru')
    const session: Session = {
      id: 's3',
      pauseId: 'p3',
      triggerId: 'instagram',
      startedAt: '2026-10-17T12:00:00.000Z',
      date: '2026-10-17',
      plannedMinutes: 10,
      extendedMinutes: 0,
      awarenessAtStart: 8,
      seeking: 'information',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's3' }

    const html = sessionScreen(view)

    expect(html).not.toContain('class="overlimit-note"')
    expect(html).not.toContain('Сессия сверх лимита')
  })
})

describe('sessionScreen extension UX', () => {
  it('shows extend button with minutes from settings when session timer has elapsed in Russian', () => {
    const view = createMockView([], {}, 'ru')
    view.db.settings.sessionMinutes = 15
    const started = new Date('2026-10-17T12:00:00.000Z').getTime()
    const session: Session = {
      id: 's_ext_1',
      pauseId: 'p_ext_1',
      triggerId: 'instagram',
      startedAt: new Date(started).toISOString(),
      date: '2026-10-17',
      plannedMinutes: 15,
      extendedMinutes: 0,
      awarenessAtStart: 7,
      seeking: 'habit',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's_ext_1' }
    // Timer has elapsed: now > sessionEndsAt
    view.now = started + 16 * 60 * 1000

    const html = sessionScreen(view)
    expect(html).toContain('data-action="session-extend"')
    expect(html).toContain('Продлить сессию (+15 мин)')
    expect(html).not.toContain('Продлено: +')
  })

  it('renders calm note when session was already extended in Russian', () => {
    const view = createMockView([], {}, 'ru')
    view.db.settings.sessionMinutes = 20
    const started = new Date('2026-10-17T12:00:00.000Z').getTime()
    const session: Session = {
      id: 's_ext_2',
      pauseId: 'p_ext_2',
      triggerId: 'youtube',
      startedAt: new Date(started).toISOString(),
      date: '2026-10-17',
      plannedMinutes: 20,
      extendedMinutes: 20,
      awarenessAtStart: 8,
      seeking: 'boredom',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's_ext_2' }
    // Session is still running after extension: now < started + (20+20)*60*1000
    view.now = started + 25 * 60 * 1000

    const html = sessionScreen(view)
    expect(html).toContain('Продлено: +20 мин. Дополнительный слот не расходуется.')
  })

  it('renders extend button and calm note in English', () => {
    const view = createMockView([], {}, 'en')
    view.db.settings.sessionMinutes = 10
    const started = new Date('2026-10-17T12:00:00.000Z').getTime()
    const session: Session = {
      id: 's_ext_3',
      pauseId: 'p_ext_3',
      triggerId: 'news',
      startedAt: new Date(started).toISOString(),
      date: '2026-10-17',
      plannedMinutes: 10,
      extendedMinutes: 10,
      awarenessAtStart: 6,
      seeking: 'stimulation',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's_ext_3' }
    // Timer has elapsed again
    view.now = started + 25 * 60 * 1000

    const html = sessionScreen(view)
    expect(html).toContain('data-action="session-extend"')
    expect(html).toContain('Extend session (+10 min)')
    expect(html).toContain('Extended: +10 min. Additional slot is not used.')
  })
})

describe('sessionScreen finish line reminder', () => {
  it('renders prominent calm finish line card when finish is set in Russian', () => {
    const view = createMockView([], {}, 'ru')
    const session: Session = {
      id: 's_finish_1',
      pauseId: 'p_finish_1',
      triggerId: 'telegram',
      startedAt: '2026-10-17T12:00:00.000Z',
      date: '2026-10-17',
      plannedMinutes: 15,
      extendedMinutes: 0,
      awarenessAtStart: 7,
      seeking: 'connection',
      finish: 'проверить 3 сообщения в рабочем чате',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's_finish_1' }

    const html = sessionScreen(view)
    expect(html).toContain('class="card finish-reminder-card"')
    expect(html).toContain('Финишная черта: проверить 3 сообщения в рабочем чате')
    expect(html).toContain('Лента не имеет естественного конца. Ты здесь ради этой границы.')
    expect(html).not.toContain('session-no-finish')
  })

  it('renders prominent calm finish line card when finish is set in English', () => {
    const view = createMockView([], {}, 'en')
    const session: Session = {
      id: 's_finish_2',
      pauseId: 'p_finish_2',
      triggerId: 'twitter',
      startedAt: '2026-10-17T12:00:00.000Z',
      date: '2026-10-17',
      plannedMinutes: 10,
      extendedMinutes: 0,
      awarenessAtStart: 6,
      seeking: 'information',
      finish: 'read 1 specific thread',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's_finish_2' }

    const html = sessionScreen(view)
    expect(html).toContain('class="card finish-reminder-card"')
    expect(html).toContain('Finish line: read 1 specific thread')
    expect(html).toContain('The feed has no ending. You are here for this boundary.')
    expect(html).not.toContain('session-no-finish')
  })

  it('renders quiet reminder when finish line is not set or empty in Russian', () => {
    const view = createMockView([], {}, 'ru')
    const session: Session = {
      id: 's_finish_3',
      pauseId: 'p_finish_3',
      triggerId: 'instagram',
      startedAt: '2026-10-17T12:00:00.000Z',
      date: '2026-10-17',
      plannedMinutes: 15,
      extendedMinutes: 0,
      awarenessAtStart: 8,
      seeking: 'habit',
      finish: '   ',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's_finish_3' }

    const html = sessionScreen(view)
    expect(html).not.toContain('finish-reminder-card')
    expect(html).toContain('class="muted session-no-finish"')
    expect(html).toContain('Граница не была названа. Заметь, когда будет достаточно.')
  })

  it('renders quiet reminder when finish line is not set in English', () => {
    const view = createMockView([], {}, 'en')
    const session: Session = {
      id: 's_finish_4',
      pauseId: 'p_finish_4',
      triggerId: 'youtube',
      startedAt: '2026-10-17T12:00:00.000Z',
      date: '2026-10-17',
      plannedMinutes: 20,
      extendedMinutes: 0,
      awarenessAtStart: 5,
      seeking: 'boredom',
      overLimit: false,
    }
    view.db.sessions = [session]
    view.route = { name: 'session', id: 's_finish_4' }

    const html = sessionScreen(view)
    expect(html).not.toContain('finish-reminder-card')
    expect(html).toContain('class="muted session-no-finish"')
    expect(html).toContain('No finish line was named. Notice when enough is reached.')
  })
})



