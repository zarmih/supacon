import { describe, expect, it } from 'vitest'
import {
  activeFocus,
  activeSession,
  addTrigger,
  commitPause,
  completeOnboarding,
  endFocus,
  endSession,
  extendSession,
  logMiss,
  saveContact,
  saveEvening,
  saveMorning,
  setExperiment,
  startFocus,
  toggleTrigger,
  updateSettings,
} from '../src/store/mutate'
import { emptyDatabase } from '../src/store/defaults'
import { choose, createDraft, setFinish, setScore, setSeeking, setAfterScore, type PauseDraft } from '../src/domain/pause'
import type { Choice, Database, Impulse, Intent } from '../src/domain/types'

const NOW = new Date(2026, 9, 10, 12, 0, 0)

function base(): Database {
  return completeOnboarding(emptyDatabase(), {
    triggers: [
      { id: 'instagram', label: 'Instagram', preset: true },
      { id: 'custom', label: '  Telegram  ', preset: false },
    ],
    path: 'protocol',
    now: new Date(2026, 9, 1, 9),
  })
}

function ready(choice: Choice, opts: { intent?: Intent; seeking?: Impulse; id?: string; finish?: string } = {}): PauseDraft {
  const intent = opts.intent ?? 'browse'
  let d = createDraft({ id: opts.id ?? 'p', intent, triggerId: 'instagram', now: NOW.getTime() - 30_000, minSeconds: 10, completedPauses: 9 })
  d = setSeeking(setScore(d, 4), opts.seeking ?? (intent === 'browse' ? 'validation' : 'seen'))
  if (opts.finish !== undefined) d = setFinish(d, opts.finish)
  return choose(d, choice, NOW.getTime())!
}

describe('onboarding', () => {
  it('trims labels, skips empty and duplicate ids, and always adds "other"', () => {
    const db = completeOnboarding(emptyDatabase(), {
      triggers: [
        { id: 'a', label: '  A  ', preset: true },
        { id: 'a', label: 'dup', preset: true },
        { id: 'b', label: '   ', preset: false },
        { id: 'c', label: 'x'.repeat(80), preset: false },
      ],
      path: 'protocol',
      now: NOW,
    })
    expect(db.triggers.map((t) => [t.id, t.label.length])).toEqual([
      ['a', 1],
      ['c', 40],
      ['other', 'Something else'.length],
    ])
    expect(db.onboardingComplete).toBe(true)
    expect(db.startedOn).toBe('2026-10-10')
    expect(db.practiceMode).toBeNull()
  })

  it('does not duplicate a user-supplied "other"', () => {
    const db = completeOnboarding(emptyDatabase(), { triggers: [{ id: 'other', label: 'Иное', preset: true }], path: 'free', now: NOW })
    expect(db.triggers).toHaveLength(1)
    expect(db.triggers[0]!.label).toBe('Иное')
  })
})

describe('commitPause', () => {
  it('refuses a draft that is not ready', () => {
    const d = createDraft({ id: 'x', intent: 'browse', triggerId: 't', now: 0, minSeconds: 0, completedPauses: 9 })
    expect(commitPause(base(), d, NOW)).toBeNull()
  })

  it('records a postpone with its deadline and no session', () => {
    const result = commitPause(base(), ready('postpone'), NOW)!
    expect(result.sessionId).toBeUndefined()
    expect(result.db.postpones).toHaveLength(1)
    expect(result.db.postpones[0]!.until).toBe(new Date(NOW.getTime() + 30 * 60_000).toISOString())
    expect(result.db.events[0]).toMatchObject({ postponeMinutes: 30, elapsedSeconds: 30, dayNumber: 10 })
  })

  it('keeps the finish line only for opens and copies it to the session', () => {
    const open = commitPause(base(), ready('open', { finish: '  one video  ' }), NOW)!
    expect(open.db.events[0]!.finish).toBe('one video')
    expect(open.db.sessions[0]!.finish).toBe('one video')
    const close = commitPause(base(), ready('close', { finish: 'x' }), NOW)!
    expect(close.db.events[0]).not.toHaveProperty('finish')
    const bare = commitPause(base(), ready('open', { finish: '   ' }), NOW)!
    expect(bare.db.sessions[0]).not.toHaveProperty('finish')
  })

  it('replaces a running session when a new open starts', () => {
    const first = commitPause(base(), ready('open', { id: 'one' }), NOW)!
    const second = commitPause(first.db, ready('open', { id: 'two' }), NOW)!
    const [old, current] = second.db.sessions
    expect(old).toMatchObject({ endReason: 'replaced', endedAt: NOW.toISOString() })
    expect(current!.endedAt).toBeUndefined()
    expect(activeSession(second.db)?.id).toBe(second.sessionId)
  })

  it('a post never opens a session and an after-score is stored', () => {
    let draft = ready('post', { intent: 'post' })
    draft = setAfterScore(draft, 7)
    const result = commitPause(base(), draft, NOW)!
    expect(result.sessionId).toBeUndefined()
    expect(result.db.events[0]).toMatchObject({ intent: 'post', awarenessAfter: 7, overLimit: false })
  })

  it('does not mutate the input database', () => {
    const db = base()
    const snapshot = structuredClone(db)
    commitPause(db, ready('open'), NOW)
    expect(db).toEqual(snapshot)
  })
})

