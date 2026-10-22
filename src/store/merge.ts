import type { Database, Settings } from '../domain/types'
import { normalizeDatabase, STORAGE_KEY, type KeyValue } from './storage'

/**
 * Cross-tab merging.
 *
 * Every tab keeps the last snapshot it agreed with storage on (the base). When a tab
 * writes, or when another tab's write arrives through the `storage` event, the three
 * versions are merged: base, ours (this tab), theirs (what storage holds now).
 *
 * - Records are matched by key. A record one side added is kept; a record one side
 *   removed (relative to base) is removed, unless the other side changed it.
 * - A record both sides changed is resolved deterministically per collection
 *   (an ended session beats a running one, a later review beats an earlier one,
 *   the first commit of the same pause wins).
 * - Settings and top-level scalars merge per field; the side that changed a field wins,
 *   and when both changed it the side being written now (ours) wins.
 * - Afterwards at most one session and one focus block stay running.
 *
 * Nothing here touches the in-memory pause draft; it lives outside the database.
 */

export type Side = 'ours' | 'theirs'

type Keyed = unknown

interface Collection<T extends Keyed> {
  key: (item: T) => string
  /** Positive when `a` should win over `b`, negative when `b` should, 0 for a tie (ours wins). */
  compare?: (a: T, b: T) => number
  /** Sort key for a stable, deterministic order. Absent keeps theirs-then-ours order. */
  order?: (item: T) => string
}

type Row<K extends keyof Database> = Database[K] extends (infer T)[] ? T : never

function stamp(value: string | undefined): number {
  if (!value) return Number.NaN
  const time = Date.parse(value)
  return Number.isFinite(time) ? time : Number.NaN
}

/** Earlier wins: the first tab to commit something owns it. */
function earlier(a: string | undefined, b: string | undefined): number {
  const x = stamp(a)
  const y = stamp(b)
  if (Number.isNaN(x) || Number.isNaN(y) || x === y) return 0
  return x < y ? 1 : -1
}

/** Later wins: the latest edit of a daily entry is the one the person meant. */
function later(a: string | undefined, b: string | undefined): number {
  return -earlier(a, b)
}

function endedFirst(a: { endedAt?: string }, b: { endedAt?: string }): number {
  if (Boolean(a.endedAt) !== Boolean(b.endedAt)) return a.endedAt ? 1 : -1
  return 0
}

const collections: { [K in keyof Database]?: Collection<Row<K>> } = {
  triggers: { key: (item) => item.id },
  events: { key: (item) => item.id, compare: (a, b) => earlier(a.at, b.at), order: (item) => item.at },
  sessions: {
    // One pause opens at most one session. Keying by pause folds a pause committed twice.
    key: (item) => item.pauseId,
    compare: (a, b) => {
      if (a.id !== b.id) return earlier(a.startedAt, b.startedAt)
      return endedFirst(a, b) || a.extendedMinutes - b.extendedMinutes || Number(Boolean(a.found)) - Number(Boolean(b.found))
    },
    order: (item) => item.startedAt,
  },
  mornings: { key: (item) => item.date, compare: (a, b) => later(a.at, b.at), order: (item) => item.date },
  evenings: { key: (item) => item.date, compare: (a, b) => later(a.at, b.at), order: (item) => item.date },
  focuses: {
    key: (item) => item.id,
    compare: (a, b) => endedFirst(a, b),
    order: (item) => item.startedAt,
  },
  // One pause postpones at most once.
  postpones: { key: (item) => item.pauseId, compare: (a, b) => earlier(a.at, b.at), order: (item) => item.at },
  misses: { key: (item) => item.id, order: (item) => item.at },
  dayMarks: { key: (item) => item.date, order: (item) => item.date },
  experiments: { key: (item) => `${item.id}:${item.weekIndex}` },
}

/** Deep equality that ignores key order. Values are plain JSON. */
export function same(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => same(item, b[index]))
  }
  const x = a as Record<string, unknown>
  const y = b as Record<string, unknown>
  const keys = Object.keys(x).filter((key) => x[key] !== undefined)
  const other = Object.keys(y).filter((key) => y[key] !== undefined)
  return keys.length === other.length && keys.every((key) => same(x[key], y[key]))
}

function index<T>(items: T[], key: (item: T) => string): Map<string, T> {
  const map = new Map<string, T>()
  // The first record with a key wins, so a duplicate already in storage cannot multiply.
  for (const item of items) if (!map.has(key(item))) map.set(key(item), item)
  return map
}

