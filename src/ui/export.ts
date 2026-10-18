import { formatCsv } from '../domain/csv'
import { formatDiary } from '../domain/diary'
import { localDate } from '../domain/time'
import type { Database } from '../domain/types'

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function exportJson(db: Database, now = new Date()): void {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' })
  triggerDownload(blob, `supacon-${localDate(now)}.json`)
}

export function exportDiary(db: Database, lang: 'en' | 'ru', now = new Date()): void {
  const md = formatDiary(db, lang)
  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
  triggerDownload(blob, `supacon-diary-${localDate(now)}.md`)
}

export function exportCsv(db: Database, now = new Date()): void {
  const csv = formatCsv(db)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  triggerDownload(blob, `supacon-export-${localDate(now)}.csv`)
}

export async function copyDiaryToClipboard(
  db: Database,
  lang: 'en' | 'ru',
  onCopied: () => void,
  onFallback: () => void,
): Promise<void> {
  const md = formatDiary(db, lang)
  if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    try {
      await navigator.clipboard.writeText(md)
      onCopied()
    } catch {
      onFallback()
    }
  } else {
    onFallback()
  }
}
