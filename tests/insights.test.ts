import { describe, expect, it } from 'vitest'
import { exampleDatabase } from '../src/domain/example'
import { buildInsights, dayStats, weekAgainstWeek } from '../src/domain/insights'
import { letterLines, type LetterCopy } from '../src/domain/letter'
import { pickHint } from '../src/domain/hints'
import { addDays } from '../src/domain/time'
import type { Database, Seeking } from '../src/domain/types'
import { emptyDatabase } from '../src/store/defaults'
import { dictionary } from '../src/i18n'
import { emptyForm, type ViewModel } from '../src/ui/model'
import { emptyCard, insightsScreen } from '../src/ui/screens/insights'

const copy: LetterCopy = {
  paused: (n) => `paused ${n}`,
  threshold: (cut, below, above) => `cut ${cut} ${below} ${above}`,
  seekingLow: (label) => `low ${label}`,
  namingUp: (delta) => `up ${delta}`,
  namingDown: (delta) => `down ${delta}`,
  baselineUp: (early, late) => `base ${early} ${late}`,
  baselineDown: (early, late) => `base down ${early} ${late}`,
  hour: (label) => `hour ${label}`,
  posts: (paused, back) => `posts ${paused} ${back}`,
  highOpens: () => 'high opens',
  trained: (unliked, answered) => `trained ${unliked} ${answered}`,
  cycle: (label) => `cycle ${label}`,
  unfinished: (bare, opens) => `bare ${bare} ${opens}`,
}

describe('insights', () => {
  it('stays quiet when there is not enough to claim a pattern', () => {
    const report = buildInsights(emptyDatabase(), '2026-10-13')
    expect(report.threshold).toBeNull()
    expect(report.avgAwareness).toBeNull()
    expect(report.peakHour).toBeNull()
    expect(letterLines(report, copy, (key) => key, (hour) => String(hour), (key) => key)).toEqual([])
    expect(report.daily).toHaveLength(7)
  })

  it('reads the example week as a real shift, not a flat average', () => {
    const today = '2026-10-13'
    const db = exampleDatabase(today)
    const report = buildInsights(db, today)
    expect(report.pauses).toBe(28)
    expect(report.threshold).toMatchObject({ cut: 7, openBelow: 1, openAbove: 0 })
    expect(report.seekingLow?.key).toBe('validation')
    expect(report.peakHour?.hour).toBe(22)
    expect(report.naming?.delta).toBeGreaterThan(0)
    expect(report.baseline).toEqual({ early: 5, late: 7.5 })
    expect(report.posts).toEqual({ paused: 2, steppedBack: 1 })
    expect(report.highButOpens).toBe(false)
    expect(report.trained).toEqual({ answered: 12, unliked: 12 })
    expect(report.cycle).toBeNull()
    expect(report.unfinished).toEqual({ opens: 12, bare: 12 })
    expect(report.weeks).toBeNull()
    const lines = letterLines(report, copy, (key: Seeking) => key, (hour) => `${hour}:00`, (key) => key)
    expect(lines[0]).toBe('paused 28')
    expect(lines.some((line) => line.startsWith('cut 7'))).toBe(true)
    expect(lines.some((line) => line.startsWith('trained 12'))).toBe(true)
    expect(lines.length).toBeLessThanOrEqual(4)

    const day7 = addDays(db.startedOn!, 6)
    expect(dayStats(db, day7).pauses).toBe(4)
    expect(dayStats(db, addDays(db.startedOn!, 1)).misses).toBe(2)
  })
})

