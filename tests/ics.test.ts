import { describe, expect, it } from 'vitest'
import { escapeIcs, foldLine, formatIcsDate, icsFile, type IcsEvent } from '../src/domain/ics'
import { emptyDatabase } from '../src/store/defaults'
import type { Database, FocusBlock, Session } from '../src/domain/types'

describe('src/domain/ics.ts', () => {
  describe('escapeIcs', () => {
    it('returns empty string for null and undefined', () => {
      expect(escapeIcs(null)).toBe('')
      expect(escapeIcs(undefined)).toBe('')
    })

    it('escapes backslashes, semicolons, and commas', () => {
      expect(escapeIcs('hello\\world')).toBe('hello\\\\world')
      expect(escapeIcs('item1;item2')).toBe('item1\\;item2')
      expect(escapeIcs('apple,banana')).toBe('apple\\,banana')
      expect(escapeIcs('one\\two;three,four')).toBe('one\\\\two\\;three\\,four')
    })

    it('escapes newlines (CRLF, LF, CR) into literal \\n', () => {
      expect(escapeIcs('line1\nline2')).toBe('line1\\nline2')
      expect(escapeIcs('line1\r\nline2')).toBe('line1\\nline2')
      expect(escapeIcs('line1\rline2')).toBe('line1\\nline2')
    })

    it('handles complex combined text with special characters and newlines', () => {
      const input = 'Note: focus on C++\\Rust; 5,4,3,2,1\nStay calm!\r\nNext step.'
      const escaped = escapeIcs(input)
      expect(escaped).toBe('Note: focus on C++\\\\Rust\\; 5\\,4\\,3\\,2\\,1\\nStay calm!\\nNext step.')
    })
  })

  describe('formatIcsDate', () => {
    it('formats dates in RFC 5545 UTC format: YYYYMMDDTHHMMSSZ', () => {
      const d = new Date('2026-11-20T08:30:45.000Z')
      expect(formatIcsDate(d)).toBe('20261120T083045Z')
    })

    it('returns empty string for invalid dates', () => {
      const invalid = new Date('invalid')
      expect(formatIcsDate(invalid)).toBe('')
    })
  })

  describe('foldLine (RFC 5545 75-octet limit)', () => {
    const encoder = new TextEncoder()

    it('does not fold lines shorter than or equal to 75 octets', () => {
      const lineShort = 'SUMMARY:Quick meeting'
      expect(foldLine(lineShort)).toBe(lineShort)

      // Exactly 75 ASCII characters = 75 octets
      const line75 = 'A'.repeat(75)
      expect(encoder.encode(line75).length).toBe(75)
      expect(foldLine(line75)).toBe(line75)
    })

    it('folds lines exceeding 75 octets with CRLF followed by a space', () => {
      const line76 = 'A'.repeat(76)
      const folded = foldLine(line76)
      expect(folded).toContain('\r\n ')

      const parts = folded.split('\r\n')
      expect(parts.length).toBe(2)
      expect(parts[0]!.length).toBe(75)
      expect(parts[1]).toBe(' A') // 1 space + 'A'

      for (const part of parts) {
        expect(encoder.encode(part).length).toBeLessThanOrEqual(75)
      }
    })

    it('folds long ASCII lines into multiple chunks all <= 75 octets', () => {
      const line200 = 'X'.repeat(200)
      const folded = foldLine(line200)
      const parts = folded.split('\r\n')
      expect(parts.length).toBe(3)

      for (const [idx, part] of parts.entries()) {
        const byteLen = encoder.encode(part).length
        expect(byteLen).toBeLessThanOrEqual(75)
        if (idx > 0) {
          expect(part.startsWith(' ')).toBe(true)
        }
      }

      // Unfolding reproduces original string
      const unfolded = (parts[0] ?? '') + parts.slice(1).map((p) => p.slice(1)).join('')
      expect(unfolded).toBe(line200)
    })

    it('does not split multi-octet UTF-8 sequences (Cyrillic characters)', () => {
      // Cyrillic characters are 2 bytes each in UTF-8
      const prefix = 'DESCRIPTION:' // 12 bytes
      // 31 Cyrillic chars = 62 bytes. Total = 74 bytes.
      // Next char (2 bytes) would make 76 bytes > 75, so it must fold to next line without being split.
      const cyrillicText = 'Привет, мир! '.repeat(10)
      const line = prefix + cyrillicText
      const folded = foldLine(line)

      const parts = folded.split('\r\n')
      expect(parts.length).toBeGreaterThan(1)

      for (const [idx, part] of parts.entries()) {
        const bytes = encoder.encode(part)
        expect(bytes.length).toBeLessThanOrEqual(75)
        if (idx > 0) {
          expect(part.startsWith(' ')).toBe(true)
        }
      }

      // Ensure valid UTF-8 and no malformed characters
      const unfolded = (parts[0] ?? '') + parts.slice(1).map((p) => p.slice(1)).join('')
      expect(unfolded).toBe(line)
    })

    it('does not split 4-octet UTF-8 emojis', () => {
      const prefix = 'SUMMARY:' // 8 bytes
      const emojis = '🧘'.repeat(20) // 20 * 4 = 80 bytes
      const line = prefix + emojis
      const folded = foldLine(line)

      const parts = folded.split('\r\n')
      expect(parts.length).toBe(2)

      for (const [idx, part] of parts.entries()) {
        const bytes = encoder.encode(part)
        expect(bytes.length).toBeLessThanOrEqual(75)
        if (idx > 0) {
          expect(part.startsWith(' ')).toBe(true)
        }
      }

      const unfolded = (parts[0] ?? '') + parts.slice(1).map((p) => p.slice(1)).join('')
      expect(unfolded).toBe(line)
    })
  })

  describe('icsFile generation', () => {
    const encoder = new TextEncoder()

    it('generates RFC 5545 compliant empty calendar structure with CRLF line endings', () => {
      const db = emptyDatabase()
      const now = new Date('2026-11-20T10:00:00.000Z')
      const ics = icsFile(db, now)

      // CRLF check
      expect(ics.endsWith('\r\n')).toBe(true)
      expect(ics).not.toMatch(/[^\r]\n/) // No lone LF

      const lines = ics.split('\r\n').filter(Boolean)
      expect(lines).toEqual([
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Supacon//EN',
        'CALSCALE:GREGORIAN',
        'END:VCALENDAR',
      ])
    })

    it('exports focus blocks and sessions with correct UID, DTSTAMP UTC, and properties', () => {
      const db: Database = {
        ...emptyDatabase(),
        focuses: [
          {
            id: 'focus-1',
            date: '2026-11-20',
            startedAt: '2026-11-20T09:00:00.000Z',
            endedAt: '2026-11-20T09:25:00.000Z',
            plannedMinutes: 25,
            completed: true,
          },
        ],
        sessions: [
          {
            id: 'session-1',
            pauseId: 'p-1',
            triggerId: 't-1',
            date: '2026-11-20',
            startedAt: '2026-11-20T10:00:00.000Z',
            endedAt: '2026-11-20T10:15:00.000Z',
            plannedMinutes: 15,
            extendedMinutes: 0,
            awarenessAtStart: 5,
            seeking: 'boredom',
            overLimit: false,
          },
        ],
      }

      const now = new Date('2026-11-20T12:00:00.000Z')
      const ics = icsFile(db, now)

      // CRLF check
      expect(ics.endsWith('\r\n')).toBe(true)
      expect(ics).not.toMatch(/[^\r]\n/)

      // DTSTAMP UTC check
      expect(ics).toContain('DTSTAMP:20261120T120000Z')

      // Focus event check
      expect(ics).toContain('UID:focus-1@supacon')
      expect(ics).toContain('SUMMARY:Focus block')
      expect(ics).toContain('DTSTART:20261120T090000Z')
      expect(ics).toContain('DTEND:20261120T092500Z')

      // Session event check
      expect(ics).toContain('UID:session-1@supacon')
      expect(ics).toContain('SUMMARY:Session')
      expect(ics).toContain('DTSTART:20261120T100000Z')
      expect(ics).toContain('DTEND:20261120T101500Z')
    })

    it('calculates planned end time when endedAt is missing but duration is positive', () => {
      const db: Database = {
        ...emptyDatabase(),
        focuses: [
          {
            id: 'focus-ongoing',
            date: '2026-11-20',
            startedAt: '2026-11-20T14:00:00.000Z',
            plannedMinutes: 30,
            completed: false,
          },
        ],
      }

      const ics = icsFile(db, new Date('2026-11-20T15:00:00.000Z'))
      expect(ics).toContain('DTSTART:20261120T140000Z')
      expect(ics).toContain('DTEND:20261120T143000Z')
    })

    it('sorts events chronologically and filters out invalid dates or reversed intervals', () => {
      const db: Database = {
        ...emptyDatabase(),
        focuses: [
          {
            id: 'focus-later',
            date: '2026-11-20',
            startedAt: '2026-11-20T16:00:00.000Z',
            endedAt: '2026-11-20T16:20:00.000Z',
            plannedMinutes: 20,
            completed: true,
          },
          {
            id: 'focus-invalid-date',
            date: '2026-11-20',
            startedAt: 'not-a-date',
            endedAt: '2026-11-20T12:00:00.000Z',
            plannedMinutes: 20,
            completed: true,
          },
          {
            id: 'focus-reversed',
            date: '2026-11-20',
            startedAt: '2026-11-20T17:00:00.000Z',
            endedAt: '2026-11-20T16:00:00.000Z', // end before start
            plannedMinutes: 20,
            completed: true,
          },
        ],
        sessions: [
          {
            id: 'session-earlier',
            pauseId: 'p-1',
            triggerId: 't-1',
            date: '2026-11-20',
            startedAt: '2026-11-20T11:00:00.000Z',
            endedAt: '2026-11-20T11:30:00.000Z',
            plannedMinutes: 30,
            extendedMinutes: 0,
            awarenessAtStart: 7,
            seeking: 'habit',
            overLimit: false,
          },
        ],
      }

      const ics = icsFile(db, new Date('2026-11-20T18:00:00.000Z'))

      // Invalid events omitted
      expect(ics).not.toContain('focus-invalid-date')
      expect(ics).not.toContain('focus-reversed')

      // Chronological order: session-earlier (11:00) before focus-later (16:00)
      const sessionPos = ics.indexOf('session-earlier@supacon')
      const focusPos = ics.indexOf('focus-later@supacon')
      expect(sessionPos).toBeGreaterThan(-1)
      expect(focusPos).toBeGreaterThan(-1)
      expect(sessionPos).toBeLessThan(focusPos)
    })

    it('folds all content lines so no line in the final .ics file exceeds 75 octets', () => {
      const longTitle = 'Focus session with extremely long title and description that extends far beyond the 75 octet RFC limit'
      const longDescription = 'Deep work block: reading through extensive literature, taking detailed notes on protocol design, and verifying all assertions.'

      const db: Database = {
        ...emptyDatabase(),
        focuses: [
          {
            id: 'long-focus',
            date: '2026-11-20',
            startedAt: '2026-11-20T10:00:00.000Z',
            endedAt: '2026-11-20T10:45:00.000Z',
            plannedMinutes: 45,
            completed: true,
          },
        ],
      }

      const ics = icsFile(db, new Date('2026-11-20T12:00:00.000Z'))

      const lines = ics.split('\r\n')
      for (const line of lines) {
        const byteLen = encoder.encode(line).length
        expect(byteLen).toBeLessThanOrEqual(75)
      }
    })
  })
})
