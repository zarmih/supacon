import { DRAFT_MAX_AGE_MS, normalizeDraft, type PauseDraft } from '../domain/pause'
import type { KeyValue } from './storage'

/**
 * The unfinished pause lives next to the database, not inside it: it is not a record yet, it is
 * never exported, and it must not take part in the cross-tab merge. It is kept in localStorage
 * (not sessionStorage) so that closing the tab, a crash, the OS killing an installed app, or an
 * update reload does not lose it.
 */
export const DRAFT_KEY = 'supacon.v1.draft'
/** Where earlier versions kept the draft, per tab. Read once and moved. */
export const LEGACY_DRAFT_KEY = 'supacon.pause'

export interface StoredDraft {
  draft: PauseDraft
  savedAt: number
}

export function readDraft(kv: KeyValue, now: number = Date.now()): StoredDraft | null {
  let raw: string | null
  try {
    raw = kv.get(DRAFT_KEY)
  } catch {
    return null
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { draft?: unknown; savedAt?: unknown }
    const draft = normalizeDraft(parsed?.draft)
    if (!draft) return null
    if (now - draft.startedAt > DRAFT_MAX_AGE_MS) return null
    const savedAt = typeof parsed.savedAt === 'number' ? parsed.savedAt : draft.startedAt
    return { draft, savedAt }
  } catch {
    return null
  }
}

/** Returns false when storage refused the write (quota, private mode). The draft stays in memory. */
export function writeDraft(kv: KeyValue, draft: PauseDraft, now: number = Date.now()): boolean {
  try {
    kv.set(DRAFT_KEY, JSON.stringify({ draft, savedAt: now }))
    return true
  } catch {
    return false
  }
}

/**
 * Removes the stored draft. With `id`, only that draft is removed, so finishing an old pause in
 * one tab cannot delete a newer one another tab has just started.
 */
export function clearDraft(kv: KeyValue, id?: string): void {
  try {
    if (id) {
      const current = readDraft(kv, Number.NEGATIVE_INFINITY)
      if (current && current.draft.id !== id) return
    }
    kv.remove(DRAFT_KEY)
  } catch {
    // Nothing to do: a draft that cannot be removed is ignored once its pause is in the record.
  }
}

/** Moves a draft written by an older version (sessionStorage) into the shared slot, once. */
export function migrateLegacyDraft(kv: KeyValue, legacy: KeyValue | null): void {
  if (!legacy) return
  try {
    const raw = legacy.get(LEGACY_DRAFT_KEY)
    if (!raw) return
    legacy.remove(LEGACY_DRAFT_KEY)
    if (kv.get(DRAFT_KEY)) return
    const draft = normalizeDraft(JSON.parse(raw))
    if (draft) writeDraft(kv, draft)
  } catch {
    // A broken legacy value is simply dropped.
  }
}
