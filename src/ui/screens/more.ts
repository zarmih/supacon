import { CYCLES } from '../../domain/types'
import { PRESET_IDS } from '../../domain/types'
import type { PracticeMode } from '../../domain/types'
import { diagnosisDate, dayNumber, phaseFor } from '../../domain/protocol'
import { addDays, localDate } from '../../domain/time'
import { esc, triggerName } from '../html'
import type { ViewModel } from '../model'

const SESSION_CAPS = [0, 1, 2, 3, 4, 5, 6]
const SESSION_MINUTES = [10, 15, 20, 25, 30]
const POSTPONE_MINUTES = [15, 30, 45, 60]
const FOCUS_MINUTES = [25, 45, 60, 90]
const PAUSE_SECONDS = [5, 10, 15]

export function onboardingScreen(view: ViewModel): string {
  const { dict } = view
  const selected = new Set(view.presets)
  const ready = selected.size + view.customs.length > 0
  return `<section class="stack onboard">
    <p class="kicker">${esc(dict.onboarding.kicker)}</p>
    <h1 id="step-title">${esc(dict.onboarding.title)}</h1>
    <p class="lede">${esc(dict.onboarding.lede)}</p>
    <section>
      <h2>${esc(dict.onboarding.pulls)}</h2>
      <p class="muted">${esc(dict.onboarding.pullsHelp)}</p>
      <div class="chips">
        ${PRESET_IDS.filter((id) => id !== 'other')
          .map((id) => {
            const on = selected.has(id)
            return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="preset" data-value="${id}" aria-pressed="${on}">${esc(dict.triggers[id])}</button>`
          })
          .join('')}
        ${view.customs
          .map(
            (custom) =>
              `<button type="button" class="chip is-on" data-action="remove-custom" data-value="${esc(custom.id)}">${esc(custom.label)}</button>`,
          )
          .join('')}
      </div>
      <form class="add-row" data-action="add-custom">
        <label class="field"><span>${esc(dict.onboarding.custom)}</span>
          <input id="custom-name" maxlength="40" placeholder="${esc(dict.onboarding.placeholder)}" value="${esc(view.fields['custom-name'] ?? '')}" />
        </label>
        <button type="submit" class="btn">${esc(dict.add)}</button>
      </form>
    </section>
    <p class="note">${esc(dict.onboarding.honest)}</p>
    <button type="button" class="btn primary block" data-action="begin" data-path="protocol" ${ready ? '' : 'disabled'}>${esc(dict.onboarding.begin)}</button>
    <button type="button" class="text-btn center" data-action="begin" data-path="free" ${ready ? '' : 'disabled'}>${esc(dict.onboarding.free)}</button>
    <p class="muted">${esc(dict.onboarding.privacy)}</p>
  </section>`
}

export function triggersScreen(view: ViewModel): string {
  const { db, dict } = view
  return `<section class="stack">
    <a class="text-btn" href="#/settings">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.triggerScreen.title)}</h1>
    <p class="lede">${esc(dict.triggerScreen.help)}</p>
    <ul class="stat-list">
      ${db.triggers
        .map((trigger) => {
          return `<li>
            <span>${esc(triggerName(db, trigger.id, dict))}</span>
            <button type="button" class="btn ghost slim" data-action="toggle-trigger" data-id="${esc(trigger.id)}" aria-pressed="${trigger.enabled}">${esc(trigger.enabled ? dict.settingsScreen.on : dict.settingsScreen.off)}</button>
          </li>`
        })
        .join('')}
    </ul>
    <p class="muted">${esc(dict.triggerScreen.last)}</p>
    <form class="add-row" data-action="add-trigger">
      <label class="field"><span>${esc(dict.triggerScreen.placeholder)}</span>
        <input id="trigger-name" maxlength="40" placeholder="${esc(dict.triggerScreen.placeholder)}" />
      </label>
      <button type="submit" class="btn">${esc(dict.add)}</button>
    </form>
  </section>`
}

export function protocolScreen(view: ViewModel): string {
  const { db, dict, now } = view
  const today = localDate(new Date(now))
  const current = dayNumber(db.startedOn, today)
  const days = [1, 2, 3, 4, 5, 6, 7]
  return `<section class="stack">
    <p class="kicker">${esc(dict.nav.protocol)}</p>
    <h1 id="step-title">${esc(dict.protocolScreen.title)}</h1>
    <p class="lede">${esc(dict.protocolScreen.intro)}</p>
    <ol class="days">
      ${days
        .map((day) => {
          const phase = phaseFor(day, null)
          const state = current === null ? '' : day === current ? 'is-today' : day < current ? 'is-past' : 'is-ahead'
          const label = current === null ? '' : day === current ? dict.protocolScreen.today : day < current ? dict.protocolScreen.past : dict.protocolScreen.ahead
          const date = db.startedOn ? addDays(db.startedOn, day - 1) : ''
          const avgEvents = date ? db.events.filter((event) => event.date === date && event.intent === 'browse') : []
          const avg =
            avgEvents.length === 0
              ? ''
              : format1(avgEvents.reduce((sum, event) => sum + event.awarenessBefore, 0) / avgEvents.length)
          return `<li class="${state}">
            <div><span class="kicker">${esc(dict.day(day))} · ${esc(dict.phases[phase])}</span><p>${esc(dict.intentions[dayKey(day)])}</p></div>
            <span class="muted">${esc(label)}${avg ? ` · ${esc(avg)}` : ''}</span>
          </li>`
        })
        .join('')}
    </ol>
    <h2>${esc(dict.protocolScreen.rulesTitle)}</h2>
    <ul class="rules">${dict.protocolScreen.rules.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul>
    <p class="note">${esc(dict.protocolScreen.honest)}</p>
    <a class="btn" href="#/plan">${esc(dict.protocolScreen.plan)}</a>
  </section>`
}

export function planScreen(view: ViewModel): string {
  const { db, dict } = view
  const settings = db.settings
  const windows = [0, 1, 2].map((index) => settings.windows[index] ?? '')
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <p class="kicker">${esc(dict.appName)}</p>
    <h1 id="step-title">${esc(dict.plan.title)}</h1>
    <p class="lede">${esc(dict.plan.lede)}</p>
    <form class="stack" data-action="plan-save">
      <fieldset>
        <legend>${esc(dict.plan.windows)}</legend>
        <p class="muted">${esc(dict.plan.windowsHelp)}</p>
        ${windows
          .map((value, index) => {
            const id = `window-${index + 1}`
            const shown = view.fields[id] ?? value
            return `<label class="field"><span>${esc(String(index + 1))}</span><input id="${id}" type="time" value="${esc(shown)}" /></label>`
          })
          .join('')}
      </fieldset>
      <fieldset>
        <legend>${esc(dict.plan.radius)}</legend>
        <div class="chips">
          ${[30, 45, 60]
            .map((minutes) => {
              const on = settings.windowMinutes === minutes
              return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="window-radius" data-value="${minutes}" aria-pressed="${on}">${esc(dict.settingsScreen.minutes(minutes))}</button>`
            })
            .join('')}
        </div>
      </fieldset>
      <fieldset>
        <legend>${esc(dict.plan.night)}</legend>
        <p class="muted">${esc(dict.plan.nightHelp)}</p>
        <div class="pair">
          <label class="field"><span>${esc(dict.plan.nightStart)}</span><input id="night-start" type="time" value="${esc(view.fields['night-start'] ?? settings.nightStart ?? '')}" /></label>
          <label class="field"><span>${esc(dict.plan.nightEnd)}</span><input id="night-end" type="time" value="${esc(view.fields['night-end'] ?? settings.nightEnd ?? '')}" /></label>
        </div>
      </fieldset>
      <fieldset>
        <legend>${esc(dict.plan.replacements)}</legend>
        <p class="muted">${esc(dict.plan.replacementsHelp)}</p>
        ${CYCLES.map((cycle) => {
          const custom = settings.replacements[cycle]
          const value = view.fields[`repl-${cycle}`] ?? custom
          return `<label class="field"><span>${esc(dict.cycles[cycle])}</span><input id="repl-${cycle}" maxlength="160" placeholder="${esc(dict.plan.replacementsText[cycle])}" value="${esc(value)}" /></label>`
        }).join('')}
      </fieldset>
      <button type="submit" class="btn primary block">${esc(dict.plan.save)}</button>
    </form>
    <p class="note">${esc(dict.plan.sex)}</p>
    <p class="muted">${esc(dict.plan.care)}</p>
  </section>`
}

function dayKey(day: number): 'd1' | 'd2' | 'd3' | 'd4' | 'd5' | 'd6' | 'd7' {
  if (day === 2) return 'd2'
  if (day === 3) return 'd3'
  if (day === 4) return 'd4'
  if (day === 5) return 'd5'
  if (day === 6) return 'd6'
  if (day === 7) return 'd7'
  return 'd1'
}

function format1(value: number): string {
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function practiceScreen(view: ViewModel): string {
  const { db, dict } = view
  const diagnosisOn = diagnosisDate(db.startedOn)
  const review = diagnosisOn ? db.evenings.find((entry) => entry.date === diagnosisOn) : undefined
  const modes: PracticeMode[] = ['maintenance', 'deepening', 'free']
  return `<section class="stack">
    <a class="text-btn" href="#/today">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(dict.practice.title)}</h1>
    <p class="lede">${esc(dict.practice.intro)}</p>
    ${
      review?.whereItBroke
        ? `<article class="card"><h2>${esc(dict.practice.summaryTitle)}</h2><p>${esc(review.whereItBroke)}</p>${review.likesNote ? `<p class="muted">${esc(review.likesNote)}</p>` : ''}</article>`
        : ''
    }
    ${modes
      .map((mode) => {
        const title = mode === 'maintenance' ? dict.practice.maintenanceTitle : mode === 'deepening' ? dict.practice.deepeningTitle : dict.practice.freeTitle
        const body = mode === 'maintenance' ? dict.practice.maintenanceBody : mode === 'deepening' ? dict.practice.deepeningBody : dict.practice.freeBody
        const on = db.practiceMode === mode
        return `<article class="card${on ? ' is-on' : ''}">
          <h2>${esc(title)}${on ? ` · ${esc(dict.practice.current)}` : ''}</h2>
          <p>${esc(body)}</p>
          ${on ? '' : `<button type="button" class="btn" data-action="mode" data-value="${mode}">${esc(title)}</button>`}
        </article>`
      })
      .join('')}
  </section>`
}

export function settingsScreen(view: ViewModel): string {
  const { db, dict } = view
  const settings = db.settings
  return `<section class="stack">
    <h1 id="step-title">${esc(dict.settingsScreen.title)}</h1>
    <p class="note">${esc(dict.settingsScreen.privacy)}</p>
    <div class="link-rows">
      <a href="#/triggers"><span>${esc(dict.triggerScreen.title)}</span></a>
      <a href="#/plan"><span>${esc(dict.settingsScreen.plan)}</span></a>
      <a href="#/protocol"><span>${esc(dict.nav.protocol)}</span></a>
    </div>

    <fieldset>
      <legend>${esc(dict.settingsScreen.language)}</legend>
      <div class="chips">
        ${langButton('auto', dict.settingsScreen.auto, settings.lang)}
        ${langButton('en', dict.settingsScreen.english, settings.lang)}
        ${langButton('ru', dict.settingsScreen.russian, settings.lang)}
      </div>
    </fieldset>
    <fieldset>
      <legend>${esc(dict.settingsScreen.theme)}</legend>
      <div class="chips">
        ${themeButton('ink', dict.settingsScreen.ink, settings.theme)}
        ${themeButton('paper', dict.settingsScreen.paper, settings.theme)}
        ${themeButton('system', dict.settingsScreen.system, settings.theme)}
      </div>
    </fieldset>

    ${stepper(dict.settingsScreen.sessions, dict.settingsScreen.sessionsHelp, 'maxSessionsPerDay', settings.maxSessionsPerDay === 0 ? dict.settingsScreen.unlimited : String(settings.maxSessionsPerDay), dict)}
    ${stepper(dict.settingsScreen.sessionMinutes, '', 'sessionMinutes', dict.settingsScreen.minutes(settings.sessionMinutes), dict)}
    ${stepper(dict.settingsScreen.postpone, '', 'postponeMinutes', dict.settingsScreen.minutes(settings.postponeMinutes), dict)}
    ${stepper(dict.settingsScreen.focusMinutes, '', 'focusMinutes', dict.settingsScreen.minutes(settings.focusMinutes), dict)}
    ${stepper(dict.settingsScreen.pauseSeconds, '', 'pauseSeconds', dict.settingsScreen.seconds(settings.pauseSeconds), dict)}

    <div class="setting">
      <div>
        <p>${esc(dict.settingsScreen.notifications)}</p>
        <p class="muted">${esc(dict.settingsScreen.notificationsHelp)}</p>
      </div>
      <button type="button" class="btn ghost slim" data-action="notify" aria-pressed="${settings.notifications}">${esc(settings.notifications ? dict.settingsScreen.on : dict.settingsScreen.off)}</button>
    </div>
    <label class="field"><span>${esc(dict.settingsScreen.reminder)}</span>
      <input id="evening-time" type="time" value="${esc(settings.eveningReminder ?? '')}" />
    </label>

    <div class="choice-list">
      <button type="button" class="choice" data-action="export">${esc(dict.settingsScreen.export)}</button>
      <button type="button" class="choice" data-action="import">${esc(dict.settingsScreen.import)}</button>
      <input id="import-file" type="file" accept="application/json" hidden />
      ${view.installReady ? `<button type="button" class="choice" data-action="install">${esc(dict.settingsScreen.installReady)}</button>` : `<p class="muted">${esc(dict.settingsScreen.installHelp)}</p>`}
      <button type="button" class="choice" data-action="confirm" data-value="example">${esc(dict.settingsScreen.example)}</button>
      <button type="button" class="choice" data-action="confirm" data-value="restart">${esc(dict.settingsScreen.restart)}</button>
      <button type="button" class="choice danger" data-action="confirm" data-value="erase">${esc(dict.settingsScreen.erase)}</button>
    </div>
    <p class="muted">${esc(dict.settingsScreen.install)}</p>
  </section>`
}

function langButton(value: string, label: string, current: string): string {
  const on = current === value
  return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="lang" data-value="${value}" aria-pressed="${on}">${esc(label)}</button>`
}

function themeButton(value: string, label: string, current: string): string {
  const on = current === value
  return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="theme" data-value="${value}" aria-pressed="${on}">${esc(label)}</button>`
}

function stepper(title: string, help: string, key: string, value: string, dict: ViewModel['dict']): string {
  return `<div class="setting">
    <div><p>${esc(title)}</p>${help ? `<p class="muted">${esc(help)}</p>` : ''}</div>
    <div class="stepper">
      <button type="button" data-action="step" data-key="${key}" data-dir="-1" aria-label="${esc(dict.a11y.decrease)}">−</button>
      <span>${esc(value)}</span>
      <button type="button" data-action="step" data-key="${key}" data-dir="1" aria-label="${esc(dict.a11y.increase)}">+</button>
    </div>
  </div>`
}

export { SESSION_CAPS, SESSION_MINUTES, POSTPONE_MINUTES, FOCUS_MINUTES, PAUSE_SECONDS }
