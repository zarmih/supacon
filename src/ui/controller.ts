import { pendingPostpones, focusEndsAt, sessionEndsAt } from '../domain/clock'
import { createFocusKeeper, trapTab } from './focus'
import { windowDue } from '../domain/cycles'
import { exampleDatabase } from '../domain/example'
import { createId } from '../domain/ids'
import {
  advanceFromArrive,
  breathDone,
  breathProgress,
  canChoose,
  choose,
  confirmSeeking,
  createDraft,
  goBack,
  isBrowsePause,
  isRecoverable,
  setAfterScore,
  setScore,
  setFinish,
  setSeeking,
  setSeekingNote,
  type PauseDraft,
} from '../domain/pause'
import { CYCLES, POST_MOTIVES, SEEKINGS } from '../domain/types'
import type { Choice, Cycle, EveningReview, Impulse, PracticeMode, Seeking, Settings } from '../domain/types'
import { isAwarenessScore, isSeeking } from '../domain/types'
import { formatClock, localDate } from '../domain/time'
import { dictionary, resolveLang } from '../i18n'
import { vibrateBreathDone, vibrateChoice, vibrateTick } from '../platform/haptics'
import { cancelPendingNotifications, notifyLater } from '../platform/notify'
import { isOffline, subscribeNetwork } from '../platform/offline'
import { playCompletionBell } from '../platform/audio'
import { emptyDatabase } from '../store/defaults'
import {
  addTrigger,
  commitPause,
  completeOnboarding,
  endFocus,
  endSession,
  extendSession,
  logMiss,
  restartProtocol,
  saveContact,
  saveEvening,
  saveMorning,
  setExperiment,
  setPracticeMode,
  startFocus,
  toggleTrigger,
  updateSettings,
  activeFocus,
  activeSession,
} from '../store/mutate'
import {
  hasValidBackup,
  inspectImport,
  loadDb,
  loadOrRecover,
  normalizeDatabase,
  restoreBackup,
  saveBackup,
  STORAGE_KEY,
  type KeyValue,
} from '../store/storage'
import { createSync, same } from '../store/merge'
import { clearDraft, DRAFT_KEY, migrateLegacyDraft, readDraft, writeDraft } from '../store/draft'
import { emptyForm, type FormState, type ViewModel } from './model'
import { render } from './render'
import { parseHash, routeKey, type Route } from './route'
import { FOCUS_MINUTES, PAUSE_SECONDS, POSTPONE_MINUTES, SESSION_CAPS, SESSION_MINUTES } from './screens/more'
import { copyDiaryToClipboard, exportCsv, exportDiary, exportJson } from './export'
import { handleKeyboardEvent } from './keyboard'
import { checkBreathHaptics, checkFocusBell, shouldRemindEvening } from './timers'

const RING = 2 * Math.PI * 36

interface InstallPrompt {
  prompt: () => Promise<void>
}

interface App {
  db: ReturnType<typeof emptyDatabase>
  route: Route
  now: number
  pause: PauseDraft | null
  toast: string | null
  flash: string | null
  confirm: ViewModel['confirm']
  installReady: boolean
  presets: string[]
  customs: { id: string; label: string }[]
  form: FormState
  fields: Record<string, string>
  installPrompt: InstallPrompt | null
  offline: boolean
  eveningRemindedDate: string | null
  storageError: boolean
  /** The stored unfinished pause that blocks starting another one (see `sync`). */
  conflict: PauseDraft | null
  /** False when storage refused the last draft write. */
  draftStored: boolean
  /** A waiting service worker; `apply` activates it and reloads. Null when there is none or it was put off. */
  update: { apply: () => void } | null
}

export interface AppHandle {
  /** Called by the service worker registration when a new version is waiting. */
  offerUpdate(apply: () => void): void
}

export type PersistResult = { ok: true } | { ok: false; error: unknown }

const lists = {
  maxSessionsPerDay: SESSION_CAPS,
  sessionMinutes: SESSION_MINUTES,
  postponeMinutes: POSTPONE_MINUTES,
  focusMinutes: FOCUS_MINUTES,
  pauseSeconds: PAUSE_SECONDS,
} as const

