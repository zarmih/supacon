import { withinNight, withinWindows } from '../../domain/cycles'
import { pendingPostpones, focusEndsAt, sessionEndsAt } from '../../domain/clock'
import { buildInsights, dayStats } from '../../domain/insights'
import { letterLines } from '../../domain/letter'
import { activeFocus, activeSession } from '../../store/mutate'
import {
  checklist,
  dayNumber,
  experimentForWeek,
  intentionId,
  limitActive,
  phaseFor,
  sessionsStartedOn,
  weekIndex,
} from '../../domain/protocol'
import { formatClock, formatHour, localDate } from '../../domain/time'
import type { Dict } from '../../i18n/en'
import { esc, formatAvg, triggerName } from '../html'
import type { ViewModel } from '../model'

export function todayScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const today = localDate(new Date(now))
  const day = dayNumber(db.startedOn, today)
  const phase = phaseFor(day, db.practiceMode)
  const stats = dayStats(db, today)
  const enabled = db.triggers.filter((trigger) => trigger.enabled)
  const only = enabled.length === 1 ? enabled[0] : undefined
  const pauseHref = only ? `#/pause/${only.id}` : '#/pause'
  const postHref = only ? `#/post/${only.id}` : '#/post'
  const session = activeSession(db)
  const focus = activeFocus(db)
  const capped = limitActive(day, db.practiceMode, db.settings.maxSessionsPerDay)
  const used = sessionsStartedOn(db, today)
  const insights = buildInsights(db, today)
  const lines = letterLines(insights, dict.letter, (key) => dict.seekings[key], formatHour, (key) => dict.cycles[key])
  const insight = lines[1] ?? lines[0] ?? ''
  const kicker = day
    ? `${dict.day(day)} · ${db.practiceMode ? dict.modes[db.practiceMode] : dict.phases[phase]}`
    : dict.phases[phase]
  const checks = checklist(db, today)
  const morning = db.mornings.find((entry) => entry.date === today)
  const evening = db.evenings.find((entry) => entry.date === today)
  const focusDone = db.focuses.some((entry) => entry.date === today && entry.endedAt)
  const mark = db.dayMarks.find((entry) => entry.date === today)
  const week = weekIndex(day)
  const experiment = experimentForWeek(week)
  const experimentMark = experiment
    ? db.experiments.find((entry) => entry.id === experiment.id && entry.weekIndex === week)
    : undefined
  const showExperiment =
    db.practiceMode === 'deepening' &&
    experiment &&
    experimentMark?.status !== 'done' &&
    experimentMark?.status !== 'dismissed'
  const diagnosis = phase === 'diagnosis'
  const askPractice = day !== null && day > 7 && db.practiceMode === null

  return `<section class="stack home">
    ${db.demo ? `<div class="banner"><p>${esc(dict.home.demo)}</p><button type="button" class="btn ghost" data-action="confirm" data-value="erase">${esc(dict.home.demoErase)}</button></div>` : ''}
    <p class="kicker">${esc(kicker)}</p>
    <h1 id="step-title">${esc(dict.intentions[intentionId(day, phase)])}</h1>
    ${view.flash ? `<p class="flash" role="status">${esc(view.flash)}</p>` : ''}
    ${askPractice ? cardLink('#/practice', dict.home.practicePrompt, dict.home.practiceLink) : ''}
    ${diagnosis && !evening?.whereItBroke ? cardLink('#/evening', dict.home.diagnosisPrompt, dict.home.diagnosisLink) : ''}

    ${
      session
        ? `<a class="btn primary block" href="#/session/${esc(session.id)}">${esc(dict.home.sessionRunning)}<span class="btn-meta" data-clock="remain" data-until="${sessionEndsAt(session)}">${formatClock(sessionEndsAt(session) - now)}</span></a>`
        : `<a class="btn primary block" href="${pauseHref}">${esc(dict.home.pause)}</a>`
    }

    <div class="status">
      <p class="meter">${esc(meterLine(capped, phase === 'calibration', used, db.settings.maxSessionsPerDay, dict))}${capped && used >= db.settings.maxSessionsPerDay ? ` · ${esc(dict.home.over)}` : ''}</p>
      ${withinNight(db.settings.nightStart, db.settings.nightEnd, new Date(now)) ? `<p class="note">${esc(dict.home.nightNote)}</p>` : ''}
      ${withinWindows(db.settings.windows, db.settings.windowMinutes, new Date(now)) === false ? `<p class="note">${esc(dict.home.windowNote)}</p>` : ''}
      ${capped ? `<div class="pips" aria-hidden="true">${pips(used, db.settings.maxSessionsPerDay)}</div>` : ''}
    </div>

    ${pendingPostpones(db, now)
      .map((item) => {
        const name = triggerName(db, item.triggerId, dict)
        const remain = item.until - now
        return `<article class="card">
          <p>${esc(item.waiting ? dict.home.postponeWaiting(name) : dict.home.postponeElapsed(name))}</p>
          ${item.waiting ? `<p class="timer small" data-clock="remain" data-until="${item.until}">${formatClock(remain)}</p>` : ''}
          <a class="text-link" href="#/pause/${esc(item.triggerId)}">${esc(dict.home.return)}</a>
        </article>`
      })
      .join('')}

    ${phase === 'boundary' && db.settings.windows.length === 0 ? cardLink('#/plan', dict.home.planPrompt, dict.home.planLink) : ''}
    ${phase === 'contrast' && insights.peakHour ? `<p class="note">${esc(dict.home.loud(formatHour(insights.peakHour.hour)))}</p>` : ''}
    ${insight ? `<a class="card link-card" href="#/insights"><span class="kicker">${esc(dict.home.insightLink)}</span><span>${esc(insight)}</span></a>` : ''}

    <section class="panel">
      <h2>${esc(dict.home.shape)}</h2>
      <ul class="checks">
        ${checks
          .map(
            (item) =>
              `<li class="${item.done ? 'is-done' : ''}"><span class="mark" aria-hidden="true"></span>${esc(dict.checks[item.id])}</li>`,
          )
          .join('')}
      </ul>
    </section>

    <div class="link-rows">
      <a href="#/morning"><span>${esc(morning ? dict.home.morningDone(morning.awareness) : dict.home.morningTodo)}</span>${morning ? `<small>${esc(morning.firstDesire)}</small>` : ''}</a>
      <a href="#/focus"><span>${esc(focus ? dict.home.focusRunning : focusDone ? dict.home.focusDone : dict.home.focusTodo)}</span>${focus ? `<small data-clock="remain" data-until="${focusEndsAt(focus)}">${formatClock(focusEndsAt(focus) - now)}</small>` : ''}</a>
      <a href="#/evening"><span>${esc(evening ? dict.home.eveningDone : dict.home.eveningTodo)}</span></a>
      <a href="${postHref}"><span>${esc(dict.home.posting)}</span></a>
      <a href="#/miss"><span>${esc(dict.home.miss)}</span></a>
      <a href="#/plan"><span>${esc(dict.home.planLink)}</span></a>
    </div>

    ${
      phase === 'contrast'
        ? `<section class="card">
            <h2>${esc(dict.home.contactQuestion)}</h2>
            ${
              mark && mark.realContact !== null
                ? `<p>${esc(mark.realContact ? dict.home.contactDoneYes : dict.home.contactDoneNo)}</p>`
                : `<div class="pair">
                    <button type="button" class="btn" data-action="contact" data-value="yes">${esc(dict.home.contactYes)}</button>
                    <button type="button" class="btn ghost" data-action="contact" data-value="no">${esc(dict.home.contactNo)}</button>
                  </div>`
            }
          </section>`
        : ''
    }

    ${
      showExperiment && experiment
        ? `<section class="card">
            <p class="kicker">${esc(dict.modes.deepening)}</p>
            <h2>${esc(dict.experiments[experiment.id].title)}</h2>
            <p>${esc(dict.experiments[experiment.id].body)}</p>
            <div class="pair">
              <button type="button" class="btn" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="done">${esc(dict.home.experimentDone)}</button>
              <button type="button" class="btn ghost" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="dismissed">${esc(dict.home.experimentDismiss)}</button>
            </div>
          </section>`
        : ''
    }

    <p class="muted stat-line">${esc(stats.pauses === 0 ? dict.home.noPauses : dict.home.stats(formatAvg(stats.avg), stats.pauses, stats.opened))}</p>
  </section>`
}

function cardLink(href: string, title: string, action: string): string {
  return `<a class="card link-card" href="${href}"><span>${esc(title)}</span><span class="text-link">${esc(action)}</span></a>`
}

function meterLine(capped: boolean, calibration: boolean, used: number, max: number, dict: Dict): string {
  if (capped) return dict.home.sessions(used, max)
  if (calibration && used === 0) return dict.home.calibration
  if (used > 0) return dict.home.sessionsOpen(used)
  return dict.home.noCap
}

function pips(used: number, max: number): string {
  const count = Math.max(max, used)
  return Array.from({ length: count }, (_, index) => `<i class="${index < used ? 'is-on' : ''}${index >= max ? ' is-over' : ''}"></i>`).join('')
}
