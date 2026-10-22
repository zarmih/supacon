import { describe, expect, it } from 'vitest'
import {
  dayPartOf,
  diagnosisReport,
  lowestPause,
  partExtremes,
  pausesOn,
  seekingWhenLowOn,
  todayVsYesterday,
} from '../src/domain/diagnosis'
import type { AwarenessScore, Choice, Database, Impulse, PauseEvent } from '../src/domain/types'
import { addDays, localDate } from '../src/domain/time'
import { emptyDatabase } from '../src/store/defaults'
import { dictionary } from '../src/i18n'
import { emptyForm, type ViewModel } from '../src/ui/model'
import { parseHash } from '../src/ui/route'
import { render } from '../src/ui/render'
import { dayCompareLine, eveningPauseList, reportScreen } from '../src/ui/screens/report'
import { eveningScreen } from '../src/ui/screens/journal'
import { todayScreen } from '../src/ui/screens/today'

const START = '2026-10-01'

let seq = 0
/** Local wall-clock time on a protocol date, so the tests do not depend on TZ. */
function at(date: string, hour: number, minute = 0): string {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, hour, minute).toISOString()
}

function pause(
  date: string,
  hour: number,
  score: number,
  choice: Choice = 'open',
  extra: Partial<PauseEvent> = {},
): PauseEvent {
  seq += 1
  const post = choice === 'post' || choice === 'draft' || choice === 'dont-post'
  return {
    id: `p${seq}`,
    at: at(date, hour, seq % 60),
    date,
    intent: post ? 'post' : 'browse',
    triggerId: 'instagram',
    awarenessBefore: score as AwarenessScore,
    seeking: (post ? 'seen' : 'boredom') as Impulse,
    seekingNote: '',
    choice,
    overLimit: false,
    elapsedSeconds: 10,
    dayNumber: null,
    phase: 'calibration',
    ...extra,
  }
}

function base(): Database {
  const db = emptyDatabase()
  db.startedOn = START
  db.onboardingComplete = true
  db.triggers = [
    { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: at(START, 8) },
    { id: 'youtube', label: 'YouTube', preset: true, enabled: true, createdAt: at(START, 8) },
    { id: 'chat', label: 'Work chat', preset: false, enabled: true, createdAt: at(START, 8) },
  ]
  return db
}

function view(db: Database, now: number, lang: 'en' | 'ru' = 'en', route: ViewModel['route'] = { name: 'report' }): ViewModel {
  return {
    db,
    route,
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
    dict: dictionary(lang),
  }
}

function noon(date: string): number {
  return new Date(at(date, 12)).getTime()
}

describe('dayPartOf', () => {
  it('splits the clock into four parts', () => {
    expect(dayPartOf(5)).toBe('morning')
    expect(dayPartOf(11)).toBe('morning')
    expect(dayPartOf(12)).toBe('afternoon')
    expect(dayPartOf(17)).toBe('afternoon')
    expect(dayPartOf(18)).toBe('evening')
    expect(dayPartOf(22)).toBe('evening')
    expect(dayPartOf(23)).toBe('night')
    expect(dayPartOf(0)).toBe('night')
    expect(dayPartOf(4)).toBe('night')
  })
})

