import { describe, expect, it } from 'vitest'
import { formatDiary } from '../src/domain/diary'
import { exampleDatabase } from '../src/domain/example'
import { emptyDatabase } from '../src/store/defaults'
import type { Database, PauseEvent } from '../src/domain/types'
import { createId } from '../src/domain/ids'

describe('formatDiary', () => {
  it('formats an empty database gracefully', () => {
    const db = emptyDatabase()

    const ruOutput = formatDiary(db, 'ru')
    expect(ruOutput).toContain('# Дневник практики Supacon')
    expect(ruOutput).toContain('- **Период практики:** Нет записей')
    expect(ruOutput).toContain('- **Всего пауз:** 0')
    expect(ruOutput).toContain('*Нет записей практики.*')
    expect(ruOutput).toContain('## Итоговые инсайты')
    expect(ruOutput).toContain('*Недостаточно данных для инсайтов.*')

    const enOutput = formatDiary(db, 'en')
    expect(enOutput).toContain('# Supacon Practice Diary')
    expect(enOutput).toContain('- **Practice period:** No entries')
    expect(enOutput).toContain('- **Total pauses:** 0')
    expect(enOutput).toContain('*No practice records yet.*')
    expect(enOutput).toContain('## Summary Insights')
    expect(enOutput).toContain('*Not enough data for insights yet.*')
  })

  it('formats a database with several pauses, check-in, focus block, and evening review', () => {
    const db: Database = {
      ...emptyDatabase(),
      startedOn: '2026-10-10',
      triggers: [
        { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-10T08:00:00Z' },
        { id: 'youtube', label: 'YouTube', preset: true, enabled: true, createdAt: '2026-10-10T08:00:00Z' },
        { id: 'news', label: 'News', preset: true, enabled: true, createdAt: '2026-10-10T08:00:00Z' },
      ],
      mornings: [
        {
          date: '2026-10-10',
          at: '2026-10-10T07:30:00Z',
          awareness: 7,
          firstDesire: 'Read book',
        },
      ],
      focuses: [
        {
          id: createId(),
          date: '2026-10-10',
          startedAt: '2026-10-10T10:00:00Z',
          plannedMinutes: 45,
          endedAt: '2026-10-10T10:45:00Z',
          completed: true,
        },
      ],
      evenings: [
        {
          date: '2026-10-10',
          at: '2026-10-10T21:00:00Z',
          lowestMoment: 'Late night scroll',
          note: 'Good day overall',
          unloggedMisses: 1,
        },
        {
          date: '2026-10-16',
          at: '2026-10-16T21:30:00Z',
          lowestMoment: 'Tired after work',
          note: 'Calibration finished',
          unloggedMisses: 0,
          whereItBroke: 'Slipped on third check',
          likesChanged: 'yes',
          likesNote: 'Less satisfying',
        },
      ],
      events: [
        {
          id: 'pause-1',
          at: '2026-10-10T09:30:00Z',
          date: '2026-10-10',
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 4,
          awarenessAfter: 6,
          seeking: 'validation',
          seekingNote: 'awaiting reply',
          choice: 'open',
          overLimit: false,
          elapsedSeconds: 12,
          dayNumber: 1,
          phase: 'calibration',
          finish: 'Check direct messages',
        },
        {
          id: 'pause-2',
          at: '2026-10-10T14:15:00Z',
          date: '2026-10-10',
          intent: 'browse',
          triggerId: 'youtube',
          awarenessBefore: 8,
          seeking: 'boredom',
          seekingNote: '',
          choice: 'postpone',
          postponeMinutes: 30,
          overLimit: false,
          elapsedSeconds: 10,
          dayNumber: 1,
          phase: 'calibration',
        },
        {
          id: 'pause-3',
          at: '2026-10-10T20:00:00Z',
          date: '2026-10-10',
          intent: 'browse',
          triggerId: 'news',
          awarenessBefore: 9,
          seeking: 'information',
          seekingNote: '',
          choice: 'close',
          overLimit: false,
          elapsedSeconds: 15,
          dayNumber: 1,
          phase: 'calibration',
        },
      ],
      sessions: [
        {
          id: createId(),
          pauseId: 'pause-1',
          triggerId: 'instagram',
          startedAt: '2026-10-10T09:30:00Z',
          date: '2026-10-10',
          plannedMinutes: 15,
          extendedMinutes: 0,
          awarenessAtStart: 4,
          seeking: 'validation',
          overLimit: false,
          found: 'no',
        },
      ],
    }

    const ru = formatDiary(db, 'ru')
    expect(ru).toContain('# Дневник практики Supacon')
    expect(ru).toContain('- **Период практики:** 2026-10-10 — 2026-10-16')
    expect(ru).toContain('- **Всего пауз:** 3')
    expect(ru).toContain('## День 1 (2026-10-10) · Калибровка')
    expect(ru).toContain('- **Утренний чек-ин:** Осознанность 7/10 · Первое желание: "Read book"')
    expect(ru).toContain('- **Фокус-блок:**')
    expect(ru).toContain('(45 мин) · Завершён')
    expect(ru).toContain('Самый тяжёлый момент: Late night scroll')
    expect(ru).toContain('Заметка: Good day overall')
    expect(ru).toContain('Неучтённые пропуски: 1')

    // Pauses formatting
    expect(ru).toContain('Instagram · Осознанность: 4 → 6/10 · Искание: Подтверждение ("awaiting reply") · Выбор: Открыто · Финишная черта: "Check direct messages" · Результат сессии: Нет')
    expect(ru).toContain('YouTube · Осознанность: 8/10 · Искание: Скука · Выбор: Отложено на 30 мин')
    expect(ru).toContain('Новости · Осознанность: 9/10 · Искание: Информация · Выбор: Закрыто')

    // Day 7
    expect(ru).toContain('## День 7 (2026-10-16) · Диагноз')
    expect(ru).toContain('Где ломался протокол: Slipped on third check')
    expect(ru).toContain('Ощущение от лайков изменилось: Да (Less satisfying)')

    // English version
    const en = formatDiary(db, 'en')
    expect(en).toContain('# Supacon Practice Diary')
    expect(en).toContain('- **Practice period:** 2026-10-10 – 2026-10-16')
    expect(en).toContain('- **Total pauses:** 3')
    expect(en).toContain('## Day 1 (2026-10-10) · Calibration')
    expect(en).toContain('- **Morning check-in:** Awareness 7/10 · First desire: "Read book"')
    expect(en).toContain('Lowest moment: Late night scroll')
    expect(en).toContain('Instagram · Awareness: 4 → 6/10 · Seeking: Validation ("awaiting reply") · Choice: Open · Finish line: "Check direct messages" · Session result: No')
    expect(en).toContain('YouTube · Awareness: 8/10 · Seeking: Boredom · Choice: Postponed for 30 min')
    expect(en).toContain('News · Awareness: 9/10 · Seeking: Information · Choice: Closed')
    expect(en).toContain('Where protocol broke: Slipped on third check')
    expect(en).toContain('Feeling from likes changed: Yes (Less satisfying)')
  })

  it('formats exampleDatabase() completely and correctly', () => {
    const today = '2026-10-17'
    const db = exampleDatabase(today)

    const ru = formatDiary(db, 'ru')
    expect(ru).toContain('# Дневник практики Supacon')
    expect(ru).toContain('- **Период практики:** 2026-10-11 — 2026-10-17')
    expect(ru).toContain('- **Всего пауз:** 30')

    // All 7 days should be present
    for (let day = 1; day <= 7; day += 1) {
      expect(ru).toContain(`День ${day}`)
    }

    // Day 7 specific protocol fields
    expect(ru).toContain('Где ломался протокол: The second night open, before I had scored.')
    expect(ru).toContain('Ощущение от лайков изменилось: Да (Shorter. Less like relief.)')

    // Insights section
    expect(ru).toContain('## Итоговые инсайты')
    expect(ru).toContain('- **Средняя осознанность:**')
    expect(ru).toContain('- **Порог осознанности:**')
    expect(ru).toContain('Ниже 7 открытие было в 100% случаев. На 7 и выше — в 0%.')
    expect(ru).toContain('Желание без удовольствия')

    // English version of exampleDatabase
    const en = formatDiary(db, 'en')
    expect(en).toContain('# Supacon Practice Diary')
    expect(en).toContain('Where protocol broke: The second night open, before I had scored.')
    expect(en).toContain('Feeling from likes changed: Yes (Shorter. Less like relief.)')
    expect(en).toContain('## Summary Insights')
    expect(en).toContain('- **Average awareness:**')
    expect(en).toContain('Below 7, you opened 100% of the time. At 7 and above, 0%.')
  })

  it('correctly reports a dominant cycle when one leads', () => {
    const db = emptyDatabase()
    db.startedOn = '2026-10-10'
    for (let i = 0; i < 6; i += 1) {
      const event: PauseEvent = {
        id: createId(),
        at: `2026-10-10T1${i}:00:00Z`,
        date: '2026-10-10',
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 5,
        seeking: 'validation', // cycle: approval
        seekingNote: '',
        choice: 'open',
        overLimit: false,
        elapsedSeconds: 10,
        dayNumber: 1,
        phase: 'calibration',
      }
      db.events.push(event)
    }

    const ru = formatDiary(db, 'ru')
    expect(ru).toContain('- **Доминирующий цикл:** Одобрение (6 пауз)')

    const en = formatDiary(db, 'en')
    expect(en).toContain('- **Dominant cycle:** Approval (6 pauses)')
  })

  it('is a pure function that does not mutate the database', () => {
    const db = exampleDatabase('2026-10-17')
    const originalSnapshot = JSON.stringify(db)

    formatDiary(db, 'ru')
    expect(JSON.stringify(db)).toBe(originalSnapshot)

    formatDiary(db, 'en')
    expect(JSON.stringify(db)).toBe(originalSnapshot)
  })
})
