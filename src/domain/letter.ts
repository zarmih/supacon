import type { Insights } from './insights'
import type { Seeking } from './types'

export interface LetterCopy {
  paused: (n: number) => string
  threshold: (cut: number, belowPct: number, abovePct: number) => string
  seekingLow: (label: string) => string
  namingUp: (delta: string) => string
  namingDown: (delta: string) => string
  baselineUp: (early: string, late: string) => string
  baselineDown: (early: string, late: string) => string
  hour: (label: string) => string
  posts: (paused: number, steppedBack: number) => string
  highOpens: () => string
}

function pct(rate: number): number {
  return Math.round(rate * 100)
}

/** At most four sentences. Each one is a claim the report can support. */
export function letterLines(
  insights: Insights,
  copy: LetterCopy,
  seekingLabel: (key: Seeking) => string,
  hourLabel: (hour: number) => string,
): string[] {
  if (insights.pauses < 3) return []
  const lines: string[] = [copy.paused(insights.pauses)]

  if (insights.threshold) {
    lines.push(
      copy.threshold(
        insights.threshold.cut,
        pct(insights.threshold.openBelow),
        pct(insights.threshold.openAbove),
      ),
    )
  }

  if (insights.seekingLow) {
    lines.push(copy.seekingLow(seekingLabel(insights.seekingLow.key)))
  }

  const extras: string[] = []
  if (insights.naming && Math.abs(insights.naming.delta) >= 0.2) {
    const magnitude = Math.abs(insights.naming.delta).toFixed(1)
    extras.push(insights.naming.delta > 0 ? copy.namingUp(magnitude) : copy.namingDown(magnitude))
  }
  if (insights.baseline && insights.baseline.early !== insights.baseline.late) {
    extras.push(
      insights.baseline.late > insights.baseline.early
        ? copy.baselineUp(insights.baseline.early.toFixed(1), insights.baseline.late.toFixed(1))
        : copy.baselineDown(insights.baseline.early.toFixed(1), insights.baseline.late.toFixed(1)),
    )
  }
  if (insights.peakHour) extras.push(copy.hour(hourLabel(insights.peakHour.hour)))
  if (insights.posts.paused >= 2) extras.push(copy.posts(insights.posts.paused, insights.posts.steppedBack))
  if (insights.highButOpens) extras.push(copy.highOpens())

  for (const extra of extras) {
    if (lines.length >= 4) break
    lines.push(extra)
  }
  return lines
}
