import { breathProgress, canChoose, choicesFor, goBack } from '../../domain/pause'
import { dayNumber, limitActive, phaseFor, sessionsStartedOn } from '../../domain/protocol'
import { isOverLimit } from '../../domain/protocol'
import { localDate } from '../../domain/time'
import { pickHint } from '../../domain/hints'
import { SEEKINGS, POST_MOTIVES } from '../../domain/types'
import { esc, impulseName, ring, scoreGrid, triggerName } from '../html'
import type { ViewModel } from '../model'

export function pauseScreen(view: ViewModel): string {
  const route = view.route
  if (route.name !== 'pause') return ''
  const { db, dict, now } = view
  const enabled = db.triggers.filter((trigger) => trigger.enabled)
  if (!route.triggerId) {
    return `<section class="stack">
      <p class="kicker">${esc(dict.appName)}</p>
      <h1 id="step-title">${esc(route.intent === 'post' ? dict.pause.pickerPost : dict.pause.picker)}</h1>
      <div class="link-rows">
        ${enabled
          .map((trigger) => {
            const href = route.intent === 'post' ? `#/post/${esc(trigger.id)}` : `#/pause/${esc(trigger.id)}`
            return `<a href="${href}"><span>${esc(triggerName(db, trigger.id, dict))}</span></a>`
          })
          .join('')}
      </div>
    </section>`
  }

  const trigger = enabled.find((item) => item.id === route.triggerId)
  if (!trigger || !view.pause) {
    return `<section class="stack"><h1 id="step-title">${esc(dict.pause.missing)}</h1><a class="btn" href="#/today">${esc(dict.nav.today)}</a></section>`
  }

  const draft = view.pause
  const name = triggerName(db, trigger.id, dict)
  const today = localDate(new Date(now))
  const day = dayNumber(db.startedOn, today)
  const phase = phaseFor(day, db.practiceMode)
  const capped = limitActive(day, db.practiceMode, db.settings.maxSessionsPerDay)
  const used = sessionsStartedOn(db, today)
  const over = isOverLimit(db, today)
  const ready = canChoose(draft, now)
  const back = goBack(draft).step !== draft.step
  const progress = breathProgress(draft, now)

  return `<section class="ritual">
    <div class="ritual-top">
      ${back ? `<button type="button" class="text-btn" data-action="back">${esc(dict.back)}</button>` : '<span></span>'}
      <a class="text-btn" href="#/today">${esc(dict.cancel)}</a>
    </div>
    <p class="kicker">${esc(name)}</p>
    ${ring(progress)}
    ${stepBody(view, { name, capped, used, over, ready, phase })}
  </section>`
}

function stepBody(
  view: ViewModel,
  ctx: { name: string; capped: boolean; used: number; over: boolean; ready: boolean; phase: string },
): string {
  const draft = view.pause
  const { dict, db, now } = view
  if (!draft) return ''
  if (draft.step === 'arrive') {
    return `<h1 id="step-title">${esc(dict.pause.stop)}</h1>
      <p class="lede">${esc(dict.pause.stopBody)}</p>
      <button type="button" class="btn primary block" data-action="arrive">${esc(dict.pause.here)}</button>`
  }
  if (draft.step === 'score') {
    return `<h1 id="step-title">${esc(dict.pause.question)}</h1>
      <p class="lede">${esc(dict.pause.notAutopilot)}</p>
      ${scoreGrid(draft.awarenessBefore, 'score', dict)}`
  }
  if (draft.step === 'seeking') {
    const post = draft.intent === 'post'
    const options = post ? POST_MOTIVES : SEEKINGS
    const note = draft.seeking === 'other'
    return `<h1 id="step-title">${esc(post ? dict.pause.whyPost : dict.pause.seeking)}</h1>
      <div class="chips">
        ${options
          .map((option) => {
            const on = draft.seeking === option
            const label = post ? dict.motives[option as keyof typeof dict.motives] : dict.seekings[option as keyof typeof dict.seekings]
            return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="seeking" data-value="${option}" aria-pressed="${on}">${esc(label)}</button>`
          })
          .join('')}
      </div>
      ${
        note
          ? `<label class="field"><span>${esc(dict.pause.seeking)}</span><input id="seeking-note" maxlength="160" placeholder="${esc(dict.pause.notePlaceholder)}" value="${esc(view.fields['seeking-note'] ?? draft.seekingNote)}" /></label>
             <button type="button" class="btn primary block" data-action="seek-continue">${esc(dict.continue)}</button>`
          : ''
      }`
  }
  if (draft.step === 'choose') {
    const hintId = pickHint(db, {
      intent: draft.intent,
      awareness: draft.awarenessBefore,
      seeking: draft.seeking,
      triggerId: draft.triggerId,
      overLimit: ctx.over && draft.intent === 'browse',
      hour: new Date(now).getHours(),
      now,
    })
    const choices = choicesFor(draft.intent)
    return `<h1 id="step-title">${esc(dict.pause.choose)}</h1>
      <p class="context">${esc(`${draft.awarenessBefore ?? '—'} · ${draft.seeking ? impulseName(draft.seeking, dict) : ''} · ${ctx.name}`)}</p>
      <p class="muted">${esc(ctx.capped ? dict.pause.sessions(ctx.used, db.settings.maxSessionsPerDay) : ctx.phase === 'calibration' ? dict.pause.calibrationCap : dict.pause.noCap)}</p>
      ${hintId ? `<p class="hint">${esc(dict.hints[hintId])}</p>` : ''}
      <p class="muted" data-breath-note ${ctx.ready ? 'hidden' : ''}>${esc(dict.pause.breath)}</p>
      <div class="choice-list">
        ${choices
          .map((choice) => {
            const label = choiceLabel(choice, dict, db.settings.postponeMinutes, ctx.over)
            return `<button type="button" class="choice" data-action="choice" data-value="${choice}" data-needs-breath ${ctx.ready ? '' : 'disabled'}>${esc(label)}</button>`
          })
          .join('')}
      </div>`
  }
  return `<h1 id="step-title">${esc(dict.pause.after)}</h1>
    <p class="lede">${esc(dict.pause.afterBody)}</p>
    ${scoreGrid(draft.awarenessAfter, 'after-score', dict)}
    <div class="pair">
      <button type="button" class="btn ghost" data-action="after-skip">${esc(dict.skip)}</button>
      <button type="button" class="btn primary" data-action="after-save">${esc(dict.pause.saveScore)}</button>
    </div>`
}

function choiceLabel(
  choice: string,
  dict: ViewModel['dict'],
  minutes: number,
  over: boolean,
): string {
  if (choice === 'open') return over ? dict.pause.openPast : dict.pause.open
  if (choice === 'postpone') return dict.pause.postpone(minutes)
  if (choice === 'close') return dict.pause.close
  if (choice === 'post') return dict.pause.post
  if (choice === 'draft') return dict.pause.draft
  return dict.pause.dontPost
}
