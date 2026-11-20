import { createId } from './ids'
import type { Database } from './types'

export interface IcsEvent {
  uid: string
  title: string
  start: Date
  end: Date
  description?: string
}

/**
 * Escapes TEXT values according to RFC 5545 Section 3.3.11:
 * - Backslash (\) -> \\
 * - Semicolon (;) -> \;
 * - Comma (,) -> \,
 * - Newlines (\r\n, \n, \r) -> \n
 */
export function escapeIcs(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\n|\r/g, '\\n')
}

/**
 * Formats a Date into RFC 5545 UTC date-time string: YYYYMMDDTHHMMSSZ.
 */
export function formatIcsDate(d: Date): string {
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  const h = String(d.getUTCHours()).padStart(2, '0')
  const min = String(d.getUTCMinutes()).padStart(2, '0')
  const s = String(d.getUTCSeconds()).padStart(2, '0')
  return `${y}${m}${day}T${h}${min}${s}Z`
}

/**
 * Generates an RFC 5545 compliant iCalendar (.ics) string with CRLF line endings,
 * UID, DTSTAMP in UTC, and escaped text fields.
 */
export function icsFile(db: Database, now: Date = new Date()): string {
  const dtstamp = formatIcsDate(now)

  const focusEvents: IcsEvent[] = db.focuses
    .filter((f) => f.endedAt || (f.startedAt && f.plannedMinutes > 0))
    .map((f) => {
      const start = new Date(f.startedAt)
      const end = f.endedAt
        ? new Date(f.endedAt)
        : new Date(start.getTime() + f.plannedMinutes * 60_000)
      return {
        uid: `${f.id || createId()}@supacon`,
        title: 'Focus block',
        start,
        end,
      }
    })

  const sessionEvents: IcsEvent[] = db.sessions
    .filter((s) => s.endedAt || (s.startedAt && (s.plannedMinutes + (s.extendedMinutes || 0)) > 0))
    .map((s) => {
      const start = new Date(s.startedAt)
      const durationMin = s.plannedMinutes + (s.extendedMinutes || 0)
      const end = s.endedAt
        ? new Date(s.endedAt)
        : new Date(start.getTime() + durationMin * 60_000)
      return {
        uid: `${s.id || createId()}@supacon`,
        title: 'Session',
        start,
        end,
      }
    })

  const validEvents = [...focusEvents, ...sessionEvents].filter(
    (ev) =>
      !Number.isNaN(ev.start.getTime()) &&
      !Number.isNaN(ev.end.getTime()) &&
      ev.end.getTime() >= ev.start.getTime(),
  )

  validEvents.sort((a, b) => a.start.getTime() - b.start.getTime() || a.uid.localeCompare(b.uid))

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Supacon//EN',
    'CALSCALE:GREGORIAN',
  ]

  for (const ev of validEvents) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${escapeIcs(ev.uid)}`)
    lines.push(`DTSTAMP:${dtstamp}`)
    lines.push(`DTSTART:${formatIcsDate(ev.start)}`)
    lines.push(`DTEND:${formatIcsDate(ev.end)}`)
    lines.push(`SUMMARY:${escapeIcs(ev.title)}`)
    if (ev.description) {
      lines.push(`DESCRIPTION:${escapeIcs(ev.description)}`)
    }
    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')
  return lines.join('\r\n') + '\r\n'
}
