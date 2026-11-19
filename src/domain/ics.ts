import type { Database } from './types'

function formatTimestamp(d: Date) {
  return d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'
}

export function icsFile(db: Database): string {
  const events = [
    ...db.focuses.filter((f) => f.endedAt).map((f) => ({
      title: 'Focus block',
      start: new Date(f.startedAt),
      end: new Date(f.endedAt!),
    })),
    ...db.sessions.filter((s) => s.endedAt).map((s) => ({
      title: 'Session',
      start: new Date(s.startedAt),
      end: new Date(s.endedAt!),
    })),
  ]

  let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//Supacon//EN\n'
  for (const ev of events) {
    ics += 'BEGIN:VEVENT\n'
    ics += `SUMMARY:${ev.title}\n`
    ics += `DTSTART:${formatTimestamp(ev.start)}\n`
    ics += `DTEND:${formatTimestamp(ev.end)}\n`
    ics += 'END:VEVENT\n'
  }
  ics += 'END:VCALENDAR'
  return ics
}