describe('sessions and focus', () => {
  it('ending or extending an unknown or finished session is a no-op', () => {
    const { db, sessionId } = commitPause(base(), ready('open'), NOW)!
    expect(endSession(db, 'nope', 'yes', NOW)).toBe(db)
    expect(extendSession(db, 'nope')).toBe(db)
    const extended = extendSession(db, sessionId!)
    expect(extended.sessions[0]!.extendedMinutes).toBe(15)
    const ended = endSession(extended, sessionId!, null, NOW, 'timer')
    expect(ended.sessions[0]).toMatchObject({ endReason: 'timer' })
    expect(ended.sessions[0]).not.toHaveProperty('found')
    expect(endSession(ended, sessionId!, 'yes', NOW)).toBe(ended)
    expect(activeSession(ended)).toBeNull()
  })

  it('only one focus runs at a time and ending is idempotent', () => {
    const db = startFocus(base(), NOW)
    expect(startFocus(db, NOW)).toBe(db)
    const focus = activeFocus(db)!
    expect(focus).toMatchObject({ date: '2026-10-10', plannedMinutes: 45, completed: false })
    const ended = endFocus(db, focus.id, true, NOW)
    expect(ended.focuses[0]!.completed).toBe(true)
    expect(endFocus(ended, focus.id, false, NOW)).toBe(ended)
    expect(endFocus(ended, 'nope', false, NOW)).toBe(ended)
    expect(activeFocus(ended)).toBeNull()
  })
})

describe('daily entries', () => {
  it('morning: refuses an empty desire, trims and replaces the same day', () => {
    const db = base()
    expect(saveMorning(db, { awareness: 5, firstDesire: '   ', now: NOW })).toBe(db)
    const once = saveMorning(db, { awareness: 5, firstDesire: ` ${'w'.repeat(300)} `, now: NOW })
    expect(once.mornings[0]!.firstDesire).toHaveLength(180)
    const twice = saveMorning(once, { awareness: 7, firstDesire: 'again', now: NOW })
    expect(twice.mornings).toHaveLength(1)
    expect(twice.mornings[0]!.awareness).toBe(7)
  })

  it('evening: clamps misses to 0..20, trims texts and replaces the same day', () => {
    const review = { date: '2026-10-10', at: '', lowestMoment: ` ${'l'.repeat(300)} `, note: 'n'.repeat(700), unloggedMisses: 99, whereItBroke: '  w  ' }
    const db = saveEvening(base(), review)
    expect(db.evenings[0]).toMatchObject({ unloggedMisses: 20, whereItBroke: 'w' })
    expect(db.evenings[0]!.lowestMoment).toHaveLength(180)
    expect(db.evenings[0]!.note).toHaveLength(600)
    const again = saveEvening(db, { ...review, unloggedMisses: -3 })
    expect(again.evenings).toHaveLength(1)
    expect(again.evenings[0]!.unloggedMisses).toBe(0)
    expect(saveEvening(db, { ...review, unloggedMisses: Number.NaN }).evenings[0]!.unloggedMisses).toBe(0)
  })

  it('contact: trims the note and replaces the same day', () => {
    let db = saveContact(base(), { date: '2026-10-05', realContact: true, note: '  coffee  ' })
    db = saveContact(db, { date: '2026-10-05', realContact: false, note: '' })
    expect(db.dayMarks).toEqual([{ date: '2026-10-05', realContact: false, contactNote: '' }])
  })

  it('miss: refuses an unknown trigger and drops invalid score and seeking', () => {
    expect(logMiss(base(), { triggerId: 'ghost', note: '', now: NOW })).toBeNull()
    const db = logMiss(base(), { triggerId: 'instagram', awareness: 11, seeking: 'nope' as never, note: '  n  ', now: NOW })!
    expect(db.misses[0]).toMatchObject({ triggerId: 'instagram', note: 'n', date: '2026-10-10' })
    expect(db.misses[0]).not.toHaveProperty('awareness')
    expect(db.misses[0]).not.toHaveProperty('seeking')
    const full = logMiss(base(), { triggerId: 'instagram', awareness: 3, seeking: 'relief', note: '', now: NOW })!
    expect(full.misses[0]).toMatchObject({ awareness: 3, seeking: 'relief' })
  })
})