describe('partExtremes', () => {
  it('stays silent until two parts have three pauses each', () => {
    const events = [pause(START, 9, 8), pause(START, 9, 8), pause(START, 9, 8), pause(START, 21, 2), pause(START, 21, 2)]
    expect(partExtremes(events)).toEqual({ highest: null, lowest: null })
  })

  it('names the highest and lowest part of the day', () => {
    const events = [
      pause(START, 9, 8),
      pause(START, 10, 7),
      pause(START, 11, 9),
      pause(START, 21, 2),
      pause(START, 22, 3),
      pause(START, 20, 4),
    ]
    const result = partExtremes(events)
    expect(result.highest).toEqual({ part: 'morning', avg: 8, n: 3 })
    expect(result.lowest).toEqual({ part: 'evening', avg: 3, n: 3 })
  })

  it('stays silent when the qualifying parts have the same average', () => {
    const events = [pause(START, 9, 5), pause(START, 9, 5), pause(START, 9, 5), pause(START, 14, 5), pause(START, 15, 5), pause(START, 16, 5)]
    expect(partExtremes(events)).toEqual({ highest: null, lowest: null })
  })

  it('ignores post pauses', () => {
    const events = [pause(START, 9, 8), pause(START, 9, 8), pause(START, 9, 8), pause(START, 21, 2, 'post'), pause(START, 21, 2, 'post'), pause(START, 21, 2, 'post')]
    expect(partExtremes(events)).toEqual({ highest: null, lowest: null })
  })
})

describe('diagnosisReport', () => {
  it('returns null without a protocol start', () => {
    expect(diagnosisReport(emptyDatabase(), START)).toBeNull()
  })

  it('counts pauses against misses inside the seven days only', () => {
    const db = base()
    const day7 = addDays(START, 6)
    db.events = [
      pause(START, 9, 3, 'open'),
      pause(addDays(START, 1), 9, 6, 'postpone'),
      pause(addDays(START, 2), 9, 8, 'close'),
      pause(day7, 9, 7, 'close'),
      pause(addDays(START, 7), 9, 1, 'open'), // day 8, outside
      pause(addDays(START, -1), 9, 1, 'open'), // before day 1, outside
    ]
    db.misses = [
      { id: 'm1', at: at(START, 22), date: START, triggerId: 'youtube', note: '' },
      { id: 'm2', at: at(addDays(START, 8), 22), date: addDays(START, 8), triggerId: 'youtube', note: '' },
    ]
    db.evenings = [
      { date: START, at: at(START, 22), lowestMoment: '', note: '', unloggedMisses: 2 },
      { date: day7, at: at(day7, 22), lowestMoment: '', note: '', unloggedMisses: 0, likesChanged: 'yes', likesNote: ' shorter ', whereItBroke: ' evenings in bed ' },
    ]
    const report = diagnosisReport(db, day7)
    expect(report).not.toBeNull()
    if (!report) return
    expect(report.from).toBe(START)
    expect(report.to).toBe(day7)
    expect(report.day).toBe(7)
    expect(report.pauses).toBe(4)
    expect(report.opened).toBe(1)
    expect(report.postponed).toBe(1)
    expect(report.closed).toBe(2)
    expect(report.misses).toBe(3)
    expect(report.caughtShare).toBeCloseTo(4 / 7)
    expect(report.avgAwareness).toBe(6)
    expect(report.likesChanged).toBe('yes')
    expect(report.likesNote).toBe('shorter')
    expect(report.whereItBroke).toBe('evenings in bed')
  })

  it('ranks at most three triggers by pauses plus misses and drops single hits', () => {
    const db = base()
    db.events = [
      pause(START, 9, 3, 'open', { triggerId: 'chat' }),
      pause(START, 10, 4, 'open', { triggerId: 'chat' }),
      pause(START, 11, 5, 'close', { triggerId: 'chat' }),
      pause(START, 12, 6, 'open', { triggerId: 'instagram' }),
      pause(START, 13, 6, 'close', { triggerId: 'instagram' }),
      pause(START, 14, 6, 'close', { triggerId: 'news' }),
    ]
    db.misses = [
      { id: 'm1', at: at(START, 22), date: START, triggerId: 'youtube', note: '' },
      { id: 'm2', at: at(START, 23), date: START, triggerId: 'youtube', note: '' },
    ]
    const report = diagnosisReport(db, START)
    expect(report?.topTriggers.map((item) => item.id)).toEqual(['chat', 'instagram', 'youtube'])
    expect(report?.topTriggers[0]).toEqual({ id: 'chat', pauses: 3, misses: 0, opened: 2, avg: 4 })
    expect(report?.topTriggers[2]).toEqual({ id: 'youtube', pauses: 0, misses: 2, opened: 0, avg: null })
  })

  it('reports the day it is still forming on and the over-limit sessions', () => {
    const db = base()
    const day3 = addDays(START, 2)
    db.sessions = [
      {
        id: 's1', pauseId: 'p', triggerId: 'instagram', startedAt: at(day3, 9), date: day3, plannedMinutes: 15,
        extendedMinutes: 15, awarenessAtStart: 4, seeking: 'boredom', overLimit: true, endedAt: at(day3, 10),
      },
    ]
    const report = diagnosisReport(db, day3)
    expect(report?.day).toBe(3)
    expect(report?.overLimitSessions).toBe(1)
    expect(report?.extraMinutes).toBe(15)
    expect(report?.sessionCount).toBe(1)
    expect(report?.sessionMinutes).toBe(60)
    expect(report?.caughtShare).toBeNull()
    expect(report?.likesChanged).toBeNull()
  })

  it('counts post pauses and step-backs separately from browse pauses', () => {
    const db = base()
    db.events = [pause(START, 9, 5, 'post'), pause(START, 10, 5, 'dont-post'), pause(START, 11, 5, 'draft')]
    const report = diagnosisReport(db, START)
    expect(report?.pauses).toBe(0)
    expect(report?.posts).toEqual({ paused: 3, steppedBack: 2 })
  })
})

