import { cycleOf } from '../../domain/cycles'
import { breathProgress, canChoose, choicesFor, goBack } from '../../domain/pause'
import { dayNumber, isOverLimit, limitActive, phaseFor, sessionsStartedOn } from '../../domain/protocol'
import { formatClock, localDate } from '../../domain/time'
import { sessionEndsAt } from '../../domain/clock'
import { activeSession } from '../../store/mutate'
import { pickHint } from '../../domain/hints'
import { SEEKINGS, POST_MOTIVES, FEELING_PRESETS } from '../../domain/types'
import { esc, impulseName, ring, scoreGrid, triggerName } from '../html'
import type { ViewModel } from '../model'
import { conflictScreen } from './unfinished'

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

  if (view.conflict) return conflictScreen(view, route.triggerId, view.conflict)

  // A pause already under way keeps its trigger even if another tab switched it off meanwhile.
  const started = view.pause?.triggerId === route.triggerId ? db.triggers.find((item) => item.id === route.triggerId) : undefined
  const trigger = enabled.find((item) => item.id === route.triggerId) ?? started
  if (!trigger) return missingTrigger(view, route.triggerId, route.intent)
  if (route.check) return checkScreen(view, trigger.id, route.intent)
  if (!view.pause) return missingTrigger(view, route.triggerId, route.intent)

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

  return `<section class="ritual is-${draft.step}">
    <div class="ritual-top">
      ${back ? `<button type="button" class="text-btn" data-action="back">${esc(dict.back)}</button>` : '<span></span>'}
      <button type="button" class="text-btn" data-action="pause-cancel">${esc(dict.cancel)}</button>
    </div>
    <p class="kicker">${esc(name)}</p>
    ${sessionNote(view)}
    ${view.draftStored === false ? `<p class="muted" role="status">${esc(dict.unfinished.notStored)}</p>` : ''}
    ${ring(progress)}
    ${stepBody(view, { name, capped, used, over, ready, phase })}
  </section>`
}

function finishField(view: ViewModel): string {
  const draft = view.pause
  if (!draft || draft.intent !== 'browse') return ''
  const cycle = draft.seeking ? cycleOf(draft.seeking) : null
  const placeholder = cycle ? view.dict.plan.placeholders[cycle] : view.dict.pause.finishPlaceholder
  const value = view.fields.finish ?? draft.finish
  return `<label class="field"><span>${esc(view.dict.pause.finishLabel)}</span>
      <input id="finish" name="finish" maxlength="80" placeholder="${esc(placeholder)}" value="${esc(value)}" />
    </label>
    <p class="muted">${esc(view.dict.pause.finishHint)}</p>`
}

function feelingBlock(view: ViewModel, which: 'before' | 'after'): string {
  const draft = view.pause
  if (!draft) return ''
  const dict = view.dict
  const fieldId = `feeling-${which}`
  const action = `feeling-${which}`
  const current = which === 'before' ? (view.fields[fieldId] ?? draft.feelingBefore) : (view.fields[fieldId] ?? draft.feelingAfter)

  return `<div class="feeling-block" data-feeling-step="${which}">
    <p class="field-label">${esc(dict.pause.feelingLabel)}</p>
    <div class="chips" role="group" aria-label="${esc(dict.pause.feelingLabel)}">
      ${FEELING_PRESETS.map((preset) => {
        const word = dict.feelings[preset]
        const on = current === word || current === preset
        return `<button type="button" class="chip${on ? ' is-on' : ''}" data-action="${action}" data-value="${esc(word)}" aria-pressed="${on}">${esc(word)}</button>`
      }).join('')}
    </div>
    <label class="field feeling-custom-field">
      <span>${esc(dict.pause.feelingCustomLabel)}</span>
      <input id="${fieldId}" name="${fieldId}" maxlength="40" placeholder="${esc(dict.pause.feelingPlaceholder)}" value="${esc(current ?? '')}" />
    </label>
  </div>`
}

