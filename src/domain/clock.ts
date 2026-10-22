import type { Database, FocusBlock, Session } from './types'

/** Build a local-time Date from a calendar date. Avoids `YYYY-MM-DDTHH:mm` parsing differences. */
export function localDateTime(isoDate: string, hour: number, minute: number): Date {
  const parts = isoDate.split('-').map(Number)
  const year = parts[0] ?? 1970
  const month = parts[1] ?? 1
  const day = parts[2] ?? 1
  return new Date(year, month - 1, day, hour, minute, 0, 0)
}

export function sessionEndsAt(session: Session): number {
  return new Date(session.startedAt).getTime() + (session.plannedMinutes + session.extendedMinutes) * 60_000
}

export function focusEndsAt(focus: FocusBlock): number {
  return new Date(focus.startedAt).getTime() + focus.plannedMinutes * 60_000
}

export interface PendingPostpone {
  id: string
  triggerId: string
  until: number
  waiting: boolean
}

/** The latest postpone per trigger that has not been followed by another pause. */
export function pendingPostpones(db: Database, now: number): PendingPostpone[] {
  const horizon = now - 6 * 60 * 60 * 1000
  const latest = new Map<string, PendingPostpone>()
  for (const postpone of db.postpones) {
    const until = new Date(postpone.until).getTime()
    const at = new Date(postpone.at).getTime()
    if (until < horizon) continue
    const followed = db.events.some(
      (event) => event.triggerId === postpone.triggerId && new Date(event.at).getTime() > at,
    )
    if (followed) continue
    const current = latest.get(postpone.triggerId)
    if (current && current.until > until) continue
    latest.set(postpone.triggerId, {
      id: postpone.id,
      triggerId: postpone.triggerId,
      until,
      waiting: until > now,
    })
  }
  return [...latest.values()].sort((a, b) => a.until - b.until)
}
