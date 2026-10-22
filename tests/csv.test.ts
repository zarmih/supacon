import { describe, expect, it } from 'vitest'
import { CSV_COLUMNS, escapeCsv, formatCsv, formatTime } from '../src/domain/csv'
import { emptyDatabase } from '../src/store/defaults'
import { exampleDatabase } from '../src/domain/example'
import type { Database } from '../src/domain/types'

/**
 * Standard RFC 4180 CSV line parser supporting quoted fields with commas, newlines, and escaped quotes.
 */
function parseCsv(csvText: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const char = csvText[i]!
    const nextChar = csvText[i + 1]

    if (inQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          currentField += '"'
          i++ // skip next quote
        } else {
          inQuotes = false
        }
      } else {
        currentField += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        currentRow.push(currentField)
        currentField = ''
      } else if (char === '\r' && nextChar === '\n') {
        currentRow.push(currentField)
        rows.push(currentRow)
        currentRow = []
        currentField = ''
        i++ // skip \n
      } else if (char === '\n') {
        currentRow.push(currentField)
        rows.push(currentRow)
        currentRow = []
        currentField = ''
      } else {
        currentField += char
      }
    }
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField)
    rows.push(currentRow)
  }

  return rows
}

describe('CSV Export', () => {
  describe('escapeCsv unit tests', () => {
    it('handles null, undefined, numbers and booleans', () => {
      expect(escapeCsv(null)).toBe('')
      expect(escapeCsv(undefined)).toBe('')
      expect(escapeCsv(123)).toBe('123')
      expect(escapeCsv(true)).toBe('true')
      expect(escapeCsv(false)).toBe('false')
    })

    it('leaves plain strings without special characters unquoted', () => {
      expect(escapeCsv('instagram')).toBe('instagram')
      expect(escapeCsv('browse')).toBe('browse')
      expect(escapeCsv('10')).toBe('10')
    })

    it('quotes strings containing commas', () => {
      expect(escapeCsv('Instagram, Reels')).toBe('"Instagram, Reels"')
    })

    it('quotes strings and doubles double-quotes', () => {
      expect(escapeCsv('seeking "peace"')).toBe('"seeking ""peace"""')
      expect(escapeCsv('"quoted"')).toBe('"""quoted"""')
    })

    it('quotes strings containing newlines and carriage returns', () => {
      expect(escapeCsv('Line 1\nLine 2')).toBe('"Line 1\nLine 2"')
      expect(escapeCsv('Line 1\r\nLine 2')).toBe('"Line 1\r\nLine 2"')
    })

    it('handles strings combining quotes, commas, and newlines', () => {
      const input = 'Note: "urgent, please read"\nSecond line'
      const expected = '"Note: ""urgent, please read""\nSecond line"'
      expect(escapeCsv(input)).toBe(expected)
    })
  })

  describe('formatTime unit tests', () => {
    it('formats ISO string to HH:MM in local time', () => {
      const iso = '2026-10-10T14:35:00.000Z'
      const time = formatTime(iso)
      expect(time).toMatch(/^\d{2}:\d{2}$/)
    })

    it('handles empty or malformed input gracefully', () => {
      expect(formatTime('')).toBe('')
      expect(formatTime('12:45')).toBe('12:45')
    })
  })

  describe('formatCsv', () => {
    it('returns only the header row for an empty database', () => {
      const db = emptyDatabase()
      const csv = formatCsv(db)

      expect(csv).toBe(CSV_COLUMNS.join(','))

      const rows = parseCsv(csv)
      expect(rows.length).toBe(1)
      expect(rows[0]).toEqual([...CSV_COLUMNS])
      expect(rows[0]?.length).toBe(13)
    })

    it('correctly escapes special characters in note, finish line and triggers', () => {
      const db: Database = {
        ...emptyDatabase(),
        startedOn: '2026-10-10',
        triggers: [
          {
            id: 'trig-1',
            label: 'Instagram, Reels & "Shorts"',
            preset: false,
            enabled: true,
            createdAt: '2026-10-10T08:00:00Z',
          },
        ],
        events: [
          {
            id: 'evt-special-1',
            at: '2026-10-10T10:00:00.000Z',
            date: '2026-10-10',
            intent: 'browse',
            triggerId: 'trig-1',
            awarenessBefore: 3,
            seeking: 'stimulation',
            seekingNote: 'Bored, wanted "quick" fix,\nwith multiple lines & commas',
            choice: 'open',
            awarenessAfter: 5,
            overLimit: true,
            elapsedSeconds: 15,
            dayNumber: 1,
            phase: 'calibration',
            finish: 'Finished, closed tab "safely"\nDone.',
          },
          {
            id: 'evt-special-2',
            at: '2026-10-10T11:00:00.000Z',
            date: '2026-10-10',
            intent: 'post',
            triggerId: 'trig-1',
            awarenessBefore: 7,
            seeking: 'validation',
            seekingNote: 'simple note',
            choice: 'dont-post',
            overLimit: false,
            elapsedSeconds: 8,
            dayNumber: 1,
            phase: 'calibration',
          },
        ],
        sessions: [
          {
            id: 'sess-1',
            pauseId: 'evt-special-1',
            triggerId: 'trig-1',
            startedAt: '2026-10-10T10:00:00.000Z',
            date: '2026-10-10',
            plannedMinutes: 15,
            extendedMinutes: 0,
            endedAt: '2026-10-10T10:15:00.000Z',
            endReason: 'manual',
            awarenessAtStart: 3,
            seeking: 'stimulation',
            overLimit: true,
            found: 'partly',
            finish: 'Finished, closed tab "safely"\nDone.',
          },
        ],
      }

      const csv = formatCsv(db)
      const rows = parseCsv(csv)

      // 1 header + 2 event rows
      expect(rows.length).toBe(3)

      const header = rows[0]!
      expect(header).toEqual([...CSV_COLUMNS])

      const row1 = rows[1]!
      expect(row1[0]).toBe('evt-special-1')
      expect(row1[1]).toBe('2026-10-10')
      expect(row1[3]).toBe('browse')
      expect(row1[4]).toBe('trig-1')
      expect(row1[5]).toBe('3')
      // seeking column contains seeking + seekingNote
      expect(row1[6]).toBe('stimulation: Bored, wanted "quick" fix,\nwith multiple lines & commas')
      expect(row1[7]).toBe('open')
      expect(row1[8]).toBe('5')
      expect(row1[10]).toBe('partly')
      expect(row1[11]).toBe('true')
      expect(row1[12]).toBe('15')

      const row2 = rows[2]!
      expect(row2[0]).toBe('evt-special-2')
      expect(row2[3]).toBe('post')
      expect(row2[6]).toBe('validation: simple note')
      expect(row2[7]).toBe('dont-post')
      expect(row2[8]).toBe('') // awarenessAfter undefined
      expect(row2[10]).toBe('') // no session
      expect(row2[11]).toBe('false')
      expect(row2[12]).toBe('8')

      // Ensure raw CSV contains doubled quotes for the escaped field
      expect(csv).toContain('""quick"" fix')
    })

    it('formats exampleDatabase() with correct structure and row counts', () => {
      const today = '2026-10-10'
      const db = exampleDatabase(today)
      const csv = formatCsv(db)

      const rows = parseCsv(csv)

      // Expected rows: 1 header row + all events in exampleDatabase
      expect(rows.length).toBe(1 + db.events.length)
      expect(db.events.length).toBeGreaterThan(0)

      // Check header
      const header = rows[0]!
      expect(header).toEqual([...CSV_COLUMNS])
      expect(header.length).toBe(13)

      // Verify structure of every data row
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i]!
        const event = db.events[i - 1]!

        expect(row.length).toBe(13)

        // id
        expect(row[0]).toBe(event.id)
        // date
        expect(row[1]).toBe(event.date)
        // time (HH:MM)
        expect(row[2]).toMatch(/^\d{2}:\d{2}$/)
        // intent
        expect(row[3]).toBe(event.intent)
        // trigger
        expect(row[4]).toBe(event.triggerId)
        // awareness_before
        expect(Number(row[5])).toBe(event.awarenessBefore)
        // seeking
        expect(row[6]).toContain(event.seeking)
        // choice
        expect(row[7]).toBe(event.choice)
        // awareness_after
        if (event.awarenessAfter !== undefined) {
          expect(Number(row[8])).toBe(event.awarenessAfter)
        } else {
          expect(row[8]).toBe('')
        }
        // threshold: cut or empty
        if (row[9] !== '') {
          expect(Number(row[9])).toBeGreaterThanOrEqual(2)
          expect(Number(row[9])).toBeLessThanOrEqual(9)
        }
        // session_answered: 'yes' | 'partly' | 'no' | ''
        expect(['yes', 'partly', 'no', '']).toContain(row[10])
        // over_limit: 'true' | 'false'
        expect(row[11]).toBe(String(event.overLimit))
        // elapsed_seconds: numeric
        expect(Number(row[12])).toBe(event.elapsedSeconds)
      }
    })

    it('verifies CRLF line breaks per RFC 4180', () => {
      const db: Database = {
        ...emptyDatabase(),
        events: [
          {
            id: 'evt-1',
            at: '2026-10-10T12:00:00.000Z',
            date: '2026-10-10',
            intent: 'browse',
            triggerId: 'instagram',
            awarenessBefore: 5,
            seeking: 'boredom',
            seekingNote: '',
            choice: 'close',
            overLimit: false,
            elapsedSeconds: 10,
            dayNumber: 1,
            phase: 'calibration',
          },
          {
            id: 'evt-2',
            at: '2026-10-10T13:00:00.000Z',
            date: '2026-10-10',
            intent: 'browse',
            triggerId: 'youtube',
            awarenessBefore: 8,
            seeking: 'information',
            seekingNote: '',
            choice: 'open',
            overLimit: false,
            elapsedSeconds: 12,
            dayNumber: 1,
            phase: 'calibration',
          },
        ],
      }

      const csv = formatCsv(db)
      // When multiple rows exist, lines are joined by \r\n
      expect(csv).toContain('\r\n')
      const lines = csv.split('\r\n')
      expect(lines.length).toBe(3)
    })
  })
})
