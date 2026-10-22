import { describe, expect, it } from 'vitest'
import type { Database, PauseEvent, Session } from '../src/domain/types'
import { emptyDatabase } from '../src/store/defaults'
import { createSync, mergeDatabases, peekDb, same } from '../src/store/merge'
import {
  completeOnboarding,
  endFocus,
  endSession,
  saveMorning,
  startFocus,
  toggleTrigger,
  updateSettings,
} from '../src/store/mutate'
import { memoryStore, STORAGE_KEY } from '../src/store/storage'

const now = new Date('2026-10-20T09:00:00.000Z')

function onboarded(): Database {
  return completeOnboarding(emptyDatabase(), {
    triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
    path: 'protocol',
    now,
  })
}

function event(id: string, at: string, extra: Partial<PauseEvent> = {}): PauseEvent {
  return {
    id,
    at,
    date: at.slice(0, 10),
    intent: 'browse',
    triggerId: 'instagram',
    awarenessBefore: 4,
    seeking: 'boredom',
    seekingNote: '',
    choice: 'close',
    overLimit: false,
    elapsedSeconds: 12,
    dayNumber: 1,
    phase: 'calibration',
    ...extra,
  }
}

function session(id: string, pauseId: string, startedAt: string, extra: Partial<Session> = {}): Session {
  return {
    id,
    pauseId,
    triggerId: 'instagram',
    startedAt,
    date: startedAt.slice(0, 10),
    plannedMinutes: 15,
    extendedMinutes: 0,
    awarenessAtStart: 5,
    seeking: 'habit',
    overLimit: false,
    ...extra,
  }
}

function withEvents(db: Database, ...events: PauseEvent[]): Database {
  return { ...structuredClone(db), events: [...db.events, ...events] }
}

