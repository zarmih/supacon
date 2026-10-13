import { focusEndsAt, sessionEndsAt } from '../../domain/clock'
import { dayStats } from '../../domain/insights'
import { dayNumber, phaseFor } from '../../domain/protocol'
import { formatClock, localDate } from '../../domain/time'
import { SEEKINGS } from '../../domain/types'
import { activeFocus } from '../../store/mutate'
import { esc, field, formatAvg, impulseName, scoreGrid, triggerName } from '../html'
import type { ViewModel } from '../model'

export function morningScreen(view: ViewModel): string {
  const { dict } = view
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.morning.title)}</h1>
    <p class="lede">${esc(dict.morning.body)}</p>
    ${scoreGrid(view.form.score, 'form-score', dict)}
    ${field('desire', dict.morning.desire, view.fields.desire ?? '', dict.morning.placeholder)}
    <button type="button" class="btn primary block" data-action="morning-save">${esc(dict.save)}</button>
  </section>`
}

export function eveningScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const today = localDate(new Date(now))
  const stats = dayStats(db, today)
  const phase = phaseFor(dayNumber(db.startedOn, today), db.practiceMode)
  const diagnosis = phase === 'diagnosis'
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.evening.title)}</h1>
    <p class="muted">${esc(stats.pauses === 0 ? dict.home.noPauses : dict.home.stats(formatAvg(stats.avg), stats.pauses, stats.opened))}</p>
    ${field('lowest', dict.evening.lowest, view.fields.lowest ?? '', dict.evening.lowestPlaceholder)}
    ${field('note', dict.evening.note, view.fields.note ?? '', dict.evening.notePlaceholder, true)}
    <div class="setting">
      <div>
        <p>${esc(dict.evening.unlogged)}</p>
        <p class="muted">${esc(dict.evening.unloggedHelp)}</p>
      </div>
      <div class="stepper">
        <button type="button" data-action="unlogged" data-dir="-1" aria-label="${esc(dict.a11y.decrease)}">−</button>
        <span>${view.form.unlogged}</span>
        <button type="button" data-action="unlogged" data-dir="1" aria-label="${esc(dict.a11y.increase)}">+</button>
      </div>
    </div>
    ${
      diagnosis
        ? `<fieldset class="choice-list">
            <legend>${esc(dict.evening.likes)}</legend>
            ${(['yes', 'no', 'unsure'] as const)
              .map((value) => {
                const label = value === 'yes' ? dict.evening.likesYes : value === 'no' ? dict.evening.likesNo : dict.evening.likesUnsure
                const on = view.form.likes === value
                return `<button type="button" class="choice${on ? ' is-on' : ''}" data-action="likes" data-value="${value}" aria-pressed="${on}">${esc(label)}</button>`
              })
              .join('')}
          </fieldset>
          ${field('likes-note', dict.evening.likesNote, view.fields['likes-note'] ?? '', dict.evening.likesNote)}
          ${field('broke', dict.evening.broke, view.fields.broke ?? '', dict.evening.brokePlaceholder, true)}`
        : ''
    }
    <button type="button" class="btn primary block" data-action="evening-save">${esc(dict.save)}</button>
  </section>`
}

export function focusScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const running = activeFocus(db)
  if (!running) {
    const today = localDate(new Date(now))
    const done = db.focuses.find((entry) => entry.date === today && entry.endedAt)
    return `<section class="stack ritual">
      <a class="text-btn" href="#/today">${esc(dict.back)}</a>
      <h1 id="step-title">${esc(dict.focus.title)}</h1>
      <p class="lede">${esc(dict.focus.body)}</p>
      <p class="muted">${esc(dict.focus.room)}</p>
      ${done ? `<p class="flash">${esc(done.completed ? dict.focus.doneTitle : dict.focus.earlyTitle)} ${esc(dict.focus.logged(done.plannedMinutes))}</p>` : ''}
      <button type="button" class="btn primary block" data-action="focus-start">${esc(done ? dict.focus.another : dict.focus.start(db.settings.focusMinutes))}</button>
    </section>`
  }
  const remain = focusEndsAt(running) - now
  const finished = remain <= 0
  return `<section class="stack ritual">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(dict.home.focusTodo)}</p>
    <h1 id="step-title">${esc(finished ? dict.focus.doneTitle : dict.focus.title)}</h1>
    <p class="timer" data-clock="remain" data-until="${focusEndsAt(running)}">${formatClock(Math.max(0, remain))}</p>
    <p class="muted">${esc(dict.focus.room)}</p>
    <div class="choice-list">
      <button type="button" class="choice" data-action="focus-end" data-value="done">${esc(dict.focus.finish)}</button>
      <button type="button" class="choice" data-action="focus-end" data-value="early">${esc(dict.focus.stop)}</button>
    </div>
  </section>`
}

