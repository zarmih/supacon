import type { PauseDraft } from '../../domain/pause'
import { esc, triggerName } from '../html'
import type { ViewModel } from '../model'

function clock(at: number): string {
  const date = new Date(at)
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/** Today's card for a stored unfinished pause: say what it is, then continue or discard. */
export function recoveryCard(view: ViewModel): string {
  const draft = view.recovery
  if (!draft) return ''
  const { dict, db } = view
  const name = triggerName(db, draft.triggerId, dict)
  return `<section class="card recovery-card" data-card="recovery" role="region" aria-labelledby="recovery-title">
    <h2 id="recovery-title">${esc(dict.unfinished.title)}</h2>
    <p>${esc(dict.unfinished.body(name, clock(draft.startedAt), dict.unfinished.steps[draft.step]))}</p>
    <div class="pair">
      <button type="button" class="btn primary" data-action="draft-resume">${esc(dict.unfinished.resume)}</button>
      <button type="button" class="btn ghost" data-action="draft-discard">${esc(dict.unfinished.discard)}</button>
    </div>
  </section>`
}

/** Shown instead of a new pause while another unfinished one with answers is stored. */
export function conflictScreen(view: ViewModel, wanted: string, open: PauseDraft): string {
  const { dict, db } = view
  const openName = triggerName(db, open.triggerId, dict)
  const wantedName = triggerName(db, wanted, dict)
  return `<section class="stack">
    <h1 id="step-title">${esc(dict.unfinished.conflictTitle(openName))}</h1>
    <p class="lede">${esc(dict.unfinished.body(openName, clock(open.startedAt), dict.unfinished.steps[open.step]))}</p>
    <p class="muted">${esc(dict.unfinished.conflictBody)}</p>
    <button type="button" class="btn primary block" data-action="draft-resume">${esc(dict.unfinished.conflictResume(openName))}</button>
    <button type="button" class="btn ghost block" data-action="draft-replace">${esc(dict.unfinished.conflictReplace(wantedName))}</button>
  </section>`
}
