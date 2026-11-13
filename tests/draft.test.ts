import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { choose, createDraft, DRAFT_MAX_AGE_MS, isRecoverable, normalizeDraft, setScore, setSeeking, type PauseDraft } from '../src/domain/pause'
import { clearDraft, DRAFT_KEY, LEGACY_DRAFT_KEY, migrateLegacyDraft, readDraft, writeDraft } from '../src/store/draft'
import { emptyDatabase } from '../src/store/defaults'
import { commitPause, completeOnboarding } from '../src/store/mutate'
import { memoryStore, type KeyValue } from '../src/store/storage'

const NOW = new Date(2026, 9, 10, 12, 0, 0).getTime()

function fresh(id = 'd1', now = NOW): PauseDraft {
  return createDraft({ id, intent: 'browse', triggerId: 'instagram', now, minSeconds: 10, completedPauses: 9 })
}

function answered(id = 'd1', now = NOW): PauseDraft {
  return setSeeking(setScore(fresh(id, now), 4), 'boredom')
}

describe('normalizeDraft', () => {
  it('round-trips a real draft', () => {
    const draft = answered()
    expect(normalizeDraft(JSON.parse(JSON.stringify(draft)))).toEqual(draft)
  })

  it('refuses values that are not a draft', () => {
    for (const bad of [null, 5, 'x', [], {}, { id: 'a' }, { id: 'a', intent: 'browse', triggerId: 't' }, { id: '', intent: 'browse', triggerId: 't', startedAt: 1 }]) {
      expect(normalizeDraft(bad)).toBeNull()
    }
  })

  it('falls back to the step that asks for a missing answer', () => {
    const base = { id: 'a', intent: 'browse', triggerId: 't', startedAt: NOW }
    expect(normalizeDraft({ ...base, step: 'after' })?.step).toBe('score')
    expect(normalizeDraft({ ...base, step: 'after', awarenessBefore: 5 })?.step).toBe('seeking')
    expect(normalizeDraft({ ...base, step: 'after', awarenessBefore: 5, seeking: 'habit' })?.step).toBe('choose')
    expect(normalizeDraft({ ...base, step: 'teleport', awarenessBefore: 5 })?.step).toBe('score')
  })

  it('drops a choice that does not belong to the intent', () => {
    const draft = normalizeDraft({ id: 'a', intent: 'post', triggerId: 't', startedAt: NOW, step: 'after', awarenessBefore: 5, seeking: 'seen', choice: 'open' })
    expect(draft?.choice).toBeUndefined()
    expect(draft?.step).toBe('choose')
  })

  it('never throws on arbitrary JSON', () => {
    fc.assert(fc.property(fc.jsonValue(), (value) => {
      const draft = normalizeDraft(value)
      if (draft) expect(typeof draft.id).toBe('string')
    }))
  })
})

describe('isRecoverable', () => {
  it('needs at least the first score', () => {
    expect(isRecoverable(fresh(), NOW)).toBe(false)
    expect(isRecoverable(setScore({ ...fresh(), step: 'score' }, 5), NOW)).toBe(true)
  })

  it('lets a day-old draft go', () => {
    expect(isRecoverable(answered(), NOW + DRAFT_MAX_AGE_MS - 1)).toBe(true)
    expect(isRecoverable(answered(), NOW + DRAFT_MAX_AGE_MS + 1)).toBe(false)
  })
})

describe('draft storage', () => {
  it('writes and reads back', () => {
    const kv = memoryStore()
    expect(writeDraft(kv, answered(), NOW)).toBe(true)
    expect(readDraft(kv, NOW)?.draft).toEqual(answered())
  })

  it('reports a refused write instead of throwing', () => {
    const full: KeyValue = { get: () => null, set: () => { throw new DOMException('full', 'QuotaExceededError') }, remove: () => {} }
    expect(writeDraft(full, answered())).toBe(false)
  })

  it('ignores damaged and expired values', () => {
    const kv = memoryStore()
    kv.set(DRAFT_KEY, '{oops')
    expect(readDraft(kv, NOW)).toBeNull()
    writeDraft(kv, answered(), NOW)
    expect(readDraft(kv, NOW + DRAFT_MAX_AGE_MS + 1)).toBeNull()
  })

  it('clears only the named draft', () => {
    const kv = memoryStore()
    writeDraft(kv, answered('newer'), NOW)
    clearDraft(kv, 'older')
    expect(readDraft(kv, NOW)?.draft.id).toBe('newer')
    clearDraft(kv, 'newer')
    expect(kv.get(DRAFT_KEY)).toBeNull()
  })

  it('moves a draft from the old per-tab slot once', () => {
    const kv = memoryStore()
    const legacy = memoryStore()
    legacy.set(LEGACY_DRAFT_KEY, JSON.stringify(answered('old')))
    migrateLegacyDraft(kv, legacy)
    expect(readDraft(kv, NOW)?.draft.id).toBe('old')
    expect(legacy.get(LEGACY_DRAFT_KEY)).toBeNull()
  })

  it('does not let a legacy draft replace a current one', () => {
    const kv = memoryStore()
    writeDraft(kv, answered('current'))
    const legacy = memoryStore()
    legacy.set(LEGACY_DRAFT_KEY, JSON.stringify(answered('old')))
    migrateLegacyDraft(kv, legacy)
    expect(readDraft(kv, NOW)?.draft.id).toBe('current')
  })
})

describe('commitPause with a recovered draft', () => {
  const db = completeOnboarding(emptyDatabase(), {
    triggers: [{ id: 'instagram', label: 'Instagram', preset: true }],
    path: 'protocol',
    now: new Date(2026, 9, 1, 9),
  })

  it('records the same draft once, however often it is committed', () => {
    const ready = choose(answered('same', NOW - 30_000), 'open', NOW)
    if (!ready) throw new Error('not ready')
    const once = commitPause(db, ready, new Date(NOW))
    if (!once) throw new Error('no commit')
    const twice = commitPause(once.db, ready, new Date(NOW + 5_000))
    expect(twice?.duplicate).toBe(true)
    expect(twice?.db).toBe(once.db)
    expect(twice?.sessionId).toBe(once.sessionId)
    expect(once.db.events.filter((event) => event.id === 'same')).toHaveLength(1)
    expect(once.db.sessions).toHaveLength(1)
  })
})
