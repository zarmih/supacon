import { buildInsights } from '../../domain/insights'
import { letterLines } from '../../domain/letter'
import { formatHour, localDate } from '../../domain/time'
import { esc, formatAvg, pct, triggerName } from '../html'
import type { ViewModel } from '../model'

export function insightsScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const today = localDate(new Date(now))
  const report = buildInsights(db, today)
  if (report.pauses < 3) {
    return `<section class="stack">
      <p class="kicker">${esc(dict.insight.title)}</p>
      <h1 id="step-title">${esc(dict.insight.emptyTitle)}</h1>
      <p class="lede">${esc(dict.insight.empty)}</p>
      <button type="button" class="btn" data-action="confirm" data-value="example">${esc(dict.insight.example)}</button>
    </section>`
  }
  const lines = letterLines(report, dict.letter, (key) => dict.seekings[key], formatHour)
  const maxHour = Math.max(...report.hourly, 1)
  const maxDay = Math.max(...report.daily.map((point) => point.avg ?? 0), 1)
  return `<section class="stack">
    ${db.demo ? `<p class="banner">${esc(dict.home.demo)}</p>` : ''}
    <p class="kicker">${esc(dict.insight.title)}</p>
    <h1 id="step-title">${esc(dict.insight.letter)}</h1>
    ${lines.map((line) => `<p class="letter">${esc(line)}</p>`).join('')}

    <article class="card">
      <h2>${esc(dict.insight.threshold)}</h2>
      <p>${esc(
        report.threshold
          ? dict.insight.thresholdBody(report.threshold.cut, pct(report.threshold.openBelow), pct(report.threshold.openAbove))
          : dict.insight.noThreshold,
      )}</p>
    </article>

    <article class="card">
      <h2>${esc(dict.insight.autopilot)}</h2>
      <p>${esc(
        report.lowOpenRate && report.highOpenRate
          ? dict.insight.pair(pct(report.lowOpenRate.rate), pct(report.highOpenRate.rate))
          : dict.insight.notYet,
      )}</p>
    </article>

    <article class="card">
      <h2>${esc(dict.insight.seeking)}</h2>
      <p>${esc(report.seekingLow ? dict.insight.seekingBody(dict.seekings[report.seekingLow.key], report.seekingLow.n) : dict.insight.notYet)}</p>
      ${report.seekingTop ? `<p class="muted">${esc(dict.insight.seekingTop(dict.seekings[report.seekingTop.key]))}</p>` : ''}
    </article>

    <article class="card">
      <h2>${esc(dict.insight.hour)}</h2>
      <p>${esc(report.peakHour ? dict.insight.hourBody(formatHour(report.peakHour.hour), report.peakHour.n) : dict.insight.notYet)}</p>
    </article>

    <article class="card">
      <h2>${esc(dict.insight.naming)}</h2>
      <p>${esc(
        report.naming
          ? report.naming.delta >= 0
            ? dict.insight.namingUp(Math.abs(report.naming.delta).toFixed(1))
            : dict.insight.namingDown(Math.abs(report.naming.delta).toFixed(1))
          : dict.insight.notYet,
      )}</p>
    </article>

    ${
      report.baseline
        ? `<article class="card"><h2>${esc(dict.insight.week)}</h2><p>${esc(
            report.baseline.late >= report.baseline.early
              ? dict.insight.baselineUp(report.baseline.early.toFixed(1), report.baseline.late.toFixed(1))
              : dict.insight.baselineDown(report.baseline.early.toFixed(1), report.baseline.late.toFixed(1)),
          )}</p></article>`
        : ''
    }

    ${report.triggers.length > 0 ? `<article class="card"><h2>${esc(dict.insight.triggers)}</h2><ul class="stat-list">${report.triggers
      .map((item) => {
        const label = triggerName(db, item.id, dict)
        return `<li><span>${esc(label)}</span><span class="muted">${esc(formatAvg(item.avg))} · ${esc(dict.insight.openRate(pct(item.openRate)))}</span></li>`
      })
      .join('')}</ul></article>` : ''}

    <article class="card">
      <h2>${esc(dict.insight.week)}</h2>
      <div class="bars" aria-hidden="true">
        ${report.daily
          .map((point) => {
            const height = point.avg === null ? 0 : Math.max(8, (point.avg / maxDay) * 100)
            return `<span title="${esc(point.date)}"><i style="height:${height}%"></i></span>`
          })
          .join('')}
      </div>
    </article>

    <article class="card">
      <h2>${esc(dict.insight.hours)}</h2>
      <div class="bars hours" aria-hidden="true">
        ${report.hourly
          .map((count, hour) => `<span title="${formatHour(hour)}"><i style="height:${Math.max(count === 0 ? 0 : 8, (count / maxHour) * 100)}%"></i></span>`)
          .join('')}
      </div>
    </article>

    ${report.posts.paused > 0 ? `<p class="note">${esc(dict.insight.posts(report.posts.paused, report.posts.steppedBack))}</p>` : ''}
    ${report.found.yes + report.found.partly + report.found.no > 0 ? `<p class="note">${esc(dict.insight.found(report.found.yes, report.found.partly, report.found.no))}</p>` : ''}
    ${report.misses > 0 ? `<p class="muted">${esc(dict.insight.misses(report.misses))}</p>` : ''}
    ${report.extraMinutes > 0 ? `<p class="muted">${esc(dict.insight.extra(report.extraMinutes))}</p>` : ''}
    <button type="button" class="btn ghost" data-action="confirm" data-value="example">${esc(dict.insight.example)}</button>
  </section>`
}
