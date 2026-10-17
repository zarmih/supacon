import { describe, expect, it } from 'vitest'
import { addDays, diffDays, localDate } from '../src/domain/time'
import {
  calibrationVsContrast,
  checklist,
  contrastFocusSuggestion,
  dayNumber,
  experimentForWeek,
  intentionId,
  isOverLimit,
  isProtocolCompleted,
  limitActive,
  loudestHour,
  phaseFor,
  protocolPausesCount,
  weekIndex,
} from '../src/domain/protocol'
import { emptyDatabase } from '../src/store/defaults'
import { completeOnboarding, saveContact, saveEvening, saveMorning, startFocus, endFocus } from '../src/store/mutate'
import { exampleDatabase } from '../src/domain/example'
import { dictionary, type Dict } from '../src/i18n'
import { todayScreen, experimentCard } from '../src/ui/screens/today'
import { emptyForm, type ViewModel } from '../src/ui/model'
import type { Database } from '../src/domain/types'

function mockView(db: Database, dict: Dict, now: number): ViewModel {
  return {
    db,
    dict,
    now,
    route: { name: 'today' },
    pause: null,
    toast: null,
    flash: null,
    confirm: null,
    installReady: false,
    presets: [],
    customs: [],
    form: emptyForm(),
    fields: {},
  }
}

describe('calendar', () => {
  it('counts local dates and does not skip a day across a DST-sized gap', () => {
    const evening = new Date(2026, 9, 13, 23, 30, 0)
    expect(localDate(evening)).toBe('2026-10-13')
    expect(diffDays('2026-10-13', '2026-10-20')).toBe(7)
    expect(addDays('2026-10-13', 6)).toBe('2026-10-19')
  })
})

describe('protocol phase', () => {
  it('maps the seven days and the days after them', () => {
    expect(dayNumber('2026-10-01', '2026-10-01')).toBe(1)
    expect(dayNumber('2026-10-01', '2026-10-07')).toBe(7)
    expect(dayNumber('2026-10-01', '2026-10-08')).toBe(8)
    expect(dayNumber('2026-10-01', '2026-09-30')).toBe(1)
    expect(dayNumber(null, '2026-10-01')).toBeNull()

    expect(phaseFor(1, null)).toBe('calibration')
    expect(phaseFor(2, null)).toBe('calibration')
    expect(phaseFor(3, null)).toBe('boundary')
    expect(phaseFor(4, null)).toBe('boundary')
    expect(phaseFor(5, null)).toBe('contrast')
    expect(phaseFor(6, null)).toBe('contrast')
    expect(phaseFor(7, null)).toBe('diagnosis')
    expect(phaseFor(8, null)).toBe('practice')
    expect(phaseFor(1, 'free')).toBe('practice')
    expect(intentionId(4, 'boundary')).toBe('d4')
    expect(intentionId(12, 'practice')).toBe('practice')
  })

  it('keeps the session cap off during calibration and on from day 3', () => {
    expect(limitActive(1, null, 3)).toBe(false)
    expect(limitActive(3, null, 3)).toBe(true)
    expect(limitActive(3, null, 0)).toBe(false)
    expect(limitActive(1, 'maintenance', 3)).toBe(true)

    const now = new Date(2026, 9, 3, 12, 0, 0)
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date(2026, 9, 1, 8, 0, 0),
    })
    expect(isOverLimit(db, '2026-10-01')).toBe(false)
    db.sessions.push(
      {
        id: 'a',
        pauseId: 'p',
        triggerId: 'instagram',
        startedAt: now.toISOString(),
        date: '2026-10-03',
        plannedMinutes: 15,
        extendedMinutes: 0,
        awarenessAtStart: 4,
        seeking: 'habit',
        overLimit: false,
      },
      {
        id: 'b',
        pauseId: 'p2',
        triggerId: 'instagram',
        startedAt: now.toISOString(),
        date: '2026-10-03',
        plannedMinutes: 15,
        extendedMinutes: 0,
        awarenessAtStart: 4,
        seeking: 'habit',
        overLimit: false,
      },
      {
        id: 'c',
        pauseId: 'p3',
        triggerId: 'instagram',
        startedAt: now.toISOString(),
        date: '2026-10-03',
        plannedMinutes: 15,
        extendedMinutes: 0,
        awarenessAtStart: 4,
        seeking: 'habit',
        overLimit: false,
      },
    )
    expect(isOverLimit(db, '2026-10-03')).toBe(true)
    expect(isOverLimit(db, '2026-10-02')).toBe(false)
  })
})