function replacementLine(db: ViewModel['db'], impulse: string, dict: ViewModel['dict']): string | null {
  const cycle = cycleOf(impulse)
  if (!cycle) return null
  const custom = db.settings.replacements[cycle]?.trim()
  return custom || dict.plan.replacementsText[cycle]
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
      ${scoreGrid(draft.awarenessBefore, 'score', dict)}
      ${feelingBlock(view, 'before')}`
  }
  if (draft.step === 'seeking') {
    const post = draft.intent === 'post'
    const options = post ? POST_MOTIVES : SEEKINGS
    const note = draft.seeking === 'other'
    return `<h1 id="step-title">${esc(post ? dict.pause.whyPost : dict.pause.seeking)}</h1>
      <div class="chips" role="group" aria-label="${esc(post ? dict.pause.whyPost : dict.pause.seeking)}">
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
      ${finishField(view)}
      <p class="muted" data-breath-note role="timer" aria-live="polite" ${ctx.ready ? 'hidden' : ''}>${esc(dict.pause.breath)}</p>
      <div class="choice-list" role="group" aria-label="${esc(dict.pause.choose)}">
        ${choices
          .map((choice) => {
            const label = choiceLabel(choice, dict, db.settings.postponeMinutes, ctx.over)
            return `<button type="button" class="choice" data-action="choice" data-value="${choice}" data-needs-breath ${ctx.ready ? '' : 'disabled'}>${esc(label)}</button>`
          })
          .join('')}
      </div>`
  }
  const replacement =
    draft.seeking && draft.choice && draft.choice !== 'open' && draft.choice !== 'post'
      ? replacementLine(db, draft.seeking, dict)
      : null
  const finish = draft.finish.trim()
  return `<h1 id="step-title">${esc(dict.pause.after)}</h1>
    <p class="lede">${esc(dict.pause.afterBody)}</p>
    ${
      draft.choice === 'open'
        ? `<p class="note">${esc(finish ? dict.pause.finishSet(finish) : dict.pause.noFinish)}</p>`
        : replacement
          ? `<p class="note">${esc(replacement)}</p>`
          : ''
    }
    ${scoreGrid(draft.awarenessAfter, 'after-score', dict)}
    ${feelingBlock(view, 'after')}
    <div class="pair" role="group" aria-label="${esc(dict.pause.after)}">
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

function missingTrigger(view: ViewModel, id: string, intent: 'browse' | 'post'): string {
  const { db, dict } = view
  const copy = dict.quick
  const known = db.triggers.find((item) => item.id === id)
  const picker = intent === 'post' ? '#/post' : '#/pause'
  const others = db.triggers.some((item) => item.enabled && item.id !== id)
  return `<section class="stack trigger-state" data-state="${known ? 'disabled' : 'unknown'}">
    <h1 id="step-title">${esc(known ? copy.disabledTitle(triggerName(db, id, dict)) : copy.unknownTitle)}</h1>
    <p class="lede">${esc(known ? copy.disabledBody : copy.unknownBody(id))}</p>
    ${known ? `<button type="button" class="btn primary block" data-action="enable-and-pause" data-id="${esc(id)}">${esc(copy.enableAndPause)}</button>` : ''}
    ${others ? `<a class="btn${known ? '' : ' primary'} block" href="${picker}">${esc(copy.otherTrigger)}</a>` : ''}
    <a class="text-btn center" href="#/quick">${esc(copy.setupLink)}</a>
    <a class="text-btn center" href="#/today">${esc(dict.nav.today)}</a>
  </section>`
}

function checkScreen(view: ViewModel, id: string, intent: 'browse' | 'post'): string {
  const { db, dict } = view
  const copy = dict.quick
  const name = triggerName(db, id, dict)
  const path = `#/${intent === 'post' ? 'post' : 'pause'}/${encodeURIComponent(id)}`
  return `<section class="stack check-launch" data-state="check">
    <p class="kicker">${esc(name)}</p>
    <h1 id="step-title">${esc(copy.checkTitle)}</h1>
    <p class="lede" role="status">${esc(copy.checkBody(name))}</p>
    <a class="btn primary block" href="${esc(path)}">${esc(copy.checkStart)}</a>
    <a class="btn ghost block" href="#/quick?trigger=${esc(encodeURIComponent(id))}">${esc(copy.checkBack)}</a>
  </section>`
}

/** Re-opening a link while a session runs: say so, and offer the way back, before anything else. */
function sessionNote(view: ViewModel): string {
  const draft = view.pause
  if (!draft || draft.intent !== 'browse' || draft.step === 'after') return ''
  const running = activeSession(view.db)
  if (!running) return ''
  const left = Math.max(0, sessionEndsAt(running) - view.now)
  return `<p class="note session-running" data-note="session-running">${esc(view.dict.quick.sessionRunning(triggerName(view.db, running.triggerId, view.dict), formatClock(left)))}
    <a class="text-link" href="#/session/${esc(running.id)}">${esc(view.dict.quick.sessionBack)}</a></p>`
}