describe('evening pause list', () => {
  it('lists today’s pauses oldest first and finds the lowest, earliest on ties', () => {
    const db = base()
    const late = pause(START, 20, 2, 'open')
    const early = pause(START, 9, 2, 'close')
    const mid = pause(START, 14, 7, 'postpone')
    db.events = [late, mid, early, pause(addDays(START, -1), 9, 1)]
    expect(pausesOn(db, START).map((event) => event.id)).toEqual([early.id, mid.id, late.id])
    expect(lowestPause(db, START)?.id).toBe(early.id)
    expect(lowestPause(db, addDays(START, 3))).toBeNull()
  })

  it('renders every pause with its scores, seeking and choice', () => {
    const db = base()
    db.events = [
      pause(START, 9, 3, 'open', { awarenessAfter: 5, seekingNote: 'a reply', overLimit: true }),
      pause(START, 10, 6, 'dont-post'),
    ]
    const html = eveningPauseList(db, START, dictionary('en'))
    expect(html).toContain('data-card="eveningPauses"')
    expect(html).toContain('3 → 5')
    expect(html).toContain('Boredom (a reply)')
    expect(html).toContain('Opened · past the cap')
    expect(html).toContain('Not posted')
    expect(html).toContain('data-card="eveningLowest"')
    expect(html).toContain('09:')
  })

  it('shows a calm empty line in Russian', () => {
    const html = eveningPauseList(base(), START, dictionary('ru'))
    expect(html).toContain('Сегодня пауз не записано.')
    expect(html).not.toContain('eveningLowest')
  })

  it('is part of the evening screen', () => {
    const db = base()
    db.events = [pause(START, 9, 4)]
    const html = eveningScreen(view(db, noon(START), 'en', { name: 'evening' }))
    expect(html).toContain('data-card="eveningPauses"')
  })

  it('links the evening screen to the report on day 7', () => {
    const db = base()
    const day7 = addDays(START, 6)
    expect(eveningScreen(view(db, noon(day7), 'en', { name: 'evening' }))).toContain('href="#/report"')
    expect(eveningScreen(view(db, noon(START), 'en', { name: 'evening' }))).not.toContain('href="#/report"')
  })
})

