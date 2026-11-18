import { addDays, startOfWeek } from './time'
import type { PauseEvent } from './types'

export type JournalPeriod = 'all' | 'this-week' | '7d'

export const JOURNAL_PERIODS: readonly JournalPeriod[] = ['all', 'this-week', '7d']

export function isJournalPeriod(value: unknown): value is JournalPeriod {
  return value === 'all' || value === 'this-week' || value === '7d'
}

/**
 * Returns the date boundary `[start, end]` (inclusive) for a journal period relative to `today` (YYYY-MM-DD),
 * or `null` when the period is 'all'.
 */
export function periodDateRange(period: JournalPeriod, today: string): { start: string; end: string } | null {
  if (period === 'this-week') {
    const start = startOfWeek(today)
    const end = addDays(start, 6)
    return { start, end }
  }
  if (period === '7d') {
    const start = addDays(today, -6)
    return { start, end: today }
  }
  return null
}

/**
 * Filters pause events by date period and trigger.
 * Day boundaries are evaluated by the user's local calendar day (`today`), matching the rest of the app.
 */
export function filterJournalEvents(
  events: PauseEvent[],
  period: JournalPeriod,
  triggerId: string | 'all',
  today: string,
): PauseEvent[] {
  const range = periodDateRange(period, today)
  const byTrigger = triggerId === 'all' || !triggerId ? events : events.filter((e) => e.triggerId === triggerId)
  if (!range) return byTrigger
  return byTrigger.filter((e) => e.date >= range.start && e.date <= range.end)
}