function mergeRows<T extends Keyed>(spec: Collection<T>, base: T[], ours: T[], theirs: T[]): T[] {
  const baseMap = index(base, spec.key)
  const ourMap = index(ours, spec.key)
  const theirMap = index(theirs, spec.key)
  const keys: string[] = []
  const seen = new Set<string>()
  for (const key of [...theirMap.keys(), ...ourMap.keys()]) {
    if (!seen.has(key)) {
      seen.add(key)
      keys.push(key)
    }
  }
  const out: T[] = []
  for (const key of keys) {
    const was = baseMap.get(key)
    const mine = ourMap.get(key)
    const yours = theirMap.get(key)
    const mineChanged = !same(was, mine)
    const yoursChanged = !same(was, yours)
    let pick: T | undefined
    if (!mineChanged) pick = yours
    else if (!yoursChanged) pick = mine
    else if (mine === undefined) pick = yours
    else if (yours === undefined) pick = mine
    else if (same(mine, yours)) pick = mine
    else pick = (spec.compare?.(mine, yours) ?? 0) >= 0 ? mine : yours
    if (pick !== undefined) out.push(pick)
  }
  const order = spec.order
  if (!order) return out
  return out
    .map((item, position) => ({ item, position, sort: order(item) }))
    .sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : a.position - b.position))
    .map((entry) => entry.item)
}

function pickField<T>(base: T, ours: T, theirs: T): T {
  if (same(base, ours)) return theirs
  return ours
}

function mergeSettings(base: Settings, ours: Settings, theirs: Settings): Settings {
  const out = { ...theirs } as Record<string, unknown>
  const keys = new Set([...Object.keys(theirs), ...Object.keys(ours)]) as Set<keyof Settings>
  for (const key of keys) out[key] = pickField(base[key], ours[key], theirs[key])
  return out as unknown as Settings
}

/** Keep the newest running session (a new one replaces the old, as in commitPause) and the first running focus. */
function settleRunning(db: Database): void {
  const running = db.sessions.filter((session) => !session.endedAt)
  if (running.length > 1) {
    const newest = running.reduce((a, b) => (stamp(b.startedAt) > stamp(a.startedAt) ? b : a))
    db.sessions = db.sessions.map((session) =>
      session.endedAt || session === newest ? session : { ...session, endedAt: newest.startedAt, endReason: 'replaced' },
    )
  }
  const focuses = db.focuses.filter((focus) => !focus.endedAt)
  if (focuses.length > 1) {
    const first = focuses.reduce((a, b) => (stamp(b.startedAt) < stamp(a.startedAt) ? b : a))
    db.focuses = db.focuses.filter((focus) => focus.endedAt || focus === first)
  }
}

/**
 * Three-way merge. `base` is the last snapshot this tab shared with storage, `ours` is
 * this tab's database, `theirs` is what storage holds now. Inputs are not modified.
 */
export function mergeDatabases(base: Database | null, ours: Database, theirs: Database): Database {
  if (same(ours, theirs)) return structuredClone(ours)
  const root = base ?? emptyLike(theirs)
  const out = structuredClone(theirs) as Database
  const record = out as unknown as Record<string, unknown>
  for (const key of Object.keys(ours) as (keyof Database)[]) {
    if (key === 'settings') continue
    const spec = collections[key] as Collection<Keyed> | undefined
    if (spec) {
      const pick = mergeRows(
        spec,
        (root[key] as Keyed[] | undefined) ?? [],
        (ours[key] as Keyed[] | undefined) ?? [],
        (theirs[key] as Keyed[] | undefined) ?? [],
      )
      record[key] = structuredClone(pick)
    } else {
      record[key] = structuredClone(pickField(root[key], ours[key], theirs[key]))
    }
  }
  out.settings = structuredClone(mergeSettings(root.settings, ours.settings, theirs.settings))
  settleRunning(out)
  return out
}

function emptyLike(db: Database): Database {
  const out = structuredClone(db)
  for (const key of Object.keys(collections) as (keyof Database)[]) {
    ;(out as unknown as Record<string, unknown>)[key] = []
  }
  return out
}

/** Read the stored database without side effects (unlike loadDb, never touches the backup). */
export function peekDb(kv: KeyValue): Database | null {
  const raw = kv.get(STORAGE_KEY)
  if (!raw) return null
  try {
    return normalizeDatabase(JSON.parse(raw))
  } catch {
    return null
  }
}

/**
 * Per-tab sync state. `write` merges this tab's database into whatever storage holds and
 * saves the result; `receive` folds another tab's write in without writing back, so two
 * tabs never ping-pong.
 */
export function createSync(kv: KeyValue, initial: Database) {
  let base: Database = structuredClone(initial)
  return {
    /** Returns the merged database that was saved. Throws if storage refuses the write. */
    write(ours: Database): Database {
      const theirs = peekDb(kv)
      const merged = theirs ? mergeDatabases(base, ours, theirs) : ours
      kv.set(STORAGE_KEY, JSON.stringify(merged))
      base = structuredClone(merged)
      return merged
    },
    /** Returns the merged database, or null when storage holds nothing usable. */
    receive(ours: Database): Database | null {
      const theirs = peekDb(kv)
      if (!theirs) return null
      const merged = mergeDatabases(base, ours, theirs)
      base = theirs
      return merged
    },
    /** Storage was replaced outside `write` (backup restore). */
    reset(db: Database): void {
      base = structuredClone(db)
    },
  }
}