describe('today against yesterday', () => {
  it('compares browse averages and leaves the delta empty without yesterday', () => {
    const db = base()
    const day2 = addDays(START, 1)
    db.events = [pause(START, 9, 4), pause(START, 10, 6), pause(day2, 9, 7), pause(day2, 10, 8), pause(day2, 11, 1, 'post')]
    expect(todayVsYesterday(db, day2)).toEqual({ today: 7.5, yesterday: 5, todayPauses: 2, yesterdayPauses: 2, delta: 2.5 })
    expect(todayVsYesterday(db, START)).toEqual({ today: 5, yesterday: null, todayPauses: 2, yesterdayPauses: 0, delta: null })
  })

  it('renders the line on Today, and nothing before the first pause', () => {
    const db = base()
    const day2 = addDays(START, 1)
    const dict = dictionary('en')
    expect(dayCompareLine(db, day2, dict)).toBe('')
    db.events = [pause(START, 9, 4), pause(day2, 9, 7)]
    expect(dayCompareLine(db, day2, dict)).toContain('Average today 7 · yesterday 4')
    db.events = [pause(day2, 9, 7)]
    expect(dayCompareLine(db, day2, dictionary('ru'))).toContain('вчера пауз не было')
    db.events = [pause(START, 9, 7), pause(day2, 9, 7)]
    expect(dayCompareLine(db, day2, dict)).toContain('the same as yesterday')
    db.events = [pause(day2, 9, 3)]
    expect(todayScreen(view(db, noon(day2), 'en', { name: 'today' }))).toContain('data-card="dayCompare"')
  })

  it('names the seeking behind today’s low scores once it repeats', () => {
    const db = base()
    db.events = [pause(START, 9, 3), pause(START, 10, 8, 'open', { seeking: 'validation' })]
    expect(seekingWhenLowOn(db, START)).toBeNull()
    db.events.push(pause(START, 11, 4))
    expect(seekingWhenLowOn(db, START)).toEqual({ key: 'boredom', n: 2 })
    expect(dayCompareLine(db, START, dictionary('en'))).toContain('you were seeking: boredom')
  })
})

describe('report screen', () => {
  it('parses #/report', () => {
    expect(parseHash('#/report')).toEqual({ name: 'report' })
  })

  it('explains itself before the protocol starts', () => {
    const html = reportScreen(view(emptyDatabase(), noon(START)))
    expect(html).toContain(dictionary('en').report.none)
  })

  it('renders the full day 7 report through the router', () => {
    const db = base()
    const day7 = addDays(START, 6)
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(START, day)
      db.events.push(pause(date, 9, 8, 'close'), pause(date, 21, 3, 'open', { triggerId: 'youtube' }))
    }
    db.evenings = [{ date: day7, at: at(day7, 22), lowestMoment: '', note: '', unloggedMisses: 1, likesChanged: 'no', whereItBroke: 'Late evenings' }]
    const html = render(view(db, noon(day7)))
    expect(html).toContain('data-screen="report"')
    expect(html).toContain('Pauses that happened: 14. Misses: 1.')
    expect(html).toContain('93% of the pulls met a pause.')
    expect(html).toContain('Highest: morning (05–12), average 8.')
    expect(html).toContain('Lowest: evening (18–23), average 3.')
    expect(html).toContain('No, it did not change.')
    expect(html).toContain('Late evenings')
    expect(html).toContain('data-trigger="youtube"')
    expect(html).not.toContain('data-card="reportForming"')
  })

  it('marks an unfinished week in Russian', () => {
    const db = base()
    const html = reportScreen(view(db, noon(addDays(START, 2)), 'ru'))
    expect(html).toContain('День 3 из 7')
    expect(html).toContain('Ни один триггер пока не встретился дважды.')
  })

  it('is linked from Today on day 7 and not before', () => {
    const db = base()
    expect(todayScreen(view(db, noon(addDays(START, 6)), 'en', { name: 'today' }))).toContain('href="#/report"')
    expect(todayScreen(view(db, noon(addDays(START, 3)), 'en', { name: 'today' }))).not.toContain('href="#/report"')
  })

  it('uses local dates for the protocol range', () => {
    expect(localDate(new Date(at(START, 0, 5)))).toBe(START)
  })
})
