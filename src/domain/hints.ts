import type { Database, Impulse, Intent } from './types'
import { isSeeking } from './types'
import { isBrowsePause } from './pause'
import { buildInsights } from './insights'

export type HintId =
  | 'over-limit'
  | 'low-score-pattern'
  | 'urge-passed'
  | 'loud-hour'
  | 'space'
  | 'high-but-opens'

const RETURN_MS = 90 * 60 * 1000

/**
 * One sentence, or nothing. Hints describe a pattern the data already supports.
 * They never tell the person which button to press.
 */
export function pickHint(
  db: Database,
  input: {
    intent: Intent
    awareness: number | undefined
    seeking: Impulse | undefined
    triggerId: string
    overLimit: boolean
    hour: number
    now: number
  },
): HintId | null {
  if (input.intent !== 'browse') {
    return input.overLimit ? 'over-limit' : null
  }
  if (input.overLimit) return 'over-limit'

  const browse = db.events.filter(isBrowsePause)
  const insights = browse.length >= 6 ? buildInsights(db, new Date(input.now).toISOString().slice(0, 10)) : null
  if (insights?.highButOpens && (input.awareness ?? 0) >= 7) return 'high-but-opens'

  if ((input.awareness ?? 10) >= 8 && browse.length >= 1) return 'space'

  if ((input.awareness ?? 10) <= 4) {
    const low = browse.filter((event) => event.awarenessBefore <= 4)
    if (low.length >= 5) {
      const openRate = low.filter((event) => event.choice === 'open').length / low.length
      if (openRate >= 0.7) return 'low-score-pattern'
    }
  }

  if (input.seeking && isSeeking(input.seeking)) {
    const recent = db.postpones
      .filter((postpone) => {
        const event = db.events.find((item) => item.id === postpone.pauseId)
        return event?.seeking === input.seeking
      })
      .slice(-3)
    if (recent.length === 3) {
      const passed = recent.every((postpone) => {
        const start = new Date(postpone.at).getTime()
        return !db.sessions.some((session) => {
          const at = new Date(session.startedAt).getTime()
          return at > start && at <= start + RETURN_MS
        })
      })
      if (passed) return 'urge-passed'
    }
  }

  const hourCounts = Array.from({ length: 24 }, () => 0)
  for (const event of browse) {
    const hour = new Date(event.at).getHours()
    hourCounts[hour] = (hourCounts[hour] ?? 0) + 1
  }
  const peak = Math.max(...hourCounts)
  if (peak >= 4 && hourCounts[input.hour] === peak) return 'loud-hour'

  return null
}