describe('checklist and experiments', () => {
  it('tracks the day without turning pauses into a guilt checkbox', () => {
    const now = new Date(2026, 9, 5, 18, 0, 0)
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date(2026, 9, 1, 8, 0, 0),
    })
    expect(checklist(db, '2026-10-05').map((item) => item.id)).toEqual(['morning', 'focus', 'contact', 'evening'])
    db = saveMorning(db, { awareness: 6, firstDesire: 'Coffee', now })
    db = startFocus(db, now)
    const focus = db.focuses[0]
    expect(focus).toBeDefined()
    db = endFocus(db, focus!.id, true, new Date(2026, 9, 5, 18, 45, 0))
    db = saveContact(db, { date: '2026-10-05', realContact: false, note: '' })
    db = saveEvening(db, {
      date: '2026-10-05',
      at: now.toISOString(),
      lowestMoment: 'Evening',
      note: '',
      unloggedMisses: 0,
    })
    expect(checklist(db, '2026-10-05').every((item) => item.done)).toBe(true)
    expect(weekIndex(8)).toBe(1)
    expect(experimentForWeek(0)).toBeNull()
    expect(experimentForWeek(1)?.id).toBe('name-aloud')
    expect(experimentForWeek(6)?.id).toBe('name-aloud')
  })

  it('renders weekly deepening experimentCard with try, done, and postpone actions and no streak', () => {
    const dict = dictionary('ru')
    const exp = experimentForWeek(1)!
    expect(exp.id).toBe('name-aloud')

    // Initial state: not yet decided
    const initialHtml = experimentCard(dict, exp, 1, undefined)
    expect(initialHtml).toContain('data-card="experimentCard"')
    expect(initialHtml).toContain('Сказать вслух')
    expect(initialHtml).toContain('data-status="open"')
    expect(initialHtml).toContain('data-status="done"')
    expect(initialHtml).toContain('data-status="dismissed"')
    expect(initialHtml).toContain(dict.home.experimentTry)
    expect(initialHtml).toContain(dict.home.experimentDone)
    expect(initialHtml).toContain(dict.home.experimentDismiss)
    expect(initialHtml).not.toContain('streak')
    expect(initialHtml).not.toContain('серия')

    // Active state: user chose to try it this week
    const activeHtml = experimentCard(dict, exp, 1, { id: exp.id, weekIndex: 1, status: 'open' })
    expect(activeHtml).toContain(dict.home.experimentActive)
    expect(activeHtml).toContain('data-status="done"')
    expect(activeHtml).toContain('data-status="dismissed"')

    // Completed state: calm completion note without guilt or streak
    const doneHtml = experimentCard(dict, exp, 1, { id: exp.id, weekIndex: 1, status: 'done' })
    expect(doneHtml).toContain(dict.home.experimentCompleted)
    expect(doneHtml).toContain(dict.home.experimentChange)

    // Dismissed state: calm note without guilt
    const dismissedHtml = experimentCard(dict, exp, 1, { id: exp.id, weekIndex: 1, status: 'dismissed' })
    expect(dismissedHtml).toContain(dict.home.experimentDismissed)
  })

  it('renders experimentCard on todayScreen when in deepening mode', () => {
    const dict = dictionary('ru')
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date('2026-10-01T08:00:00Z'),
    })
    db.practiceMode = 'deepening'
    const now = new Date('2026-10-10T10:00:00Z').getTime() // Day 10 -> week 1

    const html = todayScreen(mockView(db, dict, now))
    expect(html).toContain('data-card="experimentCard"')
    expect(html).toContain('Сказать вслух')
    expect(html).toContain(dict.home.experimentTry)
  })
})

