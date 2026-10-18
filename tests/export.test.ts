import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { copyDiaryToClipboard, exportCsv, exportDiary, exportJson } from '../src/ui/export'
import { emptyDatabase } from '../src/store/defaults'

describe('src/ui/export.ts', () => {
  let createdFiles: string[] = []

  beforeEach(() => {
    createdFiles = []
    let mockUrlCounter = 0

    vi.stubGlobal('URL', {
      createObjectURL: vi.fn((_blob: Blob) => {
        mockUrlCounter += 1
        return `blob:mock-url-${mockUrlCounter}`
      }),
      revokeObjectURL: vi.fn(),
    })

    vi.stubGlobal('document', {
      createElement: (_tag: string) => ({
        href: '',
        download: '',
        click(this: { download: string }) {
          createdFiles.push(this.download)
        },
      }),
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('exports JSON with date stamp', () => {
    const db = emptyDatabase()
    const testDate = new Date('2026-10-18T10:00:00Z')
    exportJson(db, testDate)

    expect(createdFiles.length).toBe(1)
    expect(createdFiles[0]).toMatch(/^supacon-\d{4}-\d{2}-\d{2}\.json$/)
  })

  it('exports Diary Markdown with date stamp', () => {
    const db = emptyDatabase()
    const testDate = new Date('2026-10-18T10:00:00Z')
    exportDiary(db, 'en', testDate)

    expect(createdFiles.length).toBe(1)
    expect(createdFiles[0]).toMatch(/^supacon-diary-\d{4}-\d{2}-\d{2}\.md$/)
  })

  it('exports CSV with date stamp', () => {
    const db = emptyDatabase()
    const testDate = new Date('2026-10-18T10:00:00Z')
    exportCsv(db, testDate)

    expect(createdFiles.length).toBe(1)
    expect(createdFiles[0]).toMatch(/^supacon-export-\d{4}-\d{2}-\d{2}\.csv$/)
  })

  it('copies diary to clipboard when clipboard API is supported', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    })

    const onCopied = vi.fn()
    const onFallback = vi.fn()

    await copyDiaryToClipboard(emptyDatabase(), 'en', onCopied, onFallback)

    expect(writeText).toHaveBeenCalled()
    expect(onCopied).toHaveBeenCalled()
    expect(onFallback).not.toHaveBeenCalled()
  })

  it('calls fallback when clipboard writeText rejects or is unavailable', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('Permission denied'))
    vi.stubGlobal('navigator', {
      clipboard: { writeText },
    })

    const onCopied = vi.fn()
    const onFallback = vi.fn()

    await copyDiaryToClipboard(emptyDatabase(), 'en', onCopied, onFallback)

    expect(onCopied).not.toHaveBeenCalled()
    expect(onFallback).toHaveBeenCalled()
  })
})
