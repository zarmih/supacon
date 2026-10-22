import { diagnosisReport, lowestPause, pausesOn, seekingWhenLowOn, todayVsYesterday } from '../../domain/diagnosis'
import { localDate } from '../../domain/time'
import type { Database, PauseEvent } from '../../domain/types'
import type { Dict } from '../../i18n/en'
import { esc, formatAvg, impulseName, pct, triggerName } from '../html'
import type { ViewModel } from '../model'

function clockOf(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** `#/report`: the day 7 evening report from PROTOCOL.md. It can be read while it is still forming. */
export function reportScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const copy = dict.report
  const today = localDate(new Date(now))
  const report = diagnosisReport(db, today, now)
  if (!report) {
    return `<section class="stack" data-screen="report">
      <a class="text-btn" href="#/today">${esc(dict.back)}</a>
      <h1 id="step-title">${esc(copy.title)}</h1>
      <p class="lede">${esc(copy.none)}</p>
    </section>`
  }

  const triggers = report.topTriggers.length
    ? `<ul class="stat-list">${report.topTriggers
        .map(
          (item) =>
            `<li data-trigger="${esc(item.id)}"><span>${esc(triggerName(db, item.id, dict))}</span><span class="muted">${esc(
              copy.triggerLine(item.pauses, item.misses, item.opened),
            )}${item.avg === null ? '' : ` · ${esc(formatAvg(item.avg))}`}</span></li>`,
        )
        .join('')}</ul>`
    : `<p class="muted">${esc(copy.triggersNone)}</p>`

  const time =
    report.highest && report.lowest
      ? `<p>${esc(copy.highest(copy.parts[report.highest.part], formatAvg(report.highest.avg)))}</p>
         <p>${esc(copy.lowest(copy.parts[report.lowest.part], formatAvg(report.lowest.avg)))}</p>`
      : `<p class="muted">${esc(copy.timeNone)}</p>`

  return `<section class="stack" data-screen="report">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(copy.kicker)}</p>
    <h1 id="step-title">${esc(copy.title)}</h1>
    <p class="muted">${esc(copy.range(report.from, report.to))}</p>
    ${report.day < 7 ? `<p class="note" data-card="reportForming">${esc(copy.forming(report.day))}</p>` : ''}
    <article class="card" data-card="reportCaught">
      <p><strong>${esc(copy.caught(report.pauses, report.misses))}</strong></p>
      ${report.caughtShare === null ? '' : `<p>${esc(copy.caughtShare(pct(report.caughtShare)))}</p>`}
      <p class="muted">${esc(copy.choices(report.opened, report.postponed, report.closed))}</p>
      ${report.avgAwareness === null ? '' : `<p>${esc(copy.avg(formatAvg(report.avgAwareness)))}</p>`}
    </article>
    <article class="card" data-card="reportTriggers">
      <h2>${esc(copy.triggersTitle)}</h2>
      ${triggers}
    </article>
    <article class="card" data-card="reportTime">
      <h2>${esc(copy.timeTitle)}</h2>
      ${time}
    </article>
    <article class="card" data-card="reportLikes">
      <h2>${esc(copy.likesTitle)}</h2>
      <p${report.likesChanged ? '' : ' class="muted"'}>${esc(report.likesChanged ? copy.likes[report.likesChanged] : copy.likesNone)}</p>
      ${report.likesNote ? `<p class="muted">${esc(report.likesNote)}</p>` : ''}
    </article>
    <article class="card" data-card="reportBroke">
      <h2>${esc(copy.brokeTitle)}</h2>
      <p${report.whereItBroke ? '' : ' class="muted"'}>${esc(report.whereItBroke || copy.brokeNone)}</p>
      <p class="muted" data-card="reportMinutes">${esc(copy.minutes(report.sessionCount, report.sessionMinutes))}</p>
      <p class="muted">${esc(copy.overLimit(report.overLimitSessions, report.extraMinutes))}</p>
      ${report.posts.paused > 0 ? `<p class="muted">${esc(copy.posts(report.posts.paused, report.posts.steppedBack))}</p>` : ''}
    </article>
    <p class="muted">${esc(copy.calm)}</p>
  </section>`
}

/** A link to the report, for screens that mention day 7. Empty without a protocol start. */
export function reportLink(db: Database, dict: Dict): string {
  if (!db.startedOn) return ''
  return `<a class="card link-card" href="#/report" data-card="reportLink"><span>${esc(dict.report.link)}</span><span class="text-link">→</span></a>`
}

function pauseLine(db: Database, event: PauseEvent, dict: Dict): string {
  const copy = dict.report
  const after = event.awarenessAfter !== undefined ? ` → ${event.awarenessAfter}` : ''
  const note = event.seekingNote?.trim()
  const impulse = note ? `${impulseName(event.seeking, dict)} (${note})` : impulseName(event.seeking, dict)
  const choice = `${copy.choice[event.choice]}${event.overLimit ? ` · ${copy.overLimitTag}` : ''}`
  return `<li data-pause="${esc(event.id)}">
    <div>
      <strong>${esc(clockOf(event.at))}</strong> <span>${esc(triggerName(db, event.triggerId, dict))}</span>
      <p class="muted">${esc(impulse)} · ${esc(choice)}</p>
    </div>
    <span class="badge">${event.awarenessBefore}${esc(after)}</span>
  </li>`
}

/** APP_SPEC.md §4: the evening review lists every pause of the day with its scores and answers. */
export function eveningPauseList(db: Database, date: string, dict: Dict): string {
  const copy = dict.report
  const events = pausesOn(db, date)
  const lowest = lowestPause(db, date)
  return `<article class="card" data-card="eveningPauses">
    <p class="kicker">${esc(copy.eveningListTitle)}</p>
    ${
      events.length === 0
        ? `<p class="muted">${esc(copy.eveningListEmpty)}</p>`
        : `<ul class="stat-list">${events.map((event) => pauseLine(db, event, dict)).join('')}</ul>`
    }
    ${
      lowest
        ? `<p class="muted" data-card="eveningLowest">${esc(
            copy.eveningLowest(clockOf(lowest.at), triggerName(db, lowest.triggerId, dict), lowest.awarenessBefore),
          )}</p>`
        : ''
    }
  </article>`
}

/** APP_SPEC.md §1: average awareness today against yesterday, and what low scores sought today. */
export function dayCompareLine(db: Database, today: string, dict: Dict): string {
  const copy = dict.report
  const cmp = todayVsYesterday(db, today)
  if (cmp.today === null) return ''
  const line =
    cmp.yesterday === null
      ? copy.compareNoYesterday(formatAvg(cmp.today))
      : cmp.delta === 0
        ? copy.compareSame(formatAvg(cmp.today))
        : copy.compare(formatAvg(cmp.today), formatAvg(cmp.yesterday))
  const low = seekingWhenLowOn(db, today)
  return `<p class="muted" data-card="dayCompare">${esc(line)}</p>${
    low ? `<p class="muted" data-card="seekingLowToday">${esc(copy.seekingLow(dict.seekings[low.key]))}</p>` : ''
  }`
}
