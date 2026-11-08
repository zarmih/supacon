import { describe, expect, it } from 'vitest'
import { exampleDatabase } from '../src/domain/example'
import { buildInsights, dayStats, weekAgainstWeek } from '../src/domain/insights'
import { letterLines, type LetterCopy } from '../src/domain/letter'
import { pickHint } from '../src/domain/hints'
import { addDays } from '../src/domain/time'
import type { Seeking } from '../src/domain/types'
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
})
