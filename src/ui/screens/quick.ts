import { esc, triggerName } from '../html'
import type { ViewModel } from '../model'

export type Platform = 'ios' | 'android' | 'desktop'

/** Only orders the instructions; every platform stays one tap away. */
export function detectPlatform(userAgent: string, maxTouchPoints = 0): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios'
  if (/Android/i.test(userAgent)) return 'android'
  return 'desktop'
}

/** The address a shortcut opens: this page, with the trigger's pause in the hash. */
export function pauseLink(base: string, triggerId: string): string {
  return `${base.split('#')[0]}#/pause/${encodeURIComponent(triggerId)}`
}

export function quickScreen(view: ViewModel): string {
  const route = view.route
  const { db, dict } = view
  const copy = dict.quick
  const enabled = db.triggers.filter((trigger) => trigger.enabled)
  const wanted = route.name === 'quick' ? route.triggerId : undefined
  const selected = enabled.find((trigger) => trigger.id === wanted) ?? enabled[0]
  const base = typeof location === 'undefined' ? '' : location.href
  const platform = typeof navigator === 'undefined' ? 'desktop' : detectPlatform(navigator.userAgent, navigator.maxTouchPoints)
  const link = selected ? pauseLink(base, selected.id) : ''
  const name = selected ? triggerName(db, selected.id, dict) : ''

  const sections: Record<Platform, string> = {
    ios: `<details class="card quick-platform" data-platform="ios" ${platform === 'ios' ? 'open' : ''}>
        <summary>${esc(copy.iphone)}</summary>
        <h3>${esc(copy.installTitle)}</h3>
        <p>${esc(copy.iphoneInstall)}</p>
        <p class="note">${esc(copy.iphoneStorage)}</p>
        <h3>${esc(copy.automationTitle)}</h3>
        <ol class="bridge-steps">${copy.iphoneSteps.map((step) => `<li>${esc(step)}</li>`).join('')}</ol>
      </details>`,
    android: `<details class="card quick-platform" data-platform="android" ${platform === 'android' ? 'open' : ''}>
        <summary>${esc(copy.android)}</summary>
        <h3>${esc(copy.installTitle)}</h3>
        <p>${esc(copy.androidInstall)}</p>
        <h3>${esc(copy.automationTitle)}</h3>
        <p>${esc(copy.androidSamsung)}</p>
        <p>${esc(copy.androidOther)}</p>
      </details>`,
    desktop: `<details class="card quick-platform" data-platform="desktop" ${platform === 'desktop' ? 'open' : ''}>
        <summary>${esc(copy.desktop)}</summary>
        <p>${esc(copy.desktopBody)}</p>
      </details>`,
  }
  const order: Platform[] = [platform, ...(['ios', 'android', 'desktop'] as Platform[]).filter((item) => item !== platform)]

  return `<section class="stack quick">
    <a class="text-btn" href="#/settings">${esc(dict.back)}</a>
    <h1 id="step-title">${esc(copy.title)}</h1>
    <p class="lede">${esc(copy.lede)}</p>

    <section aria-labelledby="quick-pick">
      <h2 id="quick-pick">${esc(copy.pickTitle)}</h2>
      ${
        enabled.length === 0
          ? `<p class="muted">${esc(copy.pickNone)}</p>`
          : `<div class="chips" role="group" aria-labelledby="quick-pick">${enabled
              .map((trigger) => {
                const on = trigger.id === selected?.id
                return `<a class="chip${on ? ' is-on' : ''}" href="#/quick?trigger=${esc(encodeURIComponent(trigger.id))}" ${on ? 'aria-current="true"' : ''}>${esc(triggerName(db, trigger.id, dict))}</a>`
              })
              .join('')}</div>`
      }
      <p><a class="text-link" href="#/triggers">${esc(copy.triggersLink)} →</a></p>
    </section>

    ${
      selected
        ? `<section aria-labelledby="quick-link-title">
            <h2 id="quick-link-title">${esc(copy.linkTitle)}</h2>
            <label class="field"><span>${esc(copy.linkLabel(name))}</span>
              <input id="quick-link" readonly value="${esc(link)}" data-action="select-all" spellcheck="false" autocapitalize="off" />
            </label>
            <div class="pair">
              <button type="button" class="btn primary" data-action="copy-bridge" data-ending="${esc(link)}">${esc(copy.copy)}</button>
              <a class="btn" href="#/pause/${esc(encodeURIComponent(selected.id))}?check=1">${esc(copy.check)}</a>
            </div>
            <p class="muted">${esc(copy.checkHelp)}</p>
          </section>`
        : ''
    }

    <section aria-labelledby="quick-where" class="stack">
      <h2 id="quick-where">${esc(copy.whereTitle)}</h2>
      <p class="note">${esc(copy.noSetup)}</p>
      ${order.map((item) => sections[item]).join('')}
      <p class="muted">${esc(copy.afterward)}</p>
    </section>

    <section aria-labelledby="quick-limits">
      <h2 id="quick-limits">${esc(copy.limitsTitle)}</h2>
      <ul class="rules">${copy.limits.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    </section>
  </section>`
}