describe('protocol completion and review', () => {
  it('detects when day 7 is finished or day 8 is reached without practice mode', () => {
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date('2026-10-01T08:00:00Z'),
    })
    // Day 6
    expect(isProtocolCompleted(db, '2026-10-06')).toBe(false)
    // Day 7 without evening review
    expect(isProtocolCompleted(db, '2026-10-07')).toBe(false)

    // Day 7 with evening review but no whereItBroke
    db = saveEvening(db, {
      date: '2026-10-07',
      at: '2026-10-07T21:00:00Z',
      lowestMoment: 'Night',
      note: 'Normal day',
      unloggedMisses: 0,
    })
    expect(isProtocolCompleted(db, '2026-10-07')).toBe(false)

    // Day 7 with whereItBroke filled
    db.evenings[0]!.whereItBroke = 'Broke on second open'
    expect(isProtocolCompleted(db, '2026-10-07')).toBe(true)

    // Day 8 without evening review diagnosis still counts as protocol completed
    const dbDay8 = structuredClone(db)
    dbDay8.evenings = []
    expect(isProtocolCompleted(dbDay8, '2026-10-08')).toBe(true)

    // Once practiceMode is selected, it is no longer pending completion
    db.practiceMode = 'maintenance'
    expect(isProtocolCompleted(db, '2026-10-07')).toBe(false)
    expect(isProtocolCompleted(db, '2026-10-08')).toBe(false)
  })

  it('counts 7-day browse pauses accurately and compares calibration with contrast', () => {
    const today = '2026-10-07'
    const db = exampleDatabase(today)
    // exampleDatabase has 4 beats/day * 7 days = 28 browse pauses
    expect(protocolPausesCount(db)).toBe(28)

    const comparison = calibrationVsContrast(db)
    expect(comparison).not.toBeNull()
    // Days 1-2 calibration: early beats have awareness 3, 4, 8, 5 -> avg 5.0, 3 of 4 opened (75%)
    expect(comparison?.calibration.pauses).toBe(8)
    expect(comparison?.calibration.avgAwareness).toBe(5)
    expect(comparison?.calibration.openRate).toBe(75)

    // Days 5-6 contrast: late beats have awareness 7, 8, 8, 7 -> avg 7.5, none opened (0%)
    expect(comparison?.contrast.pauses).toBe(8)
    expect(comparison?.contrast.avgAwareness).toBe(7.5)
    expect(comparison?.contrast.openRate).toBe(0)
  })

  it('renders supportive summary card with mode choices on Today screen', () => {
    const today = '2026-10-07'
    const db = exampleDatabase(today)
    const now = new Date('2026-10-07T12:00:00Z').getTime()
    const viewEn = mockView(db, dictionary('en'), now)
    const htmlEn = todayScreen(viewEn)
    expect(htmlEn).toContain('protocol-summary')
    expect(htmlEn).toContain('28 pauses completed over the seven days.')
    expect(htmlEn).toContain('Calibration (days 1–2): average awareness 5, 75% opened. Contrast (days 5–6): average awareness 7.5, 0% opened.')
    expect(htmlEn).toContain('data-action="mode" data-value="maintenance"')
    expect(htmlEn).toContain('data-action="mode" data-value="deepening"')
    expect(htmlEn).toContain('data-action="mode" data-value="free"')

    const viewRu = mockView(db, dictionary('ru'), now)
    const htmlRu = todayScreen(viewRu)
    expect(htmlRu).toContain('protocol-summary')
    expect(htmlRu).toContain('За 7 дней пройдено 28 пауз.')
    expect(htmlRu).toContain('Калибровка (дни 1–2): средняя осознанность 5, открыто 75%. Контраст (дни 5–6): средняя осознанность 7.5, открыто 0%.')
    expect(htmlRu).toContain('Выбрать «Поддержание»')
    expect(htmlRu).toContain('Выбрать «Углубление»')
    expect(htmlRu).toContain('Выбрать «Свободная практика»')
  })
})