describe('mergeDatabases', () => {
  it('keeps pauses committed in both tabs, in time order', () => {
    const base = onboarded()
    const ours = withEvents(base, event('a', '2026-10-20T10:05:00.000Z'))
    const theirs = withEvents(base, event('b', '2026-10-20T10:01:00.000Z'))
    const merged = mergeDatabases(base, ours, theirs)
    expect(merged.events.map((item) => item.id)).toEqual(['b', 'a'])
    expect(mergeDatabases(base, theirs, ours).events.map((item) => item.id)).toEqual(['b', 'a'])
  })

  it('does not modify its inputs', () => {
    const base = onboarded()
    const ours = withEvents(base, event('a', '2026-10-20T10:05:00.000Z'))
    const theirs = withEvents(base, event('b', '2026-10-20T10:01:00.000Z'))
    const snapshot = structuredClone([base, ours, theirs])
    mergeDatabases(base, ours, theirs)
    expect([base, ours, theirs]).toEqual(snapshot)
  })

  it('folds the same pause committed twice into one, first commit wins', () => {
    const base = onboarded()
    const first = withEvents(base, event('p', '2026-10-20T10:00:00.000Z', { choice: 'open' }))
    first.sessions = [session('s1', 'p', '2026-10-20T10:00:00.000Z')]
    const second = withEvents(base, event('p', '2026-10-20T10:00:30.000Z', { choice: 'open' }))
    second.sessions = [session('s2', 'p', '2026-10-20T10:00:30.000Z')]
    for (const merged of [mergeDatabases(base, second, first), mergeDatabases(base, first, second)]) {
      expect(merged.events).toHaveLength(1)
      expect(merged.events[0]?.at).toBe('2026-10-20T10:00:00.000Z')
      expect(merged.sessions.map((item) => item.id)).toEqual(['s1'])
    }
  })

  it('folds a duplicated postpone for one pause', () => {
    const base = onboarded()
    const ours = structuredClone(base)
    ours.postpones = [{ id: 'x', pauseId: 'p', triggerId: 'instagram', at: '2026-10-20T10:00:10.000Z', until: '2026-10-20T10:30:10.000Z' }]
    const theirs = structuredClone(base)
    theirs.postpones = [{ id: 'y', pauseId: 'p', triggerId: 'instagram', at: '2026-10-20T10:00:00.000Z', until: '2026-10-20T10:30:00.000Z' }]
    expect(mergeDatabases(base, ours, theirs).postpones.map((item) => item.id)).toEqual(['y'])
  })

  it('honours a deletion made in the other tab', () => {
    const base = withEvents(onboarded(), event('a', '2026-10-20T10:00:00.000Z'), event('b', '2026-10-20T10:01:00.000Z'))
    const theirs = { ...structuredClone(base), events: base.events.filter((item) => item.id !== 'a') }
    const ours = withEvents(base, event('c', '2026-10-20T10:02:00.000Z'))
    expect(mergeDatabases(base, ours, theirs).events.map((item) => item.id)).toEqual(['b', 'c'])
  })

  it('a reset in another tab clears what this tab had already saved, but keeps what it added since', () => {
    const base = withEvents(onboarded(), event('a', '2026-10-20T10:00:00.000Z'))
    const theirs = emptyDatabase()
    const merged = mergeDatabases(base, base, theirs)
    expect(merged).toEqual(theirs)
    const later = mergeDatabases(base, withEvents(base, event('n', '2026-10-20T11:00:00.000Z')), theirs)
    expect(later.events.map((item) => item.id)).toEqual(['n'])
    expect(later.onboardingComplete).toBe(false)
  })

  it('a reset in this tab wins over records the other tab did not change', () => {
    const base = withEvents(onboarded(), event('a', '2026-10-20T10:00:00.000Z'))
    const merged = mergeDatabases(base, emptyDatabase(), base)
    expect(merged.events).toEqual([])
    expect(merged.onboardingComplete).toBe(false)
  })

  it('merges settings field by field, the newer write wins a shared field', () => {
    const base = onboarded()
    const ours = updateSettings(base, { theme: 'paper', sessionMinutes: 20 })
    const theirs = updateSettings(base, { lang: 'ru', sessionMinutes: 10 })
    const merged = mergeDatabases(base, ours, theirs)
    expect(merged.settings.theme).toBe('paper')
    expect(merged.settings.lang).toBe('ru')
    expect(merged.settings.sessionMinutes).toBe(20)
  })

  it('takes the other tab’s settings when this tab did not touch them', () => {
    const base = onboarded()
    const theirs = updateSettings(base, { windows: ['09:00'], haptics: false })
    expect(mergeDatabases(base, base, theirs).settings).toEqual(theirs.settings)
  })

  it('an ended session beats a still-running copy, whichever tab is newer', () => {
    const base = onboarded()
    base.sessions = [session('s', 'p', '2026-10-20T10:00:00.000Z')]
    const ended = endSession(base, 's', 'yes', new Date('2026-10-20T10:10:00.000Z'))
    const extended = { ...structuredClone(base), sessions: [session('s', 'p', '2026-10-20T10:00:00.000Z', { extendedMinutes: 15 })] }
    for (const merged of [mergeDatabases(base, extended, ended), mergeDatabases(base, ended, extended)]) {
      expect(merged.sessions[0]?.endedAt).toBe('2026-10-20T10:10:00.000Z')
      expect(merged.sessions[0]?.found).toBe('yes')
    }
  })

  it('leaves at most one running session, the newest replacing the older', () => {
    const base = onboarded()
    const ours = { ...structuredClone(base), sessions: [session('s1', 'p1', '2026-10-20T10:00:00.000Z')] }
    const theirs = { ...structuredClone(base), sessions: [session('s2', 'p2', '2026-10-20T10:03:00.000Z')] }
    const merged = mergeDatabases(base, ours, theirs)
    expect(merged.sessions.filter((item) => !item.endedAt).map((item) => item.id)).toEqual(['s2'])
    expect(merged.sessions[0]).toMatchObject({ id: 's1', endedAt: '2026-10-20T10:03:00.000Z', endReason: 'replaced' })
  })

  it('leaves at most one running focus block', () => {
    const base = onboarded()
    const ours = startFocus(base, new Date('2026-10-20T10:05:00.000Z'))
    const theirs = startFocus(base, new Date('2026-10-20T10:00:00.000Z'))
    const merged = mergeDatabases(base, ours, theirs)
    expect(merged.focuses).toHaveLength(1)
    expect(merged.focuses[0]?.startedAt).toBe('2026-10-20T10:00:00.000Z')
    const stopped = endFocus(theirs, theirs.focuses[0]?.id ?? '', true, new Date('2026-10-20T10:45:00.000Z'))
    expect(mergeDatabases(theirs, theirs, stopped).focuses[0]?.completed).toBe(true)
  })

  it('keeps the later morning check-in for the same day', () => {
    const base = onboarded()
    const ours = saveMorning(base, { awareness: 6, firstDesire: 'tea', now: new Date('2026-10-20T07:10:00.000Z') })
    const theirs = saveMorning(base, { awareness: 3, firstDesire: 'phone', now: new Date('2026-10-20T07:00:00.000Z') })
    for (const merged of [mergeDatabases(base, ours, theirs), mergeDatabases(base, theirs, ours)]) {
      expect(merged.mornings).toHaveLength(1)
      expect(merged.mornings[0]?.firstDesire).toBe('tea')
    }
  })

  it('merges trigger toggles from both tabs', () => {
    const base = completeOnboarding(emptyDatabase(), {
      triggers: [
        { id: 'instagram', label: 'Instagram', preset: true },
        { id: 'tiktok', label: 'TikTok', preset: true },
      ],
      path: 'protocol',
      now,
    })
    const ours = toggleTrigger(base, 'instagram')
    const theirs = toggleTrigger(base, 'tiktok')
    const merged = mergeDatabases(base, ours, theirs)
    expect(merged.triggers.map((item) => [item.id, item.enabled])).toEqual([
      ['instagram', false],
      ['tiktok', false],
      ['other', true],
    ])
  })

  it('ignores key order when deciding whether something changed', () => {
    expect(same({ a: 1, b: [1, { c: 2 }] }, { b: [1, { c: 2 }], a: 1 })).toBe(true)
    expect(same({ a: 1, b: undefined }, { a: 1 })).toBe(true)
    expect(same({ a: 1 }, { a: 2 })).toBe(false)
  })
})

