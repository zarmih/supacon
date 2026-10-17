import type { Database } from './types'
import { isBrowsePause } from './pause'
import { findThreshold } from './insights'

export const CSV_COLUMNS = [
  'id',
  'date',
  'time',
  'intent',
  'trigger',
  'awareness_before',
  'seeking',
  'choice',
  'awareness_after',
  'threshold',
  'session_answered',
  'over_limit',
  'elapsed_seconds',
] as const

export function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return ''
  const str = String(value)
  if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

export function formatTime(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const match = iso.match(/(\d{1,2}:\d{2})/)
    return match ? match[1]! : iso
  }
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${h}:${m}`
}

export function formatCsv(db: Database): string {
  const header = CSV_COLUMNS.join(',')
  if (db.events.length === 0) {
    return header
  }

  const browseRows = db.events.filter(isBrowsePause).map((event) => ({
    awareness: event.awarenessBefore,
    seeking: event.seeking,
    choice: event.choice,
    triggerId: event.triggerId,
    at: event.at,
    after: event.awarenessAfter,
    dayNumber: event.dayNumber,
    finish: event.finish,
    date: event.date,
  }))
  const thresholdCut = findThreshold(browseRows)?.cut ?? ''

  const lines: string[] = [header]

  for (const event of db.events) {
    const session = db.sessions.find((s) => s.pauseId === event.id)
    const seeking = event.seekingNote ? `${event.seeking}: ${event.seekingNote}` : event.seeking
    const sessionAnswered = session ? (session.found ?? '') : ''

    const fields = [
      event.id,
      event.date,
      formatTime(event.at),
      event.intent,
      event.triggerId,
      event.awarenessBefore,
      seeking,
      event.choice,
      event.awarenessAfter ?? '',
      thresholdCut,
      sessionAnswered,
      event.overLimit,
      event.elapsedSeconds,
    ]

    lines.push(fields.map(escapeCsv).join(','))
  }

  return lines.join('\r\n')
}
