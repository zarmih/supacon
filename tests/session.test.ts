import { describe, expect, it } from 'vitest'
import { activeSessionCard, todayScreen } from '../src/ui/screens/today'
import { emptyDatabase } from '../src/store/defaults'
import { endSession } from '../src/store/mutate'
import { sessionEndsAt } from '../src/domain/clock'
import { dictionary } from '../src/i18n'
import type { Database, Session } from '../src/domain/types'
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
    presets: ['instagram', 'telegram'],
    customs: [],
    form: { unlogged: 0, pendingEnd: false },
    fields: {},
    dict,
  }
}

describe('Active Session Hero Card on Today screen', () => {
  const now = new Date('2026-10-17T12:00:00.000Z').getTime()

  const activeSessionData: Session = {
    id: 'sess-123',
    pauseId: 'pause-1',
    triggerId: 'telegram',
    startedAt: new Date(now - 5 * 60_000).toISOString(), // 5 min ago
    date: '2026-10-17',
    plannedMinutes: 15,
    extendedMinutes: 0,
    awarenessAtStart: 7,
    seeking: 'boredom',
    overLimit: false,
    finish: 'Ответить на 2 сообщения',
  }

  it('renders regular pause button when no session is active', () => {
    const db: Database = {
      ...emptyDatabase(),
      triggers: [{ id: 'telegram', label: 'Telegram', enabled: true, preset: false, createdAt: '2026-10-15' }],
    }
    const view = createMockView(db, now, dictRu)
    const html = todayScreen(view)

    expect(html).not.toContain('data-card="activeSession"')
    expect(html).toContain('href="#/pause/telegram"')
    expect(html).toContain('Пауза')
  })

  it('renders active session hero card when a session is active (RU)', () => {
    const db: Database = {
      ...emptyDatabase(),
      triggers: [{ id: 'telegram', label: 'Telegram', enabled: true, preset: false, createdAt: '2026-10-15' }],
      sessions: [activeSessionData],
    }
    const view = createMockView(db, now, dictRu)
    const html = todayScreen(view)

    expect(html).toContain('data-card="activeSession"')
    expect(html).toContain('active-session-card')
    // Trigger name
    expect(html).toContain('Telegram')
    // Live countdown with data-clock="remain" and data-until
    const endsAt = sessionEndsAt(activeSessionData)
    expect(html).toContain('data-clock="remain"')
    expect(html).toContain(`data-until="${endsAt}"`)
    expect(html).toContain('10:00') // 15 - 5 = 10 min remaining
    // Finish line in RU: «Граница: {finish}»
    expect(html).toContain('Граница: Ответить на 2 сообщения')
    // Session link button
    expect(html).toContain('href="#/session/sess-123"')
    expect(html).toContain('Сессия идёт')
    // Quick finish button with data-action="session-end" and data-id
    expect(html).toContain('data-action="session-end"')
    expect(html).toContain('data-id="sess-123"')
    expect(html).toContain('Завершить сейчас')
  })

  it('renders active session hero card when a session is active (EN)', () => {
    const sessionEn: Session = {
      ...activeSessionData,
      id: 'sess-en-456',
      finish: 'Reply to 2 messages',
    }
    const db: Database = {
      ...emptyDatabase(),
      triggers: [{ id: 'telegram', label: 'Telegram', enabled: true, preset: false, createdAt: '2026-10-15' }],
      sessions: [sessionEn],
    }
    const view = createMockView(db, now, dictEn)
    const html = todayScreen(view)

    expect(html).toContain('data-card="activeSession"')
    expect(html).toContain('Telegram')
    expect(html).toContain('data-clock="remain"')
    expect(html).toContain(`data-until="${sessionEndsAt(sessionEn)}"`)
    expect(html).toContain('Finish line: Reply to 2 messages')
    expect(html).toContain('href="#/session/sess-en-456"')
    expect(html).toContain('Session running')
    expect(html).toContain('data-action="session-end"')
    expect(html).toContain('data-id="sess-en-456"')
    expect(html).toContain('End now')
  })

  it('omits finish line when session has no finish line set', () => {
    const sessionNoFinish: Session = {
      ...activeSessionData,
      finish: undefined,
    }
    const db: Database = {
      ...emptyDatabase(),
      triggers: [{ id: 'telegram', label: 'Telegram', enabled: true, preset: false, createdAt: '2026-10-15' }],
      sessions: [sessionNoFinish],
    }
    const htmlRu = todayScreen(createMockView(db, now, dictRu))
    expect(htmlRu).not.toContain('Граница:')
    expect(htmlRu).not.toContain('session-finish')

    const htmlEn = todayScreen(createMockView(db, now, dictEn))
    expect(htmlEn).not.toContain('Finish line:')
    expect(htmlEn).not.toContain('session-finish')
  })

  it('activeSessionCard helper produces well-formed markup', () => {
    const db: Database = {
      ...emptyDatabase(),
      triggers: [{ id: 'telegram', label: 'Telegram', enabled: true, preset: false, createdAt: '2026-10-15' }],
      sessions: [],
    }
    const cardRu = activeSessionCard(db, activeSessionData, dictRu, now)
    expect(cardRu).toContain('Telegram')
    expect(cardRu).toContain('data-clock="remain"')
    expect(cardRu).toContain('Граница: Ответить на 2 сообщения')
    expect(cardRu).toContain('Завершить сейчас')

    const cardEn = activeSessionCard(
      db,
      { ...activeSessionData, finish: 'Clear inbox' },
      dictEn,
      now,
    )
    expect(cardEn).toContain('Finish line: Clear inbox')
    expect(cardEn).toContain('End now')
  })

  it('endSession ends the session and next todayScreen render returns to pause button', () => {
    const dbWithSession: Database = {
      ...emptyDatabase(),
      triggers: [{ id: 'telegram', label: 'Telegram', enabled: true, preset: false, createdAt: '2026-10-15' }],
      sessions: [activeSessionData],
    }

    const htmlBefore = todayScreen(createMockView(dbWithSession, now, dictRu))
    expect(htmlBefore).toContain('data-card="activeSession"')

    const endedDb = endSession(dbWithSession, 'sess-123', null, new Date(now), 'manual')
    expect(endedDb.sessions[0]?.endedAt).toBeDefined()
    expect(endedDb.sessions[0]?.endReason).toBe('manual')

    const htmlAfter = todayScreen(createMockView(endedDb, now, dictRu))
    expect(htmlAfter).not.toContain('data-card="activeSession"')
    expect(htmlAfter).toContain('Пауза')
  })
})
