import { describe, expect, it } from 'vitest'
import { activeExperiment, experimentDay, experimentOver, lastActivity, returnAfterBreak, weekReview } from '../src/domain/week'
import { emptyDatabase } from '../src/store/defaults'
import { mergeDatabases } from '../src/store/merge'
import { completeOnboarding, editExperiment, endExperiment, markExperiment, startExperiment } from '../src/store/mutate'
import { normalizeDatabase } from '../src/store/storage'
import type { Database } from '../src/domain/types'
import { pauseEvent } from './helpers/factory'
import { en } from '../src/i18n/en'
import { ru } from '../src/i18n/ru'

const NOW = new Date(2026, 10, 12, 12, 0, 0) // 2026-11-12, local

function base(): Database {
  const db = completeOnboarding(emptyDatabase(), {
    triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
    path: 'protocol',
    now: new Date(2026, 9, 20, 9),
  })
  db.practiceMode = 'deepening'
  return db
}

function started(startDate = '2026-11-10'): Database {
  return startExperiment(base(), { intention: '  Say it aloud  ', source: 'name-aloud', startDate, now: NOW })
}

describe('weekly experiment lifecycle', () => {
  it('starts one experiment with seven calendar days', () => {
    const db = started()
    const exp = activeExperiment(db)
    expect(exp).toMatchObject({ intention: 'Say it aloud', startDate: '2026-11-10', endDate: '2026-11-16', status: 'active', checks: [] })
    expect(experimentDay(exp!, '2026-11-12')).toBe(3)
    expect(experimentDay(exp!, '2026-11-09')).toBeNull()
    expect(experimentOver(exp!, '2026-11-16')).toBe(false)
    expect(experimentOver(exp!, '2026-11-17')).toBe(true)
  })

  it('refuses an empty intention and a second active experiment', () => {
    const empty = startExperiment(base(), { intention: '   ', source: 'own', startDate: '2026-11-12', now: NOW })
    expect(empty.weekly).toHaveLength(0)
    const db = started()
    expect(startExperiment(db, { intention: 'Another', source: 'own', startDate: '2026-11-12', now: NOW })).toBe(db)
  })

  it('marks once per date, replaces a mark, and refuses dates outside the week or in the future', () => {
    let db = started()
    const id = activeExperiment(db)!.id
    db = markExperiment(db, { id, date: '2026-11-12', result: 'partly', note: 'once', now: NOW })
    db = markExperiment(db, { id, date: '2026-11-12', result: 'did', note: 'twice', now: NOW })
    expect(activeExperiment(db)!.checks).toEqual([{ date: '2026-11-12', result: 'did', note: 'twice', at: NOW.toISOString() }])
    expect(markExperiment(db, { id, date: '2026-11-09', result: 'did', note: '', now: NOW })).toBe(db)
    expect(markExperiment(db, { id, date: '2026-11-13', result: 'did', note: '', now: NOW })).toBe(db)
  })

  it('edits the intention and ends early as stopped, keeping the marks', () => {
    let db = started()
    const id = activeExperiment(db)!.id
    db = markExperiment(db, { id, date: '2026-11-11', result: 'did', note: '', now: NOW })
    db = editExperiment(db, id, 'Say it aloud, once a day', NOW)
    expect(activeExperiment(db)!.intention).toBe('Say it aloud, once a day')
    db = endExperiment(db, id, NOW)
    expect(activeExperiment(db)).toBeNull()
    expect(db.weekly[0]).toMatchObject({ status: 'stopped', checks: [{ date: '2026-11-11' }] })
  })

  it('ends as finished once the week is over', () => {
    const db = started('2026-11-01')
    const ended = endExperiment(db, activeExperiment(db)!.id, NOW)
    expect(ended.weekly[0]?.status).toBe('finished')
  })
})