describe('createSync', () => {
  it('merges into what storage holds instead of overwriting it', () => {
    const kv = memoryStore()
    const start = onboarded()
    kv.set(STORAGE_KEY, JSON.stringify(start))
    const tabA = createSync(kv, start)
    const tabB = createSync(kv, start)
    const savedA = tabA.write(withEvents(start, event('a', '2026-10-20T10:00:00.000Z')))
    // Tab B has not seen A's write yet.
    const savedB = tabB.write(withEvents(start, event('b', '2026-10-20T10:01:00.000Z')))
    expect(savedA.events.map((item) => item.id)).toEqual(['a'])
    expect(savedB.events.map((item) => item.id)).toEqual(['a', 'b'])
    expect(peekDb(kv)?.events.map((item) => item.id)).toEqual(['a', 'b'])
  })

  it('receives without writing back', () => {
    const kv = memoryStore()
    const start = onboarded()
    kv.set(STORAGE_KEY, JSON.stringify(start))
    const tabA = createSync(kv, start)
    const tabB = createSync(kv, start)
    tabA.write(withEvents(start, event('a', '2026-10-20T10:00:00.000Z')))
    const raw = kv.get(STORAGE_KEY)
    let writes = 0
    const watched = { ...kv, set: (key: string, value: string) => ((writes += 1), kv.set(key, value)) }
    const tabC = createSync(watched, start)
    const received = tabC.receive(start)
    expect(writes).toBe(0)
    expect(kv.get(STORAGE_KEY)).toBe(raw)
    expect(received?.events.map((item) => item.id)).toEqual(['a'])
    expect(tabB.receive(start)?.events.map((item) => item.id)).toEqual(['a'])
  })

  it('keeps a change this tab could not save when another tab writes', () => {
    const kv = memoryStore()
    const start = onboarded()
    kv.set(STORAGE_KEY, JSON.stringify(start))
    const tab = createSync(kv, start)
    const unsaved = withEvents(start, event('mine', '2026-10-20T10:00:00.000Z'))
    kv.set(STORAGE_KEY, JSON.stringify(withEvents(start, event('other', '2026-10-20T10:01:00.000Z'))))
    const received = tab.receive(unsaved)
    expect(received?.events.map((item) => item.id)).toEqual(['mine', 'other'])
    tab.write(received as Database)
    expect(peekDb(kv)?.events.map((item) => item.id)).toEqual(['mine', 'other'])
  })

  it('writes straight through when storage is empty or unreadable, and peek never touches the backup', () => {
    const kv = memoryStore()
    kv.set(STORAGE_KEY, '{broken')
    expect(peekDb(kv)).toBeNull()
    expect(kv.get('supacon.v1.bak')).toBeNull()
    const tab = createSync(kv, emptyDatabase())
    const db = onboarded()
    expect(tab.write(db)).toEqual(db)
    expect(peekDb(kv)?.onboardingComplete).toBe(true)
    expect(tab.receive(db)).toEqual(db)
  })
})
