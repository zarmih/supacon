/** Calendar dates are `YYYY-MM-DD` in the user's local zone. Diffs use UTC so DST does not skip a day. */

export function localDate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseDate(iso: string): Date {
  const parts = iso.split('-')
  const y = Number(parts[0])
  const m = Number(parts[1])
  const d = Number(parts[2])
  if (!y || !m || !d) return new Date(NaN)
  return new Date(Date.UTC(y, m - 1, d))
}

export function addDays(iso: string, days: number): string {
  const next = new Date(parseDate(iso).getTime() + days * 86_400_000)
  const y = next.getUTCFullYear()
  const m = String(next.getUTCMonth() + 1).padStart(2, '0')
  const d = String(next.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function diffDays(from: string, to: string): number {
  return Math.round((parseDate(to).getTime() - parseDate(from).getTime()) / 86_400_000)
}

export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  return `${String(h).padStart(2, '0')}:00`
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/** A real calendar date in `YYYY-MM-DD` form. `2026-02-30` and `2026-13-01` are rejected. */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  if (Number.isNaN(parseDate(value).getTime())) return false
  // Date.UTC rolls impossible days into the next month; a real date survives the round trip.
  return addDays(value, 0) === value
}