describe('contrastFocusSuggestion and loudestHour', () => {
  it('identifies the loudest hour when at least 4 browse pauses occur in the same hour', () => {
    expect(loudestHour([])).toBeNull()

    // 3 pauses at hour 14 is not enough (< 4)
    const threeEvents = [
      { id: '1', at: '2026-10-05T14:10:00Z', intent: 'browse' } as any,
      { id: '2', at: '2026-10-05T14:20:00Z', intent: 'browse' } as any,
      { id: '3', at: '2026-10-05T14:30:00Z', intent: 'browse' } as any,
    ]
    expect(loudestHour(threeEvents)).toBeNull()

    // 4 browse pauses at hour 14 qualifies
    const fourEvents = [
      ...threeEvents,
      { id: '4', at: '2026-10-05T14:40:00Z', intent: 'browse' } as any,
    ]
    const localHour14 = new Date('2026-10-05T14:10:00Z').getHours()
    const result = loudestHour(fourEvents)
    expect(result).not.toBeNull()
    expect(result?.hour).toBe(localHour14)
    expect(result?.n).toBe(4)

    // Post pauses are excluded from loudest hour
    const postEvents = [
      ...threeEvents,
      { id: '4', at: '2026-10-05T14:40:00Z', intent: 'post' } as any,
    ]
    expect(loudestHour(postEvents)).toBeNull()
  })

  it('suggests focus block in loudest hour only during contrast phase (days 5-6)', () => {
    const today = '2026-10-07'
    const db = exampleDatabase(today)
    // exampleDatabase: startedOn is today - 6 days = 2026-10-01
    // Day 1: 2026-10-01 (calibration)
    // Day 4: 2026-10-04 (boundary)
    // Day 5: 2026-10-05 (contrast)
    // Day 6: 2026-10-06 (contrast)
    // Day 7: 2026-10-07 (diagnosis)

    // Calibration phase (Day 1) -> null
    const day1Now = new Date(2026, 9, 1, 22, 15, 0).getTime()
    expect(contrastFocusSuggestion(db, day1Now)).toBeNull()

    // Boundary phase (Day 4) -> null
    const day4Now = new Date(2026, 9, 4, 22, 15, 0).getTime()
    expect(contrastFocusSuggestion(db, day4Now)).toBeNull()

    // Diagnosis phase (Day 7) -> null
    const day7Now = new Date(2026, 9, 7, 22, 15, 0).getTime()
    expect(contrastFocusSuggestion(db, day7Now)).toBeNull()

    // Post-protocol (Day 8) -> null
    const day8Now = new Date(2026, 9, 8, 22, 15, 0).getTime()
    expect(contrastFocusSuggestion(db, day8Now)).toBeNull()

    // Practice mode active -> null even on day 5
    const dbPractice = structuredClone(db)
    dbPractice.practiceMode = 'maintenance'
    const day5NowDuringHour = new Date(2026, 9, 5, 22, 15, 0).getTime()
    expect(contrastFocusSuggestion(dbPractice, day5NowDuringHour)).toBeNull()

    // Day 5 (Contrast): during the loudest hour (22:00)
    const suggestionNow = contrastFocusSuggestion(db, day5NowDuringHour)
    expect(suggestionNow).toEqual({
      suggestedHour: 22,
      isSuggestedNow: true,
    })

    // Day 5 (Contrast): outside the loudest hour (e.g. 10:00)
    const day5NowOutsideHour = new Date(2026, 9, 5, 10, 0, 0).getTime()
    const suggestionLater = contrastFocusSuggestion(db, day5NowOutsideHour)
    expect(suggestionLater).toEqual({
      suggestedHour: 22,
      isSuggestedNow: false,
    })

    // Day 6 (Contrast) also works
    const day6NowDuringHour = new Date(2026, 9, 6, 22, 45, 0).getTime()
    expect(contrastFocusSuggestion(db, day6NowDuringHour)).toEqual({
      suggestedHour: 22,
      isSuggestedNow: true,
    })

    // Day 5 with empty events (< 4 pauses in loudest hour) -> null
    const dbNoEvents = structuredClone(db)
    dbNoEvents.events = []
    expect(contrastFocusSuggestion(dbNoEvents, day5NowDuringHour)).toBeNull()
  })

  it('renders contrast focus cue on Today screen during contrast phase', () => {
    const today = '2026-10-07'
    const db = exampleDatabase(today)
    // Loudest hour in exampleDatabase is 22:00
    // Day 5 (contrast phase) during loudest hour 22:15
    const day5NowDuring = new Date(2026, 9, 5, 22, 15, 0).getTime()
    const dictRu = dictionary('ru')
    const htmlNowRu = todayScreen(mockView(db, dictRu, day5NowDuring))

    expect(htmlNowRu).toContain('data-cue="contrast-focus"')
    expect(htmlNowRu).toContain('data-action="go-focus"')
    expect(htmlNowRu).toContain('href="#/focus"')
    expect(htmlNowRu).toContain('note flash')
    expect(htmlNowRu).toContain(dictRu.home.contrastFocusNow('22:00'))

    // In English
    const dictEn = dictionary('en')
    const htmlNowEn = todayScreen(mockView(db, dictEn, day5NowDuring))
    expect(htmlNowEn).toContain('note flash')
    expect(htmlNowEn).toContain(dictEn.home.contrastFocusNow('22:00'))

    // Day 5 (contrast phase) outside loudest hour (e.g. 10:00) -> quiet reminder without flash
    const day5NowOutside = new Date(2026, 9, 5, 10, 0, 0).getTime()
    const htmlLaterRu = todayScreen(mockView(db, dictRu, day5NowOutside))
    expect(htmlLaterRu).toContain('data-cue="contrast-focus"')
    expect(htmlLaterRu).toContain('data-action="go-focus"')
    expect(htmlLaterRu).toContain('href="#/focus"')
    expect(htmlLaterRu).not.toContain('note flash')
    expect(htmlLaterRu).toContain(dictRu.home.contrastFocusLater('22:00'))

    // Calibration phase (Day 1) -> no contrast-focus cue
    const day1Now = new Date(2026, 9, 1, 22, 15, 0).getTime()
    const htmlDay1 = todayScreen(mockView(db, dictRu, day1Now))
    expect(htmlDay1).not.toContain('data-cue="contrast-focus"')
  })

  it('polishes morning and evening checklist items and navigation links on Today screen', () => {
    const today = '2026-10-05'
    const now = new Date(2026, 9, 5, 12, 0, 0).getTime()
    const dictRu = dictionary('ru')
    let db = completeOnboarding(emptyDatabase(), {
      triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
      path: 'protocol',
      now: new Date(2026, 9, 1, 8, 0, 0),
    })

    // Initial state: neither morning nor evening is completed
    const htmlInitial = todayScreen(mockView(db, dictRu, now))
    expect(htmlInitial).toContain('href="#/morning"')
    expect(htmlInitial).toContain('href="#/evening"')
    expect(htmlInitial).toContain('Утренний чек-ин')
    expect(htmlInitial).toContain('Вечерний обзор')

    // 1. Morning completed with short desire
    db = saveMorning(db, { awareness: 8, firstDesire: 'Выпить воды', now: new Date(now) })
    const htmlMorningDone = todayScreen(mockView(db, dictRu, now))
    expect(htmlMorningDone).toContain('Балл 8 · Выпить воды')
    expect(htmlMorningDone).toContain('href="#/morning"')

    // 2. Morning completed with long desire (> 40 characters) -> neatly trimmed to <= 40 chars
    const longDesire = 'Проверить все рабочие чаты и почту перед длинным совещанием'
    db.mornings[0]!.firstDesire = longDesire
    const htmlMorningLong = todayScreen(mockView(db, dictRu, now))
    expect(htmlMorningLong).toContain('Балл 8 · Проверить все рабочие чаты и п…')
    // Extract morning check text to verify it does not exceed 40 characters
    const morningMatch = htmlMorningLong.match(/<li[^>]*><span class="mark"[^>]*><\/span><span>([^<]+)<\/span><\/li>/)
    expect(morningMatch).toBeDefined()
    expect(morningMatch![1]!.length).toBeLessThanOrEqual(40)

    // 3. Evening review completed -> shows calm status «Обзор дня записан»
    db = saveEvening(db, {
      date: today,
      at: new Date(now).toISOString(),
      lowestMoment: 'Сложный разговор',
      note: 'День прошёл спокойно',
      unloggedMisses: 0,
    })
    const htmlEveningDone = todayScreen(mockView(db, dictRu, now))
    expect(htmlEveningDone).toContain('Обзор дня записан')
    expect(htmlEveningDone).toContain('href="#/evening"')

    // In English
    const dictEn = dictionary('en')
    db.mornings[0]!.firstDesire = 'Drink water'
    const htmlEn = todayScreen(mockView(db, dictEn, now))
    expect(htmlEn).toContain('Score 8 · Drink water')
    expect(htmlEn).toContain('Day review recorded')
    expect(htmlEn).toContain('href="#/morning"')
    expect(htmlEn).toContain('href="#/evening"')
  })
})