describe('settings, triggers, experiments', () => {
  it('keeps the previous legal value for an illegal live edit', () => {
    let db = updateSettings(base(), { pauseSeconds: 15, sessionMinutes: 30 })
    db = updateSettings(db, {
      pauseSeconds: 7,
      sessionMinutes: 11,
      postponeMinutes: 1,
      focusMinutes: 2,
      maxSessionsPerDay: 9,
      haptics: 'x' as never,
      sound: undefined as never,
      eveningReminder: '9pm',
      lang: 'de' as never,
      theme: 'neon' as never,
      windows: ['20:00', '08:00', '08:00', 'bad'],
      windowMinutes: 60,
      nightStart: '23:00',
      nightEnd: 'bad',
      replacements: { approval: '  call a friend  ' } as never,
    })
    expect(db.settings).toMatchObject({
      pauseSeconds: 15,
      sessionMinutes: 30,
      postponeMinutes: 30,
      focusMinutes: 45,
      maxSessionsPerDay: 3,
      haptics: true,
      sound: true,
      eveningReminder: null,
      lang: 'auto',
      theme: 'ink',
      windows: ['08:00', '20:00'],
      windowMinutes: 60,
      nightStart: null,
      nightEnd: null,
    })
    expect(db.settings.replacements.approval).toBe('call a friend')
    expect(db.settings.replacements.loss).toBe('')
    expect(updateSettings(db, { eveningReminder: '21:30', lang: 'ru', theme: 'system' }).settings).toMatchObject({
      eveningReminder: '21:30',
      lang: 'ru',
      theme: 'system',
    })
  })

  it('adds custom triggers and refuses empty ones', () => {
    const db = base()
    expect(addTrigger(db, '   ', NOW)).toBe(db)
    const next = addTrigger(db, ` ${'t'.repeat(60)} `, NOW)
    const added = next.triggers.at(-1)!
    expect(added).toMatchObject({ preset: false, enabled: true })
    expect(added.label).toHaveLength(40)
  })

  it('toggles a trigger unless it is the last enabled one, and ignores unknown ids', () => {
    let db = base()
    expect(toggleTrigger(db, 'ghost')).toBe(db)
    db = toggleTrigger(db, 'instagram')
    db = toggleTrigger(db, 'custom')
    expect(db.triggers.filter((t) => t.enabled).map((t) => t.id)).toEqual(['other'])
    expect(toggleTrigger(db, 'other')).toBe(db)
    expect(toggleTrigger(db, 'instagram').triggers.find((t) => t.id === 'instagram')!.enabled).toBe(true)
  })

  it('stores one experiment mark per experiment and week', () => {
    let db = setExperiment(base(), { id: 'name-aloud', weekIndex: 1, status: 'open' })
    db = setExperiment(db, { id: 'name-aloud', weekIndex: 1, status: 'done' })
    db = setExperiment(db, { id: 'name-aloud', weekIndex: 6, status: 'dismissed' })
    expect(db.experiments).toEqual([
      { id: 'name-aloud', weekIndex: 1, status: 'done' },
      { id: 'name-aloud', weekIndex: 6, status: 'dismissed' },
    ])
  })
})
