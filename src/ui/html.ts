import type { Database } from '../domain/types'
import type { Dict } from '../i18n/en'
import { bandOf } from '../domain/protocol'

export function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function triggerName(db: Database, id: string, dict: Dict): string {
  const trigger = db.triggers.find((item) => item.id === id)
  if (!trigger) return id
  if (trigger.preset) {
    const presets = dict.triggers as Record<string, string>
    const named = presets[trigger.id]
    if (named) return named
  }
  return trigger.label
}

export function impulseName(impulse: string, dict: Dict): string {
  const seekings = dict.seekings as Record<string, string>
  const motives = dict.motives as Record<string, string>
  return seekings[impulse] ?? motives[impulse] ?? impulse
}

export function formatAvg(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '—'
  const rounded = Math.round(value * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export function pct(rate: number): number {
  return Math.round(rate * 100)
}

const RING = 2 * Math.PI * 36

export function ring(progress: number): string {
  const p = Math.min(1, Math.max(0, progress))
  const offset = RING * (1 - p)
  return `<svg class="ring" viewBox="0 0 80 80" aria-hidden="true">
    <circle class="ring-track" cx="40" cy="40" r="36"></circle>
    <circle class="ring-value" cx="40" cy="40" r="36" data-ring stroke-dasharray="${RING.toFixed(3)}" stroke-dashoffset="${offset.toFixed(3)}"></circle>
  </svg>`
}

export function scoreGrid(selected: number | undefined, action: string, dict: Dict): string {
  const buttons: string[] = []
  for (let score = 1; score <= 10; score += 1) {
    const on = selected === score
    buttons.push(
      `<button type="button" class="score${on ? ' is-on' : ''}" data-action="${action}" data-value="${score}" aria-pressed="${on}" aria-label="${esc(dict.a11y.score(score))}">${score}</button>`,
    )
  }
  const band = selected ? dict.bands[bandOf(selected)] : ''
  const hint = selected ? dict.bandHint[bandOf(selected)] : dict.scaleLegend
  return `<div class="score-grid" role="group" aria-label="${esc(dict.pause.scoreLabel)}">${buttons.join('')}</div>
    <p class="band-name">${esc(band)}</p>
    <p class="muted band-hint">${esc(hint)}</p>`
}

export function field(id: string, label: string, value: string, placeholder: string, multiline = false): string {
  const control = multiline
    ? `<textarea id="${id}" name="${id}" rows="3" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input id="${id}" name="${id}" type="text" maxlength="180" placeholder="${esc(placeholder)}" value="${esc(value)}" />`
  return `<label class="field"><span>${esc(label)}</span>${control}</label>`
}
