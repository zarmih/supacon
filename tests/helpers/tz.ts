/** Minimal view of Node's `process.env` so the helper typechecks without @types/node. */
const env = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env

/**
 * Run a block with `process.env.TZ` pinned to an IANA zone.
 * Node re-reads TZ on assignment, so `Date#getHours()` and friends follow it.
 * The previous value is restored even when the block throws.
 */
export function withTZ<T>(zone: string, fn: () => T): T {
  const previous = env.TZ
  env.TZ = zone
  try {
    return fn()
  } finally {
    if (previous === undefined) delete env.TZ
    else env.TZ = previous
  }
}

export const ZONES = ['Europe/Moscow', 'America/Los_Angeles'] as const
