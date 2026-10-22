import { afterEach, describe, expect, it, vi } from 'vitest'
import fc from 'fast-check'
import { CSV_BOM, CSV_COLUMNS, csvFile, escapeCsv, formatCsv, formatTime, neutralizeFormula } from '../src/domain/csv'
import { formatDiary, mdText } from '../src/domain/diary'
import { exportCsv } from '../src/ui/export'
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
    expect(readCsv(line)).toEqual([['x', neutralizeFormula(value), 'y']])
  })

  it('round-trips arbitrary unicode strings (property)', () => {
    fc.assert(
      fc.property(fc.array(fc.string({ unit: 'binary', maxLength: 40 }), { minLength: 1, maxLength: 6 }), (values) => {
        const line = values.map(escapeCsv).join(',')
        expect(readCsv(line)).toEqual([values.map(neutralizeFormula)])
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
            expect(row[4]).toBe(neutralizeFormula(event.triggerId))
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

  // Spreadsheet formula injection: a cell starting with = + - @ (or tab / CR) is evaluated by
  // Excel, LibreOffice and Google Sheets. Text cells like that get a leading apostrophe.
  it.each([
    ['=1+1', "'=1+1"],
    ['+7 999', "'+7 999"],
    ['-2', "'-2"],
    ['@SUM(A1)', "'@SUM(A1)"],
    ['\tlead', "'\tlead"],
    ['=HYPERLINK("http://x","y")', `"'=HYPERLINK(""http://x"",""y"")"`],
    ['\r=cmd', `"'\r=cmd"`],
  ])('neutralises the spreadsheet formula %j at the start of a cell', (value, expected) => {
    expect(escapeCsv(value)).toBe(expected)
  })

  it('leaves formula characters in the middle, and numbers and booleans, as they are', () => {
    expect(escapeCsv('a=b+c-d@e')).toBe('a=b+c-d@e')
    expect(escapeCsv(' =1')).toBe(' =1')
    expect(escapeCsv("'=1")).toBe("'=1")
    expect(escapeCsv(-3)).toBe('-3')
    expect(escapeCsv(false)).toBe('false')
  })

  it('neutralises formulas in free-text columns of the exported file', () => {
    const db = dbWith({ events: [pauseEvent({ id: '=evil()', triggerId: '@trigger', seekingNote: '=1+1' })] })
    const row = readCsv(formatCsv(db))[1]!
    expect(row[0]).toBe("'=evil()")
    expect(row[4]).toBe("'@trigger")
    // the seeking column starts with the impulse id, so the note inside it is already harmless
    expect(row[6]!.startsWith("'")).toBe(false)
    expect(row.every((cell) => !/^[=+\-@\t\r]/.test(cell))).toBe(true)
  })

  it('starts the CSV file with a UTF-8 BOM so Excel shows Cyrillic correctly', () => {
    const db = dbWith({ events: [pauseEvent({ seekingNote: 'кириллица 🙂' })] })
    expect(CSV_BOM).toBe('\uFEFF')
    expect(csvFile(db)).toBe(`\uFEFF${formatCsv(db)}`)
    expect(csvFile(db).indexOf('\uFEFF', 1)).toBe(-1)
  })

  describe('download', () => {
    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('starts the CSV download with the UTF-8 BOM bytes EF BB BF', async () => {
      const blobs: Blob[] = []
      vi.stubGlobal('URL', {
        createObjectURL: (blob: Blob) => {
          blobs.push(blob)
          return 'blob:mock'
        },
        revokeObjectURL: () => undefined,
      })
      vi.stubGlobal('document', { createElement: () => ({ href: '', download: '', click: () => undefined }) })
      exportCsv(dbWith({ events: [pauseEvent({ seekingNote: 'тест' })] }), new Date('2026-10-18T10:00:00Z'))
      expect(blobs).toHaveLength(1)
      const bytes = new Uint8Array(await blobs[0]!.arrayBuffer())
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
      expect(new TextDecoder().decode(bytes)).toContain('тест')
      expect(new TextDecoder().decode(bytes).startsWith('id,')).toBe(true) // decoder drops the BOM
    })
  })
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

  // Free text is folded onto one line and inline markup is escaped, so a note cannot open a
  // heading, a rule, a list or a table, nor turn the rest of the diary bold or into a link.
  it.each(['en', 'ru'] as const)('does not let a multi-line note inject headings or break its list item (%s)', (lang) => {
    const md = formatDiary(diaryDb('first line\n## Injected heading\n---\n- fake item\n| a | b |'), lang)
    const lines = md.split('\n')
    expect(lines.some((l) => l === '## Injected heading')).toBe(false)
    expect(lines.filter((l) => l === '---').length).toBe(2) // one per day + summary separator
    expect(lines.some((l) => l === '- fake item')).toBe(false)
    expect(lines.some((l) => l.startsWith('|'))).toBe(false)
    expect(md).toContain('first line / ## Injected heading / --- / - fake item / \\| a \\| b \\|')
  })

  it('folds every kind of line break and drops blank lines', () => {
    expect(mdText('a\r\nb\rc\nd\u2028e\u2029f')).toBe('a / b / c / d / e / f')
    expect(mdText('  one  \n\n   \n two ')).toBe('one / two')
    expect(mdText('single')).toBe('single')
  })

  it('escapes inline markup so notes show as typed', () => {
    expect(mdText('**bold** _it_ `code` [link](http://x) <img src=x> ~~s~~ a\\b')).toBe(
      '\\*\\*bold\\*\\* \\_it\\_ \\`code\\` \\[link\\](http://x) \\<img src=x\\> \\~\\~s\\~\\~ a\\\\b',
    )
    const md = formatDiary(diaryDb('**всё** <b>'), 'ru')
    expect(md).toContain('\\*\\*всё\\*\\* \\<b\\>')
    expect(md).not.toContain('**всё**')
  })

  it('escapes a custom trigger label the same way', () => {
    const db = diaryDb('note')
    db.triggers[0]!.label = 'Tg\n# channels *'
    const md = formatDiary(db, 'en')
    expect(md.split('\n').some((l) => l.startsWith('# channels'))).toBe(false)
    expect(md).toContain('Tg / # channels \\*')
  })
})