describe('weekReview', () => {
  it('with no data says nothing is recorded and suggests one pause', () => {
    const review = weekReview(started(), '2026-11-12')
    expect(review.browse.n).toBe(0)
    expect(review.elapsed).toBe(3)
    expect(review.limits).toEqual(['small-sample', 'partial-week', 'gaps', 'self-report', 'not-causal'])
    expect(review.next).toBe('start-small')
    expect(review.comparable).toBe(false)
  })

  it('with a small sample shows the count and compares nothing', () => {
    const db = started()
    db.events.push(pauseEvent({ date: '2026-11-10', awarenessBefore: 4, choice: 'open' }), pauseEvent({ date: '2026-11-11', awarenessBefore: 6 }))
    for (let i = 0; i < 6; i += 1) db.events.push(pauseEvent({ date: '2026-11-05', awarenessBefore: 3 }))
    const review = weekReview(db, '2026-11-12')
    expect(review.browse).toMatchObject({ n: 2, median: 5 })
    expect(review.previous.n).toBe(6)
    expect(review.comparable).toBe(false)
    expect(review.limits[0]).toBe('small-sample')
    expect(review.next).toBe('more-pauses')
  })

  it('compares only when both weeks have four pauses, and always says it is not causal', () => {
    let db = started('2026-11-03')
    const id = activeExperiment(db)!.id
    for (const date of ['2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06']) {
      db.events.push(pauseEvent({ date, awarenessBefore: 7, awarenessAfter: 8 }))
      db = markExperiment(db, { id, date, result: 'did', note: '', now: NOW })
    }
    for (const date of ['2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31']) db.events.push(pauseEvent({ date, awarenessBefore: 5 }))
    const review = weekReview(db, '2026-11-12')
    expect(review.elapsed).toBe(7)
    expect(review.comparable).toBe(true)
    expect(review.browse.median).toBe(7)
    expect(review.previous.median).toBe(5)
    expect(review.secondScores).toEqual({ n: 4, meanMove: 1 })
    expect(review.experiment).toMatchObject({ did: 4, unmarked: 3 })
    expect(review.limits).toContain('not-causal')
    expect(review.limits).not.toContain('small-sample')
    expect(review.next).toBe('repeat-or-next')
  })

  it('without an experiment reviews the last seven days', () => {
    const review = weekReview(base(), '2026-11-12', null)
    expect(review.start).toBe('2026-11-06')
    expect(review.end).toBe('2026-11-12')
    expect(review.experiment).toBeNull()
    expect(review.limits).not.toContain('not-causal')
  })

  it('has copy for every limit and step in both languages, with no causal claim', () => {
    for (const dict of [en, ru]) {
      for (const fn of Object.values(dict.week.limits)) expect(fn(3)).not.toBe('')
      const steps = Object.values(dict.week.steps).join(' ').toLowerCase()
      expect(steps).not.toMatch(/because of the experiment|благодаря эксперименту|proves|доказал/)
    }
  })
})

describe('return after a break', () => {
  it('needs three days without any record', () => {
    const db = base()
    db.startedOn = '2026-11-01'
    expect(returnAfterBreak(db, '2026-11-12')).toEqual({ last: '2026-11-01', days: 11 })
    db.events.push(pauseEvent({ date: '2026-11-10' }))
    expect(returnAfterBreak(db, '2026-11-12')).toBeNull()
    db.startedOn = '2026-10-20'
    db.events = [pauseEvent({ date: '2026-11-03' })]
    expect(returnAfterBreak(db, '2026-11-12')).toEqual({ last: '2026-11-03', days: 9 })
  })

  it('counts experiment marks as activity', () => {
    let db = started('2026-11-05')
    db = markExperiment(db, { id: activeExperiment(db)!.id, date: '2026-11-11', result: 'did', note: '', now: NOW })
    expect(lastActivity(db)).toBe('2026-11-11')
  })
})

describe('storage and merge of weekly experiments', () => {
  it('normalises stored experiments and keeps files without them working', () => {
    const db = started()
    const roundTrip = normalizeDatabase(JSON.parse(JSON.stringify(db)))
    expect(roundTrip?.weekly).toEqual(db.weekly)
    const old = JSON.parse(JSON.stringify(db))
    delete old.weekly
    expect(normalizeDatabase(old)?.weekly).toEqual([])
    const broken = JSON.parse(JSON.stringify(db))
    broken.weekly.push({ id: 'x', intention: '', startDate: '2026-11-01' }, { id: 'y', intention: 'ok', startDate: 'nope' }, 'junk')
    broken.weekly[0].checks = [{ date: '2026-11-11', result: 'did' }, { date: '2026-11-11', result: 'partly' }, { date: '2026-12-01', result: 'did' }, { date: '2026-11-12', result: 'great' }]
    const cleaned = normalizeDatabase(broken)
    expect(cleaned?.weekly).toHaveLength(1)
    expect(cleaned?.weekly[0]?.checks.map((check) => check.date)).toEqual(['2026-11-11'])
  })

  it('merges a mark from another tab by the later edit', () => {
    const shared = started()
    const id = activeExperiment(shared)!.id
    const theirs = markExperiment(shared, { id, date: '2026-11-12', result: 'did', note: '', now: new Date(NOW.getTime() + 1000) })
    const ours = editExperiment(shared, id, 'Edited earlier', NOW)
    const merged = mergeDatabases(shared, ours, theirs)
    expect(merged.weekly).toHaveLength(1)
    expect(merged.weekly[0]?.checks).toHaveLength(1)
  })
})
