import { describe, expect, it } from 'vitest'
import fc from 'fast-check'
import { CSV_COLUMNS, escapeCsv, formatCsv, formatTime } from '../src/domain/csv'
import { formatDiary } from '../src/domain/diary'
import type { AwarenessScore, Database, PauseEvent } from '../src/domain/types'
import { dbWith, pauseEvent, session } from './helpers/factory'
import { withTZ } from './helpers/tz'

/** Independent RFC 4180 reader: quoted fields, doubled quotes, CRLF row separator. */
function readCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"'
        i += 1
      } else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
    } else field += ch
  }
  row.push(field)
  rows.push(row)
  return rows
}

const nasty = [
  'plain',
  'a,b',
  'say "hi"',
  '"',
  '""',
  ',',
  'line1\nline2',
  'line1\r\nline2',
  'lone\rcr',
  '🙂🔥 эмодзи и кириллица',
  '👨‍👩‍👧 family ZWJ',
  ' padded ',
  '',
  '=1+1',
  '#,"\n\r',
]

describe('CSV escaping', () => {
  it.each(nasty)('round-trips %j through escapeCsv and an RFC 4180 reader', (value) => {
    const line = ['x', escapeCsv(value), 'y'].join(',')
    expect(readCsv(line)).toEqual([['x', value, 'y']])
  })

  it('round-trips arbitrary unicode strings (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'binary', maxLength: 40 }), { minLength: 1, maxLength: 6 }), (values) => {
        const line = values.map(escapeCsv).join(',')
        expect(readCsv(line)).toEqual([values])
      }),
      { numRuns: 500 },
    )
  })

  it('formatCsv yields one parseable row per event whatever the free text contains (property)', () => {
    const textArb = fc.oneof(fc.constantFrom(...nasty), fc.string({ unit: 'binary', maxLength: 30 }))
    fc.assert(
      fc.property(
        fc.array(fc.record({ id: textArb, note: textArb, trigger: textArb }), { minLength: 1, maxLength: 8 }),
        (specs) => {
          const events = specs.map((s, i) =>
            pauseEvent({ id: `${i}|${s.id}`, seekingNote: s.note, triggerId: s.trigger }),
          )
          const rows = readCsv(formatCsv(dbWith({ events })))
          expect(rows).toHaveLength(events.length + 1)
          expect(rows[0]).toEqual([...CSV_COLUMNS])
          rows.slice(1).forEach((row, i) => {
            const event = events[i]!
            expect(row).toHaveLength(CSV_COLUMNS.length)
            expect(row[0]).toBe(event.id)
            expect(row[4]).toBe(event.triggerId)
            expect(row[6]).toBe(event.seekingNote ? `${event.seeking}: ${event.seekingNote}` : event.seeking)
          })
        },
      ),
      { numRuns: 200 },
    )
  })

  it('fills session answer, threshold and empty after-score columns', () => {
    const events: PauseEvent[] = [
      ...Array.from({ length: 4 }, (_, i) => pauseEvent({ id: `low${i}`, awarenessBefore: 2, choice: 'open' })),
      ...Array.from({ length: 4 }, (_, i) => pauseEvent({ id: `hi${i}`, awarenessBefore: 8, choice: 'close', awarenessAfter: 9 as AwarenessScore })),
    ]
    const db = dbWith({
      events,
      sessions: [session({ pauseId: 'low0', found: 'partly' }), session({ pauseId: 'low1' })],
    })
    const rows = readCsv(formatCsv(db)).slice(1)
    const col = (name: (typeof CSV_COLUMNS)[number]) => CSV_COLUMNS.indexOf(name)
    expect(rows[0]![col('session_answered')]).toBe('partly')
    expect(rows[1]![col('session_answered')]).toBe('')
    expect(rows[2]![col('session_answered')]).toBe('')
    expect(rows.every((r) => r[col('threshold')] === '8')).toBe(true)
    expect(rows[0]![col('awareness_after')]).toBe('')
    expect(rows[4]![col('awareness_after')]).toBe('9')
    expect(rows[0]![col('over_limit')]).toBe('false')
  })

  it('formats time in the local zone and falls back for unparseable stamps', () => {
    withTZ('Europe/Moscow', () => expect(formatTime('2026-10-21T21:05:00.000Z')).toBe('00:05'))
    withTZ('America/Los_Angeles', () => expect(formatTime('2026-10-21T21:05:00.000Z')).toBe('14:05'))
    expect(formatTime('yesterday at 9:15 pm')).toBe('9:15')
    expect(formatTime('garbage')).toBe('garbage')
  })

  // Spreadsheet formula injection: a note starting with = + - @ is executed by Excel/Sheets
  // when the CSV is opened. Low risk for a local-only app (the user types their own notes),
  // but worth a decision: prefix such cells with an apostrophe or document it.
  it.todo('neutralises spreadsheet formulas (=, +, -, @) at the start of a cell')

  // Excel on Windows opens a UTF-8 CSV without BOM as cp1251/cp1252, so Russian notes and emoji
  // turn into mojibake. Consider prefixing the download with "\uFEFF" (in ui/export.ts).
  it.todo('starts the CSV download with a UTF-8 BOM so Excel shows Cyrillic correctly')
})

function diaryDb(note: string): Database {
  return dbWith({
    startedOn: '2026-10-10',
    triggers: [{ id: 'custom', label: 'Тг, "каналы" 🙂', preset: false, enabled: true, createdAt: '' }],
    events: [
      pauseEvent({
        id: 'e1',
        at: '2026-10-10T09:00:00.000Z',
        date: '2026-10-10',
        triggerId: 'custom',
        seekingNote: note,
        finish: note,
      }),
    ],
    evenings: [{ date: '2026-10-10', at: '', lowestMoment: note, note, unloggedMisses: 0 }],
    misses: [{ id: 'm', at: '2026-10-10T10:00:00.000Z', date: '2026-10-10', triggerId: 'custom', note }],
  })
}

describe('Markdown diary escaping', () => {
  it.each(['en', 'ru'] as const)('keeps commas, quotes and emoji verbatim (%s)', (lang) => {
    const note = 'да, "это" — 🙂🔥'
    const md = formatDiary(diaryDb(note), lang)
    expect(md).toContain('Тг, "каналы" 🙂')
    expect(md).toContain(`("${note}")`)
    expect(md).toContain(`"${note}"`)
    expect(md.split('\n').filter((l) => l.startsWith('# ')).length).toBe(1)
  })

  it('trims notes and drops whitespace-only ones', () => {
    const md = formatDiary(diaryDb('   '), 'en')
    expect(md).not.toContain('Lowest moment')
    expect(md).not.toContain('Finish line')
  })

  // BUG: free text is inserted into Markdown unescaped. A note with a newline breaks out of its
  // list item, and a line starting with "#" becomes a real heading in the exported diary
  // (the same for "---", "* ", "|", etc.). Expected: newlines folded (or indented under the item)
  // and leading Markdown control characters escaped.
  it.fails('does not let a multi-line note inject headings or break its list item', () => {
    const md = formatDiary(diaryDb('first line\n## Injected heading\n---'), 'en')
    const lines = md.split('\n')
    expect(lines.some((l) => l === '## Injected heading')).toBe(false)
    expect(lines.filter((l) => l === '---').length).toBe(2) // one per day + summary separator
  })
})