export function startApp(root: HTMLElement, kv: KeyValue): AppHandle {
  const initial = loadOrRecover(kv)
  const app: App = {
    db: initial.db ?? emptyDatabase(),
    route: { name: 'today' },
    now: Date.now(),
    pause: null,
    toast: null,
    flash: null,
    confirm: null,
    installReady: false,
    presets: [],
    customs: [],
    form: emptyForm(),
    fields: {},
    installPrompt: null,
    offline: isOffline(),
    eveningRemindedDate: null,
    storageError: false,
    conflict: null,
    draftStored: true,
    update: null,
  }
  migrateLegacyDraft(kv, sessionKeyValue())
  const tabs = createSync(kv, app.db)
  let flashHold = false
  let focusKey = ''
  let windowMark = ''
  let toastToken = 0
  let breathDoneVibratedId: string | null = null
  let focusBellPlayedId: string | null = null

  const dict = () => dictionary(resolveLang(app.db.settings.lang, navigator.language))
  if (initial.recovered) {
    // The primary record was unreadable; say that the backup came back rather than start silently.
    app.flash = dict().flash.restored
    flashHold = true
  }

  const persist = (): PersistResult => {
    try {
      app.db = tabs.write(app.db)
      settleDraft()
      const hadError = app.storageError
      app.storageError = false
      if (hadError) {
        toast(dict().errors.savedAfterRetry)
      }
      return { ok: true }
    } catch (error) {
      app.storageError = true
      return { ok: false, error }
    }
  }

  const view = (): ViewModel => ({
    db: app.db,
    route: app.route,
    now: app.now,
    pause: app.pause,
    toast: app.toast,
    flash: app.flash,
    confirm: app.confirm,
    installReady: app.installReady,
    hasBackup: hasValidBackup(kv),
    storageError: app.storageError,
    presets: app.presets,
    customs: app.customs,
    form: app.form,
    fields: app.fields,
    dict: dict(),
    offline: app.offline,
    recovery: recoveryCard(),
    conflict: app.conflict,
    draftStored: app.draftStored,
    updateReady: app.update !== null && safeToUpdate(),
  })

  /**
   * An update reloads the page. Offer it only when a reload cannot cost anything: no pause on
   * screen, no running session or focus screen, no field being typed in, and nothing unsaved.
   */
  const safeToUpdate = (): boolean => {
    if (app.storageError) return false
    if (app.pause) return false
    const busy: Route['name'][] = ['pause', 'session', 'focus', 'onboarding', 'morning', 'evening', 'miss', 'plan']
    if (busy.includes(app.route.name)) return false
    const active = typeof document === 'undefined' ? null : document.activeElement
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      if (!active.readOnly && active.type !== 'button') return false
    }
    return true
  }

  /** The stored unfinished pause, when this tab is not already showing it. */
  const recoveryCard = (): PauseDraft | null => {
    if (app.route.name === 'pause' || app.route.name === 'onboarding') return null
    const stored = readDraft(kv)
    if (!stored || !isRecoverable(stored.draft, Date.now())) return null
    if (app.db.events.some((event) => event.id === stored.draft.id)) return null
    if (!app.db.triggers.some((trigger) => trigger.id === stored.draft.triggerId)) return null
    return stored.draft
  }

  /** A stored draft whose pause is already in the record is finished business. */
  function settleDraft() {
    const stored = readDraft(kv, Number.NEGATIVE_INFINITY)
    if (stored && app.db.events.some((event) => event.id === stored.draft.id)) clearDraft(kv, stored.draft.id)
  }

  const shape = () => {
    const session = activeSession(app.db)
    const focus = activeFocus(app.db)
    const sessionUp = Boolean(session && sessionEndsAt(session) <= Date.now())
    const focusUp = Boolean(focus && focusEndsAt(focus) <= Date.now())
    const waits = pendingPostpones(app.db, Date.now())
      .map((item) => (item.waiting ? '1' : '0'))
      .join('')
    // A waiting update shows up once the moment becomes safe (a field loses focus, a pause ends).
    const update = app.update ? String(safeToUpdate()) : ''
    return `${app.route.name}|${sessionUp}|${focusUp}|${waits}|${update}`
  }

  let lastShape = ''
  const focusKeeper = createFocusKeeper(root)

  const draw = () => {
    app.now = Date.now()
    applyChrome(app.db.settings)
    focusKeeper.before()
    const current = view()
    root.innerHTML = render(current)
    lastShape = shape()
    const key = `${routeKey(app.route)}:${app.pause?.step ?? ''}`
    const screenChanged = key !== focusKey
    focusKey = key
    focusKeeper.after(screenChanged)
    // The field that had focus belonged to the previous screen; once it is gone the update may show.
    if (app.update && !current.updateReady && safeToUpdate()) draw()
  }

  const go = (hash: string) => {
    if (location.hash === hash) {
      sync()
      draw()
    } else {
      location.hash = hash
    }
  }

  const toast = (message: string) => {
    app.toast = message
    toastToken += 1
    const token = toastToken
    draw()
    window.setTimeout(() => {
      if (token === toastToken) {
        app.toast = null
        draw()
      }
    }, 3200)
  }

  const seedForm = (route: Route): FormState => {
    const today = localDate(new Date())
    if (route.name === 'evening') {
      const review = app.db.evenings.find((entry) => entry.date === today)
      return { unlogged: review?.unloggedMisses ?? 0, likes: review?.likesChanged, pendingEnd: false }
    }
    if (route.name === 'morning') {
      const morning = app.db.mornings.find((entry) => entry.date === today)
      return { unlogged: 0, pendingEnd: false, score: morning?.awareness }
    }
    return emptyForm()
  }

  const seedFields = (route: Route): Record<string, string> => {
    const today = localDate(new Date())
    if (route.name === 'morning') {
      return { desire: app.db.mornings.find((entry) => entry.date === today)?.firstDesire ?? '' }
    }
    if (route.name === 'evening') {
      const review = app.db.evenings.find((entry) => entry.date === today)
      return {
        lowest: review?.lowestMoment ?? '',
        note: review?.note ?? '',
        'likes-note': review?.likesNote ?? '',
        broke: review?.whereItBroke ?? '',
      }
    }
    return {}
  }

  const saveDraft = (draft: PauseDraft | null) => {
    if (!draft) return
    app.draftStored = writeDraft(kv, draft)
  }

  const routeFor = (draft: PauseDraft) => `#/${draft.intent === 'post' ? 'post' : 'pause'}/${encodeURIComponent(draft.triggerId)}`

  const sync = () => {
    if (!app.db.onboardingComplete) {
      app.route = { name: 'onboarding' }
      app.pause = null
      return
    }
    const next = parseHash(location.hash || '#/today')
    const changed = routeKey(app.route) !== routeKey(next)
    app.route = next
    if (changed) {
      if (!flashHold) app.flash = null
      flashHold = false
      app.form = seedForm(next)
      app.fields = seedFields(next)
      app.confirm = null
    }
    app.conflict = null
    if (next.name === 'pause' && !next.triggerId) {
      // One enabled trigger skips the picker, also for a bare #/pause or #/post link.
      const enabled = app.db.triggers.filter((trigger) => trigger.enabled)
      const only = enabled.length === 1 ? enabled[0] : undefined
      if (only) {
        const target = `#/${next.intent === 'post' ? 'post' : 'pause'}/${encodeURIComponent(only.id)}`
        history.replaceState(null, '', target)
        sync()
        return
      }
    }
    if (next.name === 'pause' && next.check) {
      // A test launch from quick entry: show that the link resolves, start nothing, record nothing.
      app.pause = null
      breathDoneVibratedId = null
      return
    }
    if (next.name === 'pause' && next.triggerId) {
      const enabled = app.db.triggers.some((trigger) => trigger.id === next.triggerId && trigger.enabled)
      const same = app.pause && app.pause.triggerId === next.triggerId && app.pause.intent === next.intent
      const stored = same ? null : readDraft(kv)
      const storedLive = stored && !app.db.events.some((event) => event.id === stored.draft.id) ? stored.draft : null
      const storedHere = storedLive && storedLive.triggerId === next.triggerId && storedLive.intent === next.intent ? storedLive : null
      // A stored pause with answers survives its trigger being switched off; an untouched one does not.
      const known = app.db.triggers.some((trigger) => trigger.id === next.triggerId) && (enabled || Boolean(storedHere && isRecoverable(storedHere, Date.now())))
      // Only a new pause needs an enabled trigger; one under way survives a switch-off from another tab.
      if (!same && !(storedHere && known) && !enabled) {
        app.pause = null
        breathDoneVibratedId = null
        return
      }
      // Another unfinished pause with real answers is not silently thrown away by a new link.
      if (!same && !storedHere && storedLive && isRecoverable(storedLive, Date.now()) && app.db.triggers.some((t) => t.id === storedLive.triggerId)) {
        app.pause = null
        app.conflict = storedLive
        breathDoneVibratedId = null
        return
      }
      if (!same) {
        const restored = storedHere && known ? storedHere : null
        app.pause =
          restored ??
          createDraft({
            id: createId(),
            intent: next.intent,
            triggerId: next.triggerId,
            now: Date.now(),
            minSeconds: app.db.settings.pauseSeconds,
            completedPauses: app.db.events.filter(isBrowsePause).length,
          })
        breathDoneVibratedId = restored && breathDone(restored, Date.now()) ? restored.id : null
        saveDraft(app.pause)
      }
    } else {
      // Leaving the pause keeps a draft that has answers in it (Today offers it back); an untouched one goes.
      if (app.pause && !isRecoverable(app.pause, Date.now())) clearDraft(kv, app.pause.id)
      app.pause = null
      breathDoneVibratedId = null
    }
  }

  const readField = (id: string): string => {
    const element = document.getElementById(id)
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      app.fields[id] = element.value
    }
    return app.fields[id] ?? ''
  }

  const finishPause = () => {
    if (!app.pause) return
    const choice = app.pause.choice
    const result = commitPause(app.db, app.pause, new Date())
    if (!result) return
    const pauseId = app.pause.id
    if (result.duplicate) {
      // Already in the record (another tab, or a recovered copy): nothing new to write.
      clearDraft(kv, pauseId)
      app.pause = null
      breathDoneVibratedId = null
      app.flash = dict().unfinished.savedElsewhere
      flashHold = true
      go('#/today')
      return
    }
    app.db = result.db
    const res = persist()
    app.pause = null
    breathDoneVibratedId = null
    // On a failed write the draft stays stored: a reload can still finish it, and the commit is idempotent.
    if (res.ok) clearDraft(kv, pauseId)
    // Another tab may have committed this same pause first; follow the session that survived the merge.
    const sessionId = result.sessionId
      ? (app.db.sessions.find((item) => item.id === result.sessionId) ?? app.db.sessions.find((item) => item.pauseId === pauseId))?.id
      : undefined
    if (sessionId) {
      app.flash = null
      flashHold = false
      go(`#/session/${sessionId}`)
      return
    }
    if (choice === 'postpone') {
      const until = app.db.postpones.at(-1)?.until
      if (until) notifyLater(dict().appName, dict().home.return, new Date(until).getTime(), () => app.db.settings.notifications)
    }
    app.flash = res.ok ? messageFor(choice) : null
    flashHold = res.ok
    go('#/today')
  }

  const messageFor = (choice: Choice | undefined): string | null => {
    const copy = dict().flash
    if (choice === 'close') return copy.closed
    if (choice === 'post') return copy.posted
    if (choice === 'draft') return copy.drafted
    if (choice === 'dont-post') return copy.notPosted
    return null
  }

  const applyChoice = (choice: Choice) => {
    if (!app.pause) return
    app.pause = setFinish(app.pause, readField('finish'))
    const next = choose(app.pause, choice, Date.now())
    if (!next) return
    if (app.db.settings.haptics) vibrateChoice()
    app.pause = next
    saveDraft(app.pause)
    draw()
  }

  const onClick = (event: Event) => {
    const target = event.target
    if (!(target instanceof Element)) return
    const element = target.closest<HTMLElement>('[data-action]')
    if (!element) return
    const action = element.dataset.action
    if (action === 'stop') {
      event.stopPropagation()
      return
    }
    if (element instanceof HTMLButtonElement && element.type !== 'submit') event.preventDefault()
    const copy = dict()

    if (action === 'confirm-cancel') {
      app.confirm = null
      draw()
      return
    }
    if (action === 'confirm') {
      const value = element.dataset.value
      if (value === 'example' && (app.db.demo || app.db.events.length === 0)) {
        loadExample()
        return
      }
      if (value === 'erase' || value === 'restart' || value === 'example') {
        app.confirm = value
        draw()
      }
      return
    }
    if (action === 'confirm-yes') {
      const kind = app.confirm
      app.confirm = null
      if (kind === 'erase') {
        app.db = emptyDatabase()
        app.presets = []
        app.customs = []
        persist()
        go('#/today')
      } else if (kind === 'restart') {
        app.db = restartProtocol(app.db, new Date())
        persist()
        go('#/today')
      } else if (kind === 'example') loadExample()
      return
    }
    if (action === 'preset') {
      const id = element.dataset.value
      if (!id) return
      app.presets = app.presets.includes(id) ? app.presets.filter((item) => item !== id) : [...app.presets, id]
      draw()
      return
    }
    if (action === 'remove-custom') {
      app.customs = app.customs.filter((item) => item.id !== element.dataset.value)
      draw()
      return
    }
    if (action === 'begin') {
      const path = element.dataset.path === 'free' ? 'free' : 'protocol'
      const triggers = [
        ...app.presets.map((id) => ({ id, label: copy.triggers[id as keyof typeof copy.triggers] ?? id, preset: true })),
        ...app.customs.map((item) => ({ ...item, preset: false })),
      ]
      if (triggers.length === 0) return
      app.db = completeOnboarding(app.db, { triggers, path, now: new Date() })
      persist()
      go('#/today')
      return
    }
    if (action === 'pause-cancel') {
      if (app.pause) clearDraft(kv, app.pause.id)
      app.pause = null
      breathDoneVibratedId = null
      go('#/today')
      return
    }
    if (action === 'update-apply') {
      const update = app.update
      if (!update || !safeToUpdate()) return
      // Write what is in memory first; an unsaved record never goes through a reload.
      const res = persist()
      if (!res.ok) {
        draw()
        return
      }
      app.update = null
      update.apply()
      return
    }
    if (action === 'update-later') {
      app.update = null
      draw()
      return
    }
    if (action === 'select-all') {
      if (element instanceof HTMLInputElement) element.select()
      return
    }
    if (action === 'enable-and-pause') {
      const id = element.dataset.id
      const trigger = app.db.triggers.find((item) => item.id === id)
      if (!id || !trigger) return
      if (!trigger.enabled) {
        app.db = toggleTrigger(app.db, id)
        persist()
      }
      sync()
      draw()
      return
    }
    if (action === 'draft-resume') {
      const stored = readDraft(kv)
      if (stored) go(routeFor(stored.draft))
      else draw()
      return
    }
    if (action === 'draft-discard') {
      const stored = readDraft(kv)
      if (stored) clearDraft(kv, stored.draft.id)
      toast(copy.unfinished.discarded)
      return
    }
    if (action === 'draft-replace') {
      const stored = readDraft(kv)
      if (stored) clearDraft(kv, stored.draft.id)
      app.conflict = null
      sync()
      draw()
      return
    }
    if (action === 'arrive' && app.pause) {
      app.pause = advanceFromArrive(app.pause)
      saveDraft(app.pause)
      draw()
      return
    }
    if (action === 'back' && app.pause) {
      app.pause = goBack(app.pause)
      saveDraft(app.pause)
      draw()
      return
    }
    if (action === 'score' && app.pause) {
      app.pause = setScore(app.pause, Number(element.dataset.value))
      saveDraft(app.pause)
      draw()
      return
    }
    if (action === 'seeking' && app.pause) {
      const value = element.dataset.value
      if (!value) return
      app.pause = setSeeking(app.pause, value as Seeking)
      saveDraft(app.pause)
      draw()
      return
    }
    if (action === 'seek-continue' && app.pause) {
      app.pause = setSeekingNote(app.pause, readField('seeking-note').trim())
      app.pause = confirmSeeking(app.pause)
      saveDraft(app.pause)
      draw()
      return
    }
    if (action === 'choice' && app.pause) {
      const value = element.dataset.value as Choice | undefined
      if (!value) return
      applyChoice(value)
      return
    }
    if (action === 'after-score' && app.pause) {
      app.pause = setAfterScore(app.pause, Number(element.dataset.value))
      saveDraft(app.pause)
      draw()
      return
    }
    if (action === 'after-skip' && app.pause) {
      app.pause = { ...app.pause, awarenessAfter: undefined }
      finishPause()
      return
    }
    if (action === 'after-save') {
      finishPause()
      return
    }
    if (action === 'form-score') {
      const score = Number(element.dataset.value)
      if (isAwarenessScore(score)) {
        app.form.score = app.form.score === score ? undefined : score
      }
      draw()
      return
    }
    if (action === 'morning-save') {
      const score = app.form.score
      if (!score) {
        toast(copy.errors.score)
        return
      }
      const next = saveMorning(app.db, { awareness: score, firstDesire: readField('desire'), now: new Date() })
      if (next === app.db) {
        toast(copy.errors.desire)
        return
      }
      app.db = next
      const res = persist()
      if (res.ok) {
        app.flash = copy.flash.morning
        flashHold = true
      }
      go('#/today')
      return
    }
    if (action === 'unlogged') {
      const dir = Number(element.dataset.dir)
      app.form.unlogged = Math.max(0, Math.min(20, app.form.unlogged + (dir < 0 ? -1 : 1)))
      draw()
      return
    }
    if (action === 'likes') {
      const value = element.dataset.value
      if (value === 'yes' || value === 'no' || value === 'unsure') app.form.likes = value
      draw()
      return
    }
    if (action === 'evening-save') {
      const today = localDate(new Date())
      app.db = saveEvening(app.db, {
        date: today,
        at: new Date().toISOString(),
        lowestMoment: readField('lowest'),
        note: readField('note'),
        unloggedMisses: app.form.unlogged,
        ...(app.form.likes ? { likesChanged: app.form.likes } : {}),
        likesNote: readField('likes-note'),
        whereItBroke: readField('broke'),
      })
      const res = persist()
      if (res.ok) {
        app.flash = copy.flash.evening
        flashHold = true
      }
      go('#/today')
      return
    }
    if (action === 'contact') {
      const today = localDate(new Date())
      const isYes = element.dataset.value === 'yes'
      const existing = app.db.dayMarks.find((item) => item.date === today)
      app.db = saveContact(app.db, {
        date: today,
        realContact: isYes,
        note: isYes ? (existing?.contactNote ?? '') : '',
      })
      persist()
      draw()
      return
    }
    if (action === 'save-contact-note') {
      const today = localDate(new Date())
      const note = readField('contact-note')
      app.db = saveContact(app.db, {
        date: today,
        realContact: true,
        note,
      })
      const res = persist()
      if (res.ok) toast(copy.home.contactNoteSaved)
      draw()
      return
    }
    if (action === 'focus-start') {
      focusBellPlayedId = null
      app.db = startFocus(app.db, new Date())
      persist()
      const running = activeFocus(app.db)
      if (running) notifyLater(copy.appName, copy.focus.doneTitle, focusEndsAt(running), () => app.db.settings.notifications)
      draw()
      return
    }
    if (action === 'focus-end') {
      const running = activeFocus(app.db)
      if (!running) return
      focusBellPlayedId = null
      const completed = element.dataset.value === 'done'
      app.db = endFocus(app.db, running.id, completed, new Date())
      const res = persist()
      if (res.ok) {
        app.flash = completed ? copy.flash.focusDone : copy.flash.focusEarly
        flashHold = true
      }
      go('#/today')
      return
    }
    if (action === 'go-focus' || action === 'focus') {
      event.preventDefault()
      go('#/focus')
      return
    }
    if (action === 'ask-end') {
      app.form.pendingEnd = true
      draw()
      return
    }
    const routeNow = app.route
    if (action === 'session-end') {
      const sessionId = element.dataset.id || (routeNow.name === 'session' ? routeNow.id : activeSession(app.db)?.id)
      if (sessionId) {
        const found = element.dataset.found
        const answer = found === 'yes' || found === 'partly' || found === 'no' ? found : null
        const session = app.db.sessions.find((item) => item.id === sessionId)
        const reason = session && sessionEndsAt(session) <= Date.now() ? 'timer' : 'manual'
        app.db = endSession(app.db, sessionId, answer, new Date(), reason)
        const res = persist()
        if (res.ok) {
          app.flash = copy.flash.session
          flashHold = true
        }
        go('#/today')
        return
      }
    }
    if (action === 'session-extend' && routeNow.name === 'session') {
      const minutes = app.db.settings.sessionMinutes
      app.db = extendSession(app.db, routeNow.id)
      const res = persist()
      app.form.pendingEnd = false
      const session = activeSession(app.db)
      if (session) notifyLater(copy.appName, copy.session.up, sessionEndsAt(session), () => app.db.settings.notifications)
      if (res.ok) toast(copy.session.extendedToast(minutes))
      return
    }
    if (action === 'miss-trigger') {
      app.fields.trigger = element.dataset.value ?? ''
      draw()
      return
    }
    if (action === 'journal-filter' || action === 'journal-trigger') {
      const val = element.dataset.value ?? 'all'
      app.fields['journal-trigger'] = val
      app.fields['journal-filter'] = val
      draw()
      return
    }
    if (action === 'miss-seeking') {
      const val = element.dataset.value ?? ''
      app.fields.seeking = app.fields.seeking === val ? '' : val
      draw()
      return
    }
    if (action === 'miss-save') {
      const triggerId = app.fields.trigger ?? ''
      if (!triggerId) {
        toast(copy.errors.trigger)
        return
      }
      const seeking = app.fields.seeking
      const next = logMiss(app.db, {
        triggerId,
        ...(app.form.score ? { awareness: app.form.score } : {}),
        ...(seeking && isSeeking(seeking) ? { seeking } : {}),
        note: readField('miss-note'),
        now: new Date(),
      })
      if (!next) {
        toast(copy.errors.trigger)
        return
      }
      app.db = next
      const res = persist()
      if (res.ok) {
        app.fields.trigger = ''
        app.fields.seeking = ''
        app.fields['miss-note'] = ''
        app.form.score = undefined
        app.flash = copy.flash.miss
        flashHold = true
        go('#/today')
      } else {
        draw()
      }
      return
    }
    if (action === 'experiment') {
      const id = element.dataset.id
      const week = Number(element.dataset.week)
      const status = element.dataset.status
      if (!id || !week || (status !== 'done' && status !== 'dismissed' && status !== 'open')) return
      app.db = setExperiment(app.db, { id, weekIndex: week, status })
      persist()
      draw()
      return
    }
    if (action === 'toggle-trigger') {
      const id = element.dataset.id
      if (!id) return
      const next = toggleTrigger(app.db, id)
      if (next === app.db) {
        toast(copy.triggerScreen.last)
        return
      }
      app.db = next
      persist()
      draw()
      return
    }
    if (action === 'copy-bridge') {
      const ending = element.dataset.ending ?? element.dataset.url ?? ''
      const base = window.location.href.split('#')[0]
      const fullUrl = ending.startsWith('http://') || ending.startsWith('https://') ? ending : `${base}${ending}`
      const onSuccess = () => toast(copy.quick.copied)
      const onFail = () => {
        try {
          const input = document.createElement('textarea')
          input.value = fullUrl
          input.style.position = 'fixed'
          input.style.opacity = '0'
          document.body.appendChild(input)
          input.focus()
          input.select()
          const ok = document.execCommand('copy')
          document.body.removeChild(input)
          if (ok) onSuccess()
          else toast(copy.quick.copyFailed)
        } catch {
          toast(copy.quick.copyFailed)
        }
      }

      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(fullUrl).then(onSuccess, onFail)
      } else {
        onFail()
      }
      return
    }
    if (action === 'lang') {
      const value = element.dataset.value
      if (value === 'auto' || value === 'en' || value === 'ru') {
        app.db = updateSettings(app.db, { lang: value })
        persist()
        draw()
      }
      return
    }
    if (action === 'theme') {
      const value = element.dataset.value
      if (value === 'ink' || value === 'paper' || value === 'system') {
        app.db = updateSettings(app.db, { theme: value })
        persist()
        draw()
      }
      return
    }
    if (action === 'step') {
      const key = element.dataset.key
      if (key !== 'maxSessionsPerDay' && key !== 'sessionMinutes' && key !== 'postponeMinutes' && key !== 'focusMinutes' && key !== 'pauseSeconds') {
        return
      }
      const dir = Number(element.dataset.dir)
      const list = lists[key]
      const current = app.db.settings[key]
      let index = list.indexOf(current as (typeof list)[number])
      if (index < 0) index = 0
      index = Math.min(list.length - 1, Math.max(0, index + dir))
      const next = list[index]
      if (next === undefined) return
      app.db = updateSettings(app.db, { [key]: next } as Partial<Settings>)
      persist()
      draw()
      return
    }
    if (action === 'window-radius') {
      const minutes = Number(element.dataset.value)
      if (minutes !== 30 && minutes !== 45 && minutes !== 60) return
      app.db = updateSettings(app.db, { windowMinutes: minutes })
      persist()
      draw()
      return
    }
    if (action === 'notify') {
      void toggleNotifications()
      return
    }
    if (action === 'toggle-haptics') {
      const next = !app.db.settings.haptics
      app.db = updateSettings(app.db, { haptics: next })
      if (next) vibrateTick()
      persist()
      draw()
      return
    }
    if (action === 'toggle-sound') {
      const next = !app.db.settings.sound
      app.db = updateSettings(app.db, { sound: next })
      if (next) playCompletionBell()
      persist()
      draw()
      return
    }
    if (action === 'export') {
      exportJson(app.db)
      return
    }
    if (action === 'export-diary') {
      const lang = resolveLang(app.db.settings.lang, navigator.language)
      exportDiary(app.db, lang)
      return
    }
    if (action === 'copy-diary') {
      const lang = resolveLang(app.db.settings.lang, navigator.language)
      void copyDiaryToClipboard(
        app.db,
        lang,
        () => toast(dict().settingsScreen.diaryCopied),
        () => exportDiary(app.db, lang),
      )
      return
    }
    if (action === 'export-csv') {
      exportCsv(app.db)
      return
    }
    if (action === 'import') {
      document.getElementById('import-file')?.click()
      return
    }
    if (action === 'restore-backup') {
      const ok = restoreBackup(kv)
      if (ok) {
        const restored = loadDb(kv)
        if (restored) {
          app.db = restored
          tabs.reset(restored)
          app.flash = dict().flash.restored
          flashHold = true
          go('#/today')
        }
      } else {
        toast(dict().errors.import)
      }
      return
    }
    if (action === 'install') {
      void app.installPrompt?.prompt()
      return
    }
    if (action === 'retry-save') {
      persist()
      draw()
      return
    }
    if (action === 'mode') {
      const value = element.dataset.value
      if (value === 'maintenance' || value === 'deepening' || value === 'free') {
        app.db = setPracticeMode(app.db, value as PracticeMode)
        persist()
        go('#/today')
      }
    }
  }

  const loadExample = () => {
    app.db = exampleDatabase(localDate(new Date()), new Date())
    const res = persist()
    if (res.ok) {
      app.flash = dict().flash.example
      flashHold = true
    }
    go('#/insights')
  }

  const toggleNotifications = async () => {
    if (app.db.settings.notifications) {
      cancelPendingNotifications()
      app.db = updateSettings(app.db, { notifications: false })
      persist()
      draw()
      return
    }
    if (typeof Notification === 'undefined') return
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return
    app.db = updateSettings(app.db, { notifications: true })
    persist()
    draw()
  }

  const savePlanFromForm = () => {
    const windows = [1, 2, 3].map((index) => readField(`window-${index}`).trim()).filter(Boolean)
    const nightStart = readField('night-start').trim()
    const nightEnd = readField('night-end').trim()
    const halfNight = (nightStart === '') !== (nightEnd === '')
    const replacements = {} as Record<Cycle, string>
    for (const cycle of CYCLES) replacements[cycle] = readField(`repl-${cycle}`).trim()
    app.db = updateSettings(app.db, {
      windows,
      nightStart: nightStart || null,
      nightEnd: nightEnd || null,
      replacements,
    })
    const res = persist()
    if (res.ok) {
      app.fields = {}
      toast(halfNight ? dict().plan.nightHalf : dict().plan.saved)
    }
    draw()
  }

  const onSubmit = (event: Event) => {
    const form = event.target
    if (!(form instanceof HTMLFormElement)) return
    event.preventDefault()
    const action = form.dataset.action
    if (action === 'add-custom') {
      const label = readField('custom-name').trim()
      if (!label) {
        toast(dict().errors.empty)
        return
      }
      app.customs = [...app.customs, { id: createId(), label: label.slice(0, 40) }]
      app.fields['custom-name'] = ''
      draw()
    }
    if (action === 'plan-save') {
      savePlanFromForm()
      return
    }
    if (action === 'add-trigger') {
      const label = readField('trigger-name').trim()
      if (!label) {
        toast(dict().errors.empty)
        return
      }
      app.db = addTrigger(app.db, label, new Date())
      const res = persist()
      if (res.ok) app.fields['trigger-name'] = ''
      draw()
    }
  }

  const onInput = (event: Event) => {
    const target = event.target
    if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return
    if (target.id) app.fields[target.id] = target.value
    if (target.id === 'seeking-note' && app.pause) {
      app.pause = setSeekingNote(app.pause, target.value)
      saveDraft(app.pause)
    }
    if (target.id === 'finish' && app.pause) {
      app.pause = setFinish(app.pause, target.value)
      saveDraft(app.pause)
    }
    if (target.id === 'contact-note' || (target instanceof HTMLTextAreaElement && target.name === 'contactNote')) {
      const today = localDate(new Date())
      const mark = app.db.dayMarks.find((m) => m.date === today)
      if (mark && mark.realContact) {
        app.db = saveContact(app.db, {
          date: today,
          realContact: true,
          note: target.value,
        })
        persist()
      }
    }
  }

  const onChange = (event: Event) => {
    const target = event.target
    if (target instanceof HTMLInputElement && target.id === 'evening-time') {
      app.db = updateSettings(app.db, { eveningReminder: target.value || null })
      persist()
    }
    if (target instanceof HTMLInputElement && target.id === 'import-file' && target.files?.[0]) {
      void importFile(target.files[0])
      target.value = ''
    }
  }

  const importFile = async (file: File) => {
    try {
      const text = await file.text()
      const inspection = inspectImport(text)
      if (!inspection.ok) {
        toast(dict().errors.import)
        return
      }
      const parsed = normalizeDatabase(JSON.parse(text))
      if (!parsed) {
        toast(dict().errors.import)
        return
      }
      saveBackup(kv, app.db)
      app.db = parsed
      const res = persist()
      if (res.ok) {
        app.flash = dict().flash.imported
        flashHold = true
      }
      go('#/today')
    } catch {
      toast(dict().errors.import)
    }
  }

  const onKey = (event: KeyboardEvent) => {
    if (trapTab(event, root)) return
    handleKeyboardEvent(event, {
      route: app.route,
      pause: app.pause,
      confirm: app.confirm,
      haptics: app.db.settings.haptics,
      readField,
      setPause: (next) => {
        app.pause = next
      },
      setConfirm: (next) => {
        app.confirm = next
      },
      saveDraft,
      go,
      draw,
      applyChoice,
    })
  }

  const checkBreath = () => {
    breathDoneVibratedId = checkBreathHaptics(
      app.pause,
      Date.now(),
      breathDoneVibratedId,
      app.db.settings.haptics,
      vibrateBreathDone,
    )
  }

  const checkFocus = () => {
    if (typeof document !== 'undefined' && document.hidden) return
    const focus = activeFocus(app.db)
    focusBellPlayedId = checkFocusBell(
      focus,
      Date.now(),
      focusBellPlayedId,
      app.db.settings.sound,
      playCompletionBell,
    )
  }

  const patch = () => {
    for (const node of document.querySelectorAll<HTMLElement>('[data-clock="remain"]')) {
      const until = Number(node.dataset.until)
      if (!until) continue
      node.textContent = formatClock(until - Date.now())
    }
    checkFocus()
    if (!app.pause) return
    const ring = document.querySelector('[data-ring]')
    if (ring) ring.setAttribute('stroke-dashoffset', String(RING * (1 - breathProgress(app.pause, Date.now()))))
    const ready = canChoose(app.pause, Date.now())
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-needs-breath]')) button.disabled = !ready
    const note = document.querySelector<HTMLElement>('[data-breath-note]')
    if (note) note.hidden = ready
    checkBreath()
  }

  const tick = () => {
    if (document.hidden) return
    app.now = Date.now()
    maybeRemind()
    checkBreath()
    checkFocus()
    const nextShape = shape()
    if (nextShape !== lastShape) {
      lastShape = nextShape
      draw()
      return
    }
    patch()
  }

  const maybeRemind = () => {
    if (!app.db.settings.notifications) return
    const now = new Date()
    const today = localDate(now)
    if (shouldRemindEvening(app.db.settings, app.db.evenings, now, app.eveningRemindedDate)) {
      app.eveningRemindedDate = today
      const text = dict().evening.reminderNotification
      notifyLater(dict().appName, text, Date.now(), () => app.db.settings.notifications)
    }
    const due = windowDue(app.db.settings.windows, now)
    if (!due) return
    const mark = `${today}|${due}`
    if (windowMark === mark) return
    windowMark = mark
    notifyLater(dict().appName, dict().home.windowCue, Date.now(), () => app.db.settings.notifications)
  }

  root.addEventListener('click', onClick)
  root.addEventListener('submit', onSubmit)
  root.addEventListener('input', onInput)
  root.addEventListener('change', onChange)

  window.addEventListener('hashchange', () => {
    sync()
    draw()
  })
  window.addEventListener('storage', (event) => {
    if (event.key === DRAFT_KEY) {
      // Another tab started, changed or finished an unfinished pause: refresh the recovery card.
      if (app.route.name !== 'pause') draw()
      return
    }
    if (event.key !== STORAGE_KEY) return
    // Merge, never write back: the other tab already saved, so no echo loop.
    const before = app.db
    const merged = tabs.receive(before)
    if (!merged || same(before, merged)) return
    app.db = merged
    if (app.pause && merged.events.some((item) => item.id === app.pause?.id)) {
      // The same pause was finished in another tab. Recording it again here would be a duplicate.
      app.pause = null
      breathDoneVibratedId = null
      app.flash = dict().unfinished.savedElsewhere
      flashHold = true
      go('#/today')
      return
    }
    // A pause in progress lives only in this tab. Keep it, and its screen, unless the other tab reset the practice.
    if (app.pause && app.route.name === 'pause' && merged.onboardingComplete) {
      if (!same(before.settings, merged.settings) || !same(before.triggers, merged.triggers)) draw()
      return
    }
    sync()
    draw()
  })
  window.addEventListener('beforeunload', (event) => {
    if (app.storageError) {
      event.preventDefault()
      event.returnValue = ''
    }
  })
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      sync()
      draw()
    }
  })
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (app.db.settings.theme === 'system') draw()
  })
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault()
    app.installPrompt = event as unknown as InstallPrompt
    app.installReady = true
    if (app.route.name === 'settings') draw()
  })
  subscribeNetwork((online) => {
    app.offline = !online
    draw()
  })

  settleDraft()
  sync()
  draw()
  const initialFocus = activeFocus(app.db)
  if (initialFocus && focusEndsAt(initialFocus) <= Date.now()) {
    focusBellPlayedId = initialFocus.id
  }
  lastShape = shape()
  window.setInterval(tick, 250)

  return {
    offerUpdate(apply) {
      app.update = { apply }
      draw()
    },
  }
}

/** sessionStorage wrapped as a KeyValue, or null where it is unavailable (some private modes). */
function sessionKeyValue(): KeyValue | null {
  try {
    const store = window.sessionStorage
    return {
      get: (key) => store.getItem(key),
      set: (key, value) => store.setItem(key, value),
      remove: (key) => store.removeItem(key),
    }
  } catch {
    return null
  }
}

function applyChrome(settings: Settings): void {
  const lang = resolveLang(settings.lang, navigator.language)
  const theme =
    settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'ink') : settings.theme
  document.documentElement.lang = lang
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'paper' ? '#f6f1e8' : '#100e0c')
}

export { shouldRemindEvening } from './timers'

