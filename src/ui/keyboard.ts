import { canChoose, confirmSeeking, goBack, setAfterScore, setScore, setSeeking, setSeekingNote, type PauseDraft } from '../domain/pause'
import { isAwarenessScore, POST_MOTIVES, SEEKINGS, type Choice, type Impulse } from '../domain/types'
import { vibrateChoice, vibrateTick } from '../platform/haptics'
import type { Route } from './route'
import type { ViewModel } from './model'

export interface KeyboardContext {
  route: Route
  pause: PauseDraft | null
  confirm: ViewModel['confirm']
  haptics: boolean
  readField: (id: string) => string
  setPause: (pause: PauseDraft | null) => void
  setConfirm: (confirm: ViewModel['confirm']) => void
  saveDraft: (draft: PauseDraft) => void
  go: (hash: string) => void
  draw: () => void
  applyChoice: (choice: Choice) => void
}

export function handleKeyboardEvent(event: KeyboardEvent, ctx: KeyboardContext): void {
  const { route, pause, confirm, haptics, readField, setPause, setConfirm, saveDraft, go, draw, applyChoice } = ctx

  if (event.key === 'Escape') {
    if (confirm) {
      setConfirm(null)
      draw()
      return
    }
    if (route.name === 'pause') {
      if (!pause) {
        go('#/today')
        return
      }
      const previous = goBack(pause)
      if (previous.step !== pause.step) {
        setPause(previous)
        saveDraft(previous)
        draw()
      } else {
        go('#/today')
      }
      return
    }
  }

  const target = event.target
  const active = typeof document !== 'undefined' ? document.activeElement : null
  const typing =
    (typeof HTMLInputElement !== 'undefined' && (target instanceof HTMLInputElement || active instanceof HTMLInputElement)) ||
    (typeof HTMLTextAreaElement !== 'undefined' && (target instanceof HTMLTextAreaElement || active instanceof HTMLTextAreaElement))

  if (typing) {
    if (
      event.key === 'Enter' &&
      pause &&
      pause.step === 'seeking' &&
      typeof HTMLInputElement !== 'undefined' &&
      target instanceof HTMLInputElement &&
      target.id === 'seeking-note'
    ) {
      event.preventDefault()
      let updated = setSeekingNote(pause, readField('seeking-note').trim())
      updated = confirmSeeking(updated)
      if (haptics) vibrateChoice()
      setPause(updated)
      saveDraft(updated)
      draw()
    }
    return
  }

  if (!pause) return
  if (event.altKey || event.ctrlKey || event.metaKey) return

  if (pause.step === 'seeking') {
    const isNext = event.key === 'ArrowRight' || event.key === 'ArrowDown'
    const isPrev = event.key === 'ArrowLeft' || event.key === 'ArrowUp'
    if (isNext || isPrev) {
      event.preventDefault()
      const options: readonly Impulse[] = pause.intent === 'post' ? POST_MOTIVES : SEEKINGS
      const currentIndex = pause.seeking ? options.indexOf(pause.seeking) : -1
      let nextIndex: number
      if (isNext) {
        nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % options.length
      } else {
        nextIndex = currentIndex === -1 ? options.length - 1 : (currentIndex - 1 + options.length) % options.length
      }
      const nextSeeking = options[nextIndex]
      if (nextSeeking) {
        if (haptics) vibrateTick()
        const updated = { ...pause, seeking: nextSeeking }
        setPause(updated)
        saveDraft(updated)
        draw()
        return
      }
    }
    if (event.key === 'Enter' && pause.seeking) {
      event.preventDefault()
      let updated: PauseDraft
      if (pause.seeking === 'other') {
        updated = setSeekingNote(pause, readField('seeking-note').trim())
        updated = confirmSeeking(updated)
      } else {
        updated = setSeeking(pause, pause.seeking)
      }
      if (haptics) vibrateChoice()
      setPause(updated)
      saveDraft(updated)
      draw()
      return
    }
  }

  if (pause.step === 'choose' && canChoose(pause, Date.now())) {
    const key = event.key.toLowerCase()
    let choice: Choice | undefined
    if (pause.intent === 'browse') {
      if (key === 'o') choice = 'open'
      else if (key === 'p') choice = 'postpone'
      else if (key === 'c') choice = 'close'
    } else if (pause.intent === 'post') {
      if (key === 'p') choice = 'post'
      else if (key === 'd') choice = 'draft'
      else if (key === 'x') choice = 'dont-post'
    }
    if (choice) {
      event.preventDefault()
      applyChoice(choice)
      return
    }
  }

  const number = event.key === '0' ? 10 : Number(event.key)
  if (!isAwarenessScore(number)) return
  let scored: PauseDraft
  if (pause.step === 'score') scored = setScore(pause, number)
  else if (pause.step === 'after') scored = setAfterScore(pause, number)
  else return
  setPause(scored)
  saveDraft(scored)
  draw()
}