describe('week against week', () => {
  it('compares medians and open rates once each span has four pauses', () => {
    const today = '2026-10-13'
    const row = (date: string, awareness: number, choice: string) => ({ date, awareness, choice })
    const thin = [
      row('2026-10-13', 8, 'open'),
      row('2026-10-13', 8, 'close'),
      row('2026-10-13', 8, 'close'),
      row('2026-10-06', 2, 'open'),
      row('2026-10-06', 2, 'open'),
      row('2026-10-06', 2, 'open'),
    ]
    expect(weekAgainstWeek(thin, today)).toBeNull()

    const enough = [
      row('2026-10-13', 2, 'open'),
      row('2026-10-12', 4, 'close'),
      row('2026-10-11', 6, 'open'),
      row('2026-10-07', 8, 'close'),
      row('2026-09-29', 1, 'open'),
      row('2026-10-06', 1, 'open'),
      row('2026-10-05', 1, 'open'),
      row('2026-10-04', 1, 'open'),
      row('2026-10-03', 9, 'open'),
    ]
    expect(weekAgainstWeek(enough, today)).toEqual({
      current: { median: 5, openRate: 0.5, n: 4 },
      previous: { median: 1, openRate: 1, n: 4 },
    })
  })
})

describe('hints', () => {
  it('names the over-limit before any pattern', () => {
    const db = exampleDatabase('2026-10-13')
    expect(
      pickHint(db, {
        intent: 'browse',
        awareness: 8,
        seeking: 'habit',
        triggerId: 'instagram',
        overLimit: true,
        hour: 22,
        now: Date.parse('2026-10-13T22:00:00'),
      }),
    ).toBe('over-limit')
  })

  it('notices when this seeking was postponed and did not return', () => {
    const db = exampleDatabase('2026-10-13')
    expect(
      pickHint(db, {
        intent: 'browse',
        awareness: 6,
        seeking: 'validation',
        triggerId: 'instagram',
        overLimit: false,
        hour: 15,
        now: Date.parse('2026-10-13T15:00:00'),
      }),
    ).toBe('trained')
  })

  it('says nothing when the sample is thin', () => {
    expect(
      pickHint(emptyDatabase(), {
        intent: 'browse',
        awareness: 3,
        seeking: 'habit',
        triggerId: 'other',
        overLimit: false,
        hour: 9,
        now: Date.parse('2026-10-13T09:00:00'),
      }),
    ).toBeNull()
  })

  it('names night and an outside window before any browse pause', () => {
    const db = emptyDatabase()
    db.settings.nightStart = '22:00'
    db.settings.nightEnd = '07:00'
    expect(
      pickHint(db, {
        intent: 'browse',
        awareness: 5,
        seeking: 'habit',
        triggerId: 'other',
        overLimit: false,
        hour: 23,
        now: Date.parse('2026-10-13T23:00:00'),
      }),
    ).toBe('night')

    db.settings.nightStart = null
    db.settings.nightEnd = null
    db.settings.windows = ['09:00']
    expect(
      pickHint(db, {
        intent: 'browse',
        awareness: 5,
        seeking: 'habit',
        triggerId: 'other',
        overLimit: false,
        hour: 15,
        now: Date.parse('2026-10-13T15:00:00'),
      }),
    ).toBe('outside')
  })
})

