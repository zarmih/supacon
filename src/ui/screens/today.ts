import { withinNight, withinWindows } from '../../domain/cycles'
import { pendingPostpones, focusEndsAt, sessionEndsAt } from '../../domain/clock'
import { buildInsights, dayStats, type Insights } from '../../domain/insights'
import { letterLines } from '../../domain/letter'
import { activeFocus, activeSession } from '../../store/mutate'
import {
  calibrationVsContrast,
  checklist,
  contrastFocusSuggestion,
  dayNumber,
  experimentForWeek,
  intentionId,
  isProtocolCompleted,
  limitActive,
  phaseFor,
  protocolPausesCount,
  sessionsStartedOn,
  weekIndex,
  type CheckItem,
  type ExperimentDef,
  type PhaseComparison,
} from '../../domain/protocol'
import { CYCLES, type Cycle, type Database, type DayMark, type EveningReview, type ExperimentMark, type Phase, type PracticeMode, type Session } from '../../domain/types'
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
  const focusSuggestion = contrastFocusSuggestion(db, now)
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
  const showExperiment = db.practiceMode === 'deepening' && Boolean(experiment)
  const diagnosis = phase === 'diagnosis'
  const completed = isProtocolCompleted(db, today)
  const pauses7Days = completed ? protocolPausesCount(db) : 0
  const comparison = completed ? calibrationVsContrast(db) : null
  const todayMisses = db.misses.filter((miss) => miss.date === today).length

  return `<section class="stack home">
    ${db.demo ? `<div class="banner"><p>${esc(dict.home.demo)}</p><button type="button" class="btn ghost" data-action="confirm" data-value="erase">${esc(dict.home.demoErase)}</button></div>` : ''}
    <p class="kicker">${esc(kicker)}</p>
    <h1 id="step-title">${esc(dict.intentions[intentionId(day, phase)])}</h1>
    ${view.flash ? `<p class="flash" role="status">${esc(view.flash)}</p>` : ''}
    ${completed ? protocolSummaryCard(dict, pauses7Days, comparison) : ''}
    ${!completed && diagnosis && !evening?.whereItBroke ? cardLink('#/evening', dict.home.diagnosisPrompt, dict.home.diagnosisLink) : ''}
    ${eveningReview(dict, evening, todayMisses, now)}

    ${
      session
        ? activeSessionCard(db, session, dict, now)
        : `<a class="btn primary block" href="${pauseHref}">${esc(dict.home.pause)}</a>`
    }

    <div class="status">
      <p class="meter">${esc(meterLine(capped, phase === 'calibration', used, db.settings.maxSessionsPerDay, dict))}${capped && used >= db.settings.maxSessionsPerDay ? ` · ${esc(dict.home.over)}` : ''}</p>
      ${withinNight(db.settings.nightStart, db.settings.nightEnd, new Date(now)) ? `<p class="note">${esc(dict.home.nightNote)}</p>` : ''}
      ${withinWindows(db.settings.windows, db.settings.windowMinutes, new Date(now)) === false ? `<p class="note">${esc(dict.home.windowNote)}</p>` : ''}
      ${withinWindows(db.settings.windows, db.settings.windowMinutes, new Date(now)) === true ? `<p class="note">${esc(dict.home.windowActive)}</p>` : ''}
      ${
        focusSuggestion
          ? `<a href="#/focus" class="note ${focusSuggestion.isSuggestedNow ? 'flash' : ''}" data-cue="contrast-focus" data-action="go-focus" style="display: block; text-decoration: none;">${esc(
              focusSuggestion.isSuggestedNow
                ? dict.home.contrastFocusNow(formatHour(focusSuggestion.suggestedHour))
                : dict.home.contrastFocusLater(formatHour(focusSuggestion.suggestedHour)),
            )}</a>`
          : ''
      }
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

    ${planCard(db, phase, insights, dict)}
    ${!focusSuggestion && phase === 'contrast' && insights.peakHour ? `<p class="note">${esc(dict.home.loud(formatHour(insights.peakHour.hour)))}</p>` : ''}
    ${insight ? `<a class="card link-card" href="#/insights"><span class="kicker">${esc(dict.home.insightLink)}</span><span>${esc(insight)}</span></a>` : ''}

    <section class="panel">
      <h2>${esc(dict.home.shape)}</h2>
      <ul class="checks">
        ${checks
          .map((item) => {
            const label = checkItemLabel(item, morning, dict)
            return `<li class="${item.done ? 'is-done' : ''}"><span class="mark" aria-hidden="true"></span><span>${esc(label)}</span></li>`
          })
          .join('')}
      </ul>
    </section>

    <div class="link-rows">
      <a href="#/morning"><span>${esc(morning ? dict.home.morningDone(morning.awareness) : dict.home.morningTodo)}</span>${morning ? `<small>${esc(morning.firstDesire)}</small>` : ''}</a>
      <a href="#/focus"><span>${esc(focus ? dict.home.focusRunning : focusDone ? dict.home.focusDone : dict.home.focusTodo)}</span>${focus ? `<small data-clock="remain" data-until="${focusEndsAt(focus)}">${formatClock(focusEndsAt(focus) - now)}</small>` : ''}</a>
      <a href="#/evening" data-card="eveningReviewLink"><span>${esc(evening ? dict.home.eveningDone : dict.home.eveningTodo)}</span><small>${esc(dict.home.missesLoggedToday(todayMisses))}</small></a>
      <a href="${postHref}"><span>${esc(dict.home.posting)}</span></a>
      <a href="#/miss"><span>${esc(dict.home.miss)}</span></a>
      <a href="#/plan"><span>${esc(dict.home.planLink)}</span></a>
      <a href="#/journal"><span>${esc(dict.home.journalLink)}</span></a>
    </div>

    ${phase === 'contrast' ? contactCard(dict, mark) : ''}

    ${showExperiment && experiment ? experimentCard(dict, experiment, week, experimentMark) : ''}

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

function protocolSummaryCard(
  dict: Dict,
  pausesCount: number,
  comparison: PhaseComparison | null,
): string {
  const modes: PracticeMode[] = ['maintenance', 'deepening', 'free']
  return `<section class="card protocol-summary">
    <p class="kicker">${esc(dict.home.practicePrompt)}</p>
    <h2>${esc(dict.home.protocolSummaryTitle)}</h2>
    <p class="lede">${esc(dict.home.protocolSummaryIntro)}</p>
    <div class="summary-stats">
      <p><strong>${esc(dict.home.protocolPauses(pausesCount))}</strong></p>
      ${
        comparison
          ? `<p class="muted">${esc(
              dict.home.protocolComparison(
                formatAvg(comparison.calibration.avgAwareness),
                formatAvg(comparison.contrast.avgAwareness),
                comparison.calibration.openRate,
                comparison.contrast.openRate,
              ),
            )}</p>`
          : ''
      }
    </div>
    <p class="muted">${esc(dict.home.protocolPathPrompt)}</p>
    <div class="mode-options">
      ${modes
        .map((mode) => {
          const title =
            mode === 'maintenance'
              ? dict.practice.maintenanceTitle
              : mode === 'deepening'
                ? dict.practice.deepeningTitle
                : dict.practice.freeTitle
          const body =
            mode === 'maintenance'
              ? dict.practice.maintenanceBody
              : mode === 'deepening'
                ? dict.practice.deepeningBody
                : dict.practice.freeBody
          return `<div class="mode-option">
            <h3>${esc(title)}</h3>
            <p class="muted">${esc(body)}</p>
            <button type="button" class="btn" data-action="mode" data-value="${mode}">${esc(dict.home.chooseMode(title))}</button>
          </div>`
        })
        .join('')}
    </div>
  </section>`
}

function planCard(db: Database, phase: Phase, insights: Insights, dict: Dict): string {
  const cycleKey = insights.cycle?.key
  const customList = (CYCLES as readonly Cycle[])
    .filter((c) => Boolean(db.settings.replacements[c]?.trim()))
    .map((c) => ({ cycle: c, text: db.settings.replacements[c].trim() }))

  if (cycleKey) {
    const text = db.settings.replacements[cycleKey]?.trim() || dict.plan.replacementsText[cycleKey]
    if (text) {
      return `<a class="card link-card" href="#/plan"><span class="kicker">${esc(dict.home.planLink)}</span><span>${esc(dict.home.planReplacement(dict.cycles[cycleKey], text))}</span></a>`
    }
  }

  if (customList.length > 0) {
    const reminder = customList.map((item) => dict.home.planReplacement(dict.cycles[item.cycle], item.text)).join(' · ')
    return `<a class="card link-card" href="#/plan"><span class="kicker">${esc(dict.home.planLink)}</span><span>${esc(reminder)}</span></a>`
  }

  if (phase === 'boundary' && db.settings.windows.length === 0) {
    return cardLink('#/plan', dict.home.planPrompt, dict.home.planLink)
  }

  return ''
}

export function eveningReview(
  dict: Dict,
  evening: EveningReview | undefined,
  loggedMisses: number,
  now: number,
): string {
  const hour = new Date(now).getHours()
  const isEvening = hour >= 18 || Boolean(evening) || loggedMisses > 0
  if (!isEvening) return ''
  return `<section class="card evening-review" data-card="eveningReview">
    <p class="kicker">${esc(dict.home.eveningTodo)}</p>
    <h2>${esc(evening ? dict.home.eveningDone : dict.evening.title)}</h2>
    <p class="muted">${esc(dict.home.missesLoggedToday(loggedMisses))}</p>
    <a href="#/evening" class="text-link">${esc(evening ? dict.home.eveningEdit : dict.home.eveningStart)} →</a>
  </section>`
}

export function experimentCard(
  dict: Dict,
  experiment: ExperimentDef,
  week: number,
  mark: ExperimentMark | undefined,
): string {
  const content = dict.experiments[experiment.id]
  const status = mark?.status

  let actionsHtml = ''
  if (!status) {
    actionsHtml = `
      <div class="chips" style="margin-top: 0.35rem;">
        <button type="button" class="btn primary slim" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="open">${esc(dict.home.experimentTry)}</button>
        <button type="button" class="btn slim" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="done">${esc(dict.home.experimentDone)}</button>
        <button type="button" class="btn ghost slim" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="dismissed">${esc(dict.home.experimentDismiss)}</button>
      </div>`
  } else if (status === 'open') {
    actionsHtml = `
      <p class="muted note">${esc(dict.home.experimentActive)}</p>
      <div class="chips" style="margin-top: 0.35rem;">
        <button type="button" class="btn primary slim" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="done">${esc(dict.home.experimentDone)}</button>
        <button type="button" class="btn ghost slim" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="dismissed">${esc(dict.home.experimentDismiss)}</button>
      </div>`
  } else if (status === 'done') {
    actionsHtml = `
      <p class="muted note">${esc(dict.home.experimentCompleted)}</p>
      <div class="chips" style="margin-top: 0.35rem;">
        <button type="button" class="text-btn" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="open">${esc(dict.home.experimentChange)}</button>
      </div>`
  } else if (status === 'dismissed') {
    actionsHtml = `
      <p class="muted note">${esc(dict.home.experimentDismissed)}</p>
      <div class="chips" style="margin-top: 0.35rem;">
        <button type="button" class="text-btn" data-action="experiment" data-id="${experiment.id}" data-week="${week}" data-status="open">${esc(dict.home.experimentTry)}</button>
      </div>`
  }

  return `<section class="card experiment-card" data-card="experimentCard">
    <p class="kicker">${esc(dict.modes.deepening)} · ${esc(dict.home.experimentKicker)}</p>
    <h2>${esc(content.title)}</h2>
    <p class="lede" style="font-size: 1rem;">${esc(content.body)}</p>
    ${actionsHtml}
  </section>`
}

export function contactCard(dict: Dict, mark: DayMark | undefined): string {
  const hasAnswered = Boolean(mark && mark.realContact !== null)
  const isYes = mark?.realContact === true
  const noteValue = mark?.contactNote ?? ''

  return `<section class="card contact-card" data-card="contactCard">
    <h2>${esc(dict.home.contactQuestion)}</h2>
    <p class="muted note">${esc(dict.home.contactPrompt)}</p>
    ${
      !hasAnswered
        ? `<div class="pair" style="margin-top: 0.75rem;">
            <button type="button" class="btn" data-action="contact" data-value="yes">${esc(dict.home.contactYes)}</button>
            <button type="button" class="btn ghost" data-action="contact" data-value="no">${esc(dict.home.contactNo)}</button>
          </div>`
        : isYes
          ? `<div class="stack" style="margin-top: 0.5rem; gap: 0.5rem;">
              <p class="lede">${esc(dict.home.contactDoneYes)}</p>
              <div class="field">
                <label for="contact-note" class="muted" style="font-size: 0.85rem;">${esc(dict.home.contactNotePlaceholder)}</label>
                <textarea
                  id="contact-note"
                  name="contactNote"
                  class="input"
                  maxlength="180"
                  rows="2"
                  placeholder="${esc(dict.home.contactNotePlaceholder)}"
                  style="width: 100%; resize: vertical;"
                >${esc(noteValue)}</textarea>
                <div class="pair" style="margin-top: 0.35rem; justify-content: flex-end;">
                  <button type="button" class="btn small" data-action="save-contact-note">${esc(dict.save)}</button>
                </div>
              </div>
              <div class="chips">
                <button type="button" class="text-btn muted" data-action="contact" data-value="no">${esc(dict.home.contactNo)}</button>
              </div>
            </div>`
          : `<div class="stack" style="margin-top: 0.5rem; gap: 0.5rem;">
              <p class="muted">${esc(dict.home.contactDoneNo)}</p>
              <div class="chips">
                <button type="button" class="text-btn" data-action="contact" data-value="yes">${esc(dict.home.contactYes)}</button>
              </div>
            </div>`
    }
  </section>`
}

function checkItemLabel(
  item: CheckItem,
  morning: Database['mornings'][number] | undefined,
  dict: Dict,
): string {
  if (item.id === 'morning') {
    if (item.done && morning) {
      const desire = morning.firstDesire.trim()
      const score = dict.checks.morningScore(morning.awareness)
      const full = desire ? `${score} · ${desire}` : score
      return full.length > 40 ? `${full.slice(0, 39).trimEnd()}…` : full
    }
    return dict.checks.morning
  }
  if (item.id === 'evening') {
    return item.done ? dict.checks.eveningDone : dict.checks.evening
  }
  return dict.checks[item.id]
}

export function activeSessionCard(
  db: Database,
  session: Session,
  dict: Dict,
  now: number,
): string {
  const name = triggerName(db, session.triggerId, dict) || session.triggerId
  const remain = sessionEndsAt(session) - now
  const finish = session.finish?.trim()
  const finishText = finish ? dict.home.sessionFinish(finish) : ''
  const endLabel = dict.home.sessionEndNow

  return `<section class="card active-session-card" data-card="activeSession">
    <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem;">
      <span class="kicker">${esc(name)}</span>
      <span class="timer small" data-clock="remain" data-until="${sessionEndsAt(session)}">${formatClock(remain)}</span>
    </div>
    ${finishText ? `<p class="session-finish muted"><strong>${esc(finishText)}</strong></p>` : ''}
    <div class="pair" style="margin-top: 0.5rem;">
      <a class="btn primary" href="#/session/${esc(session.id)}">${esc(dict.home.sessionRunning)}</a>
      <button type="button" class="btn ghost" data-action="session-end" data-id="${esc(session.id)}">${esc(endLabel)}</button>
    </div>
  </section>`
}