export function sessionScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const route = view.route
  if (route.name !== 'session') return ''
  const session = db.sessions.find((item) => item.id === route.id)
  if (!session || session.endedAt) {
    return `<section class="stack"><h1 id="step-title">${esc(dict.session.missing)}</h1><a class="btn" href="#/today">${esc(dict.nav.today)}</a></section>`
  }
  const remain = sessionEndsAt(session) - now
  const up = remain <= 0
  const name = triggerName(db, session.triggerId, dict)
  const seeking = impulseName(session.seeking, dict)
  const ask = up || view.form.pendingEnd
  return `<section class="stack ritual">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(name)}</p>
    <h1 id="step-title">${esc(up ? dict.session.up : dict.home.sessionRunning)}</h1>
    <p class="timer" data-clock="remain" data-until="${sessionEndsAt(session)}">${formatClock(Math.max(0, remain))}</p>
    <p class="muted">${esc(dict.session.of(session.plannedMinutes + session.extendedMinutes))}</p>
    <p class="context">${esc(dict.session.started(session.awarenessAtStart, seeking))}</p>
    ${session.finish ? `<p class="lede">${esc(dict.session.enough(session.finish))}</p>` : ''}
    ${session.overLimit ? `<p class="hint">${esc(dict.session.over)}</p>` : ''}
    ${
      ask
        ? `<p class="lede">${esc(dict.session.question)}</p>
           <div class="choice-list">
             <button type="button" class="choice" data-action="session-end" data-found="yes">${esc(dict.session.yes)}</button>
             <button type="button" class="choice" data-action="session-end" data-found="partly">${esc(dict.session.partly)}</button>
             <button type="button" class="choice" data-action="session-end" data-found="no">${esc(dict.session.no)}</button>
             ${up ? `<button type="button" class="choice" data-action="session-extend">${esc(dict.session.extend)}</button>` : ''}
           </div>`
        : `<button type="button" class="btn block" data-action="ask-end">${esc(dict.session.end)}</button>`
    }
  </section>`
}

export function missScreen(view: ViewModel): string {
  const { db, dict } = view
  const enabled = db.triggers.filter((trigger) => trigger.enabled)
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.miss.title)}</h1>
    <p class="lede">${esc(dict.miss.body)}</p>
    <div class="chips">
      ${enabled
        .map((trigger) => {
          const on = view.fields.trigger === trigger.id
          return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="miss-trigger" data-value="${esc(trigger.id)}" aria-pressed="${on}">${esc(triggerName(db, trigger.id, dict))}</button>`
        })
        .join('')}
    </div>
    <h2>${esc(dict.miss.score)}</h2>
    ${scoreGrid(view.form.score, 'form-score', dict)}
    <h2>${esc(dict.miss.seeking)}</h2>
    <div class="chips">
      ${SEEKINGS.map((seeking) => {
        const on = view.fields.seeking === seeking
        return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="miss-seeking" data-value="${seeking}" aria-pressed="${on}">${esc(dict.seekings[seeking])}</button>`
      }).join('')}
    </div>
    ${field('miss-note', dict.miss.note, view.fields['miss-note'] ?? '', dict.evening.notePlaceholder, true)}
    <button type="button" class="btn primary block" data-action="miss-save">${esc(dict.miss.save)}</button>
  </section>`
}