describe('insightsScreen UI polish and emptyCard', () => {
  function makeView(db: any, lang: 'en' | 'ru' = 'ru'): ViewModel {
    const dict = dictionary(lang)
    return {
      db,
      dict,
      now: Date.parse('2026-10-13T12:00:00Z'),
      route: { name: 'insights' },
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

  it('renders a calm and informative emptyCard when pauses < 3', () => {
    const db = emptyDatabase()
    const viewRu = makeView(db, 'ru')
    const htmlRu = insightsScreen(viewRu)

    expect(htmlRu).toContain('empty-card')
    expect(htmlRu).toContain('Узоры')
    expect(htmlRu).toContain('Пока нечего утверждать.')
    expect(htmlRu).toContain('Для первых наблюдений нужно от 3 пауз (динамика второго балла), для порога осознанности и громкого часа — от 4 пауз каждого типа.')
    expect(htmlRu).toContain('Пример загрузит 28 демонстрационных пауз завершённой недели, которые в любой момент можно очистить кнопкой «Очистить пример», не затрагивая личные записи.')
    expect(htmlRu).toContain('data-action="confirm" data-value="example"')
    expect(htmlRu).toContain('Посмотреть пример недели')

    // Also test standalone emptyCard helper
    const cardHtml = emptyCard(viewRu.dict)
    expect(cardHtml).toContain('empty-card')
    expect(cardHtml).toContain('Для первых наблюдений')

    // English version
    const viewEn = makeView(db, 'en')
    const htmlEn = insightsScreen(viewEn)
    expect(htmlEn).toContain('empty-card')
    expect(htmlEn).toContain('Patterns')
    expect(htmlEn).toContain('Nothing to claim yet.')
    expect(htmlEn).toContain('For the first observations, you need at least 3 pauses')
    expect(htmlEn).toContain('The example loads 28 demonstration pauses of a completed week')
    expect(htmlEn).toContain('Clear example')
  })

  it('renders demo banner with erase button at the top when db.demo === true', () => {
    const db = exampleDatabase('2026-10-13')
    expect(db.demo).toBe(true)

    const viewRu = makeView(db, 'ru')
    const htmlRu = insightsScreen(viewRu)

    // Soft banner at the top of the screen
    expect(htmlRu).toContain('<div class="banner">')
    expect(htmlRu).toContain('Это демонстрационный пример недели, чтобы увидеть узоры практики.')
    expect(htmlRu).toContain('<button type="button" class="btn ghost" data-action="confirm" data-value="erase">Очистить пример</button>')

    // Verify banner appears before the kicker / h1
    const bannerIndex = htmlRu.indexOf('class="banner"')
    const kickerIndex = htmlRu.indexOf('class="kicker"')
    expect(bannerIndex).toBeGreaterThan(-1)
    expect(kickerIndex).toBeGreaterThan(bannerIndex)

    // English version
    const viewEn = makeView(db, 'en')
    const htmlEn = insightsScreen(viewEn)
    expect(htmlEn).toContain('This is an example week so you can see what practice patterns look like.')
    expect(htmlEn).toContain('Clear example')
  })

  it('verifies that both ru and en dictionaries contain all polish keys', () => {
    const ru = dictionary('ru')
    const en = dictionary('en')

    expect(ru.insight.emptyRequirements).toBeTruthy()
    expect(ru.insight.exampleHelp).toBeTruthy()
    expect(ru.insight.demoBanner).toBeTruthy()
    expect(ru.insight.demoErase).toBe('Очистить пример')

    expect(en.insight.emptyRequirements).toBeTruthy()
    expect(en.insight.exampleHelp).toBeTruthy()
    expect(en.insight.demoBanner).toBeTruthy()
    expect(en.insight.demoErase).toBe('Clear example')
  })

  it('computes and renders per-trigger session minutes (7d and all time) with honest small sample note when n<3 (gap M3)', () => {
    const today = '2026-10-13'
    const oldDate = '2026-09-20' // >7 days ago
    const db: Database = {
      ...emptyDatabase(),
      triggers: [
        { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-09-01' },
        { id: 'youtube', label: 'YouTube', preset: true, enabled: true, createdAt: '2026-09-01' },
      ],
      events: [
        // Instagram: 2 pauses (n=2, should trigger n<3 small sample)
        {
          id: 'p-ig-1',
          at: `${today}T10:00:00Z`,
          date: today,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 4,
          seeking: 'boredom',
          seekingNote: '',
          choice: 'open',
          overLimit: false,
          elapsedSeconds: 15,
          dayNumber: 1,
          phase: 'calibration',
        },
        {
          id: 'p-ig-2',
          at: `${today}T12:00:00Z`,
          date: today,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 6,
          seeking: 'habit',
          seekingNote: '',
          choice: 'close',
          overLimit: false,
          elapsedSeconds: 15,
          dayNumber: 1,
          phase: 'calibration',
        },
        // YouTube: 3 pauses (n=3, no small sample note)
        {
          id: 'p-yt-1',
          at: `${today}T14:00:00Z`,
          date: today,
          intent: 'browse',
          triggerId: 'youtube',
          awarenessBefore: 7,
          seeking: 'stimulation',
          seekingNote: '',
          choice: 'open',
          overLimit: false,
          elapsedSeconds: 15,
          dayNumber: 1,
          phase: 'calibration',
        },
        {
          id: 'p-yt-2',
          at: `${today}T16:00:00Z`,
          date: today,
          intent: 'browse',
          triggerId: 'youtube',
          awarenessBefore: 8,
          seeking: 'stimulation',
          seekingNote: '',
          choice: 'open',
          overLimit: false,
          elapsedSeconds: 15,
          dayNumber: 1,
          phase: 'calibration',
        },
        {
          id: 'p-yt-3',
          at: `${today}T18:00:00Z`,
          date: today,
          intent: 'browse',
          triggerId: 'youtube',
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
        // Instagram session today: 15 min planned
        {
          id: 's-ig-1',
          pauseId: 'p-ig-1',
          triggerId: 'instagram',
          startedAt: `${today}T10:00:00Z`,
          endedAt: `${today}T10:15:00Z`,
          date: today,
          plannedMinutes: 15,
          extendedMinutes: 0,
          awarenessAtStart: 4,
          seeking: 'boredom',
          overLimit: false,
        },
        // Instagram older session: 20 min
        {
          id: 's-ig-old',
          pauseId: 'p-old',
          triggerId: 'instagram',
          startedAt: `${oldDate}T10:00:00Z`,
          endedAt: `${oldDate}T10:20:00Z`,
          date: oldDate,
          plannedMinutes: 15,
          extendedMinutes: 5,
          awarenessAtStart: 3,
          seeking: 'boredom',
          overLimit: false,
        },
        // YouTube session today: 30 min
        {
          id: 's-yt-1',
          pauseId: 'p-yt-1',
          triggerId: 'youtube',
          startedAt: `${today}T14:00:00Z`,
          endedAt: `${today}T14:30:00Z`,
          date: today,
          plannedMinutes: 15,
          extendedMinutes: 15,
          awarenessAtStart: 7,
          seeking: 'stimulation',
          overLimit: false,
        },
      ],
    }

    const report = buildInsights(db, today)
    const igStat = report.triggers.find((t) => t.id === 'instagram')
    expect(igStat).toBeDefined()
    expect(igStat!.n).toBe(2)
    expect(igStat!.avg).toBe(5)
    expect(igStat!.openRate).toBe(0.5)
    expect(igStat!.minutes7d).toBe(15)
    expect(igStat!.minutesAll).toBe(35) // 15 + 20

    const ytStat = report.triggers.find((t) => t.id === 'youtube')
    expect(ytStat).toBeDefined()
    expect(ytStat!.n).toBe(3)
    expect(ytStat!.minutes7d).toBe(30)
    expect(ytStat!.minutesAll).toBe(30)

    // Render insights in English
    const viewEn = makeView(db, 'en')
    const htmlEn = insightsScreen(viewEn)
    // Instagram has n=2 -> small sample note (escaped in HTML)
    expect(htmlEn).toContain('15m 7d · 35m all time · n&lt;3 · small sample')
    // YouTube has n=3 -> no small sample note
    expect(htmlEn).toContain('30m 7d · 30m all time')
    expect(htmlEn).not.toContain('30m 7d · 30m all time · n&lt;3')

    // Render insights in Russian
    const viewRu = makeView(db, 'ru')
    const htmlRu = insightsScreen(viewRu)
    expect(htmlRu).toContain('15 мин за 7д · 35 мин всего · n&lt;3 · мало данных')
    expect(htmlRu).toContain('30 мин за 7д · 30 мин всего')
  })
})
