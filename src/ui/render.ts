import { esc } from './html'
import type { ViewModel } from './model'
import { eveningScreen, focusScreen, missScreen, morningScreen, sessionScreen } from './screens/journal'
import { insightsScreen } from './screens/insights'
import { bridgeScreen, onboardingScreen, planScreen, practiceScreen, protocolScreen, settingsScreen, triggersScreen } from './screens/more'
import { pauseScreen } from './screens/pause'
import { todayScreen } from './screens/today'

export function render(view: ViewModel): string {
  const bare = view.route.name === 'pause' || view.route.name === 'session' || view.route.name === 'onboarding' || view.route.name === 'focus'
  const body = screen(view)
  return `<div class="app${bare ? ' is-bare' : ''}">
    ${bare ? '' : top(view)}
    <main class="screen">${body}</main>
    ${bare ? '' : tabs(view)}
    ${view.toast ? `<p class="toast" role="status">${esc(view.toast)}</p>` : ''}
    ${view.confirm ? confirm(view) : ''}
  </div>`
}

function screen(view: ViewModel): string {
  switch (view.route.name) {
    case 'onboarding':
      return onboardingScreen(view)
    case 'pause':
      return pauseScreen(view)
    case 'session':
      return sessionScreen(view)
    case 'morning':
      return morningScreen(view)
    case 'evening':
      return eveningScreen(view)
    case 'focus':
      return focusScreen(view)
    case 'insights':
      return insightsScreen(view)
    case 'triggers':
      return triggersScreen(view)
    case 'protocol':
      return protocolScreen(view)
    case 'settings':
      return settingsScreen(view)
    case 'practice':
      return practiceScreen(view)
    case 'plan':
      return planScreen(view)
    case 'bridge':
      return bridgeScreen(view)
    case 'miss':
      return missScreen(view)
    default:
      return todayScreen(view)
  }
}

function top(view: ViewModel): string {
  const { dict } = view
  return `<header class="top">
    <a class="word" href="#/today">${esc(dict.appName)}</a>
    <a href="#/protocol">${esc(dict.nav.protocol)}</a>
    <a href="#/settings">${esc(dict.nav.settings)}</a>
  </header>`
}

function tabs(view: ViewModel): string {
  const { dict, route } = view
  return `<nav class="tabbar" aria-label="${esc(dict.a11y.menu)}">
    <a href="#/today" ${route.name === 'today' ? 'aria-current="page"' : ''}>${esc(dict.nav.today)}</a>
    <a href="#/insights" ${route.name === 'insights' ? 'aria-current="page"' : ''}>${esc(dict.nav.insights)}</a>
  </nav>`
}

function confirm(view: ViewModel): string {
  const { dict, confirm: kind } = view
  if (!kind) return ''
  const copy =
    kind === 'erase'
      ? { title: dict.confirm.eraseTitle, body: dict.confirm.eraseBody, yes: dict.confirm.eraseYes }
      : kind === 'restart'
        ? { title: dict.confirm.restartTitle, body: dict.confirm.restartBody, yes: dict.confirm.restartYes }
        : { title: dict.confirm.exampleTitle, body: dict.confirm.exampleBody, yes: dict.confirm.exampleYes }
  return `<div class="dialog-back" data-action="confirm-cancel">
    <div class="dialog" role="alertdialog" aria-modal="true" data-action="stop">
      <h2>${esc(copy.title)}</h2>
      <p>${esc(copy.body)}</p>
      <button type="button" class="btn primary" data-action="confirm-yes">${esc(copy.yes)}</button>
      <button type="button" class="btn ghost" data-action="confirm-cancel">${esc(dict.cancel)}</button>
    </div>
  </div>`
}

