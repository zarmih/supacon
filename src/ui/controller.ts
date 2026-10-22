import { pendingPostpones, focusEndsAt, sessionEndsAt } from '../domain/clock'
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
import { emptyForm, type FormState, type ViewModel } from './model'
import { render } from './render'
import { parseHash, routeKey, type Route } from './route'
import { FOCUS_MINUTES, PAUSE_SECONDS, POSTPONE_MINUTES, SESSION_CAPS, SESSION_MINUTES } from './screens/more'
import { copyDiaryToClipboard, exportCsv, exportDiary, exportJson } from './export'
import { handleKeyboardEvent } from './keyboard'
import { checkBreathHaptics, checkFocusBell, shouldRemindEvening } from './timers'

const PAUSE_KEY = 'supacon.pause'
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
}

const lists = {
  maxSessionsPerDay: SESSION_CAPS,
  sessionMinutes: SESSION_MINUTES,
  postponeMinutes: POSTPONE_MINUTES,
  focusMinutes: FOCUS_MINUTES,
  pauseSeconds: PAUSE_SECONDS,
} as const

export function startApp(root: HTMLElement, kv: KeyValue): void {
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
  }
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

  const persist = () => {
    try {
      app.db = tabs.write(app.db)
    } catch {
      app.toast = dict().errors.storage
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
    presets: app.presets,
    customs: app.customs,
    form: app.form,
    fields: app.fields,
    dict: dict(),
    offline: app.offline,
  })

  const shape = () => {
    const session = activeSession(app.db)
    const focus = activeFocus(app.db)
    const sessionUp = Boolean(session && sessionEndsAt(session) <= Date.now())
    const focusUp = Boolean(focus && focusEndsAt(focus) <= Date.now())
    const waits = pendingPostpones(app.db, Date.now())
      .map((item) => (item.waiting ? '1' : '0'))
      .join('')
    return `${app.route.name}|${sessionUp}|${focusUp}|${waits}`
  }

  let lastShape = ''

  const draw = () => {
    app.now = Date.now()
    applyChrome(app.db.settings)
    root.innerHTML = render(view())
    lastShape = shape()
    const key = `${routeKey(app.route)}:${app.pause?.step ?? ''}:${app.confirm ?? ''}`
    if (key !== focusKey) {
      focusKey = key
      document.getElementById('step-title')?.focus()
    }
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
    if (!draft) sessionStorage.removeItem(PAUSE_KEY)
    else sessionStorage.setItem(PAUSE_KEY, JSON.stringify(draft))
  }

  const restoreDraft = (intent: PauseDraft['intent'], triggerId: string): PauseDraft | null => {
    const raw = sessionStorage.getItem(PAUSE_KEY)
    if (!raw) return null
    try {
      const draft = JSON.parse(raw) as PauseDraft
      if (draft.triggerId !== triggerId || draft.intent !== intent || !draft.id || !draft.startedAt) return null
      return { ...draft, finish: typeof draft.finish === 'string' ? draft.finish : '', seekingNote: draft.seekingNote ?? '' }
    } catch {
      return null
    }
  }

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
    if (next.name === 'pause' && next.triggerId) {
      const enabled = app.db.triggers.some((trigger) => trigger.id === next.triggerId && trigger.enabled)
      const same = app.pause && app.pause.triggerId === next.triggerId && app.pause.intent === next.intent
      // Only a new pause needs an enabled trigger; one under way survives a switch-off from another tab.
      if (!enabled && !same) {
        app.pause = null
        breathDoneVibratedId = null
        return
      }
      if (!same) {
        const restored = restoreDraft(next.intent, next.triggerId)
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
      app.pause = null
      breathDoneVibratedId = null
      if (next.name !== 'pause') sessionStorage.removeItem(PAUSE_KEY)
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
    app.db = result.db
    persist()
    const pauseId = app.pause.id
    app.pause = null
    breathDoneVibratedId = null
    saveDraft(null)
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
    app.flash = messageFor(choice)
    flashHold = true
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
      persist()
      app.flash = copy.flash.morning
      flashHold = true
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
      persist()
      app.flash = copy.flash.evening
      flashHold = true
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
      persist()
      toast(copy.home.contactNoteSaved ?? 'Заметка сохранена')
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
      persist()
      app.flash = completed ? copy.flash.focusDone : copy.flash.focusEarly
      flashHold = true
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
        persist()
        app.flash = copy.flash.session
        flashHold = true
        go('#/today')
        return
      }
    }
    if (action === 'session-extend' && routeNow.name === 'session') {
      const minutes = app.db.settings.sessionMinutes
      app.db = extendSession(app.db, routeNow.id)
      persist()
      app.form.pendingEnd = false
      const session = activeSession(app.db)
      if (session) notifyLater(copy.appName, copy.session.up, sessionEndsAt(session), () => app.db.settings.notifications)
      const isRu = copy.save === 'Сохранить'
      toast(isRu ? `Продлено на ${minutes} мин. Записано честно.` : `Extended by ${minutes} min. Recorded honestly.`)
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
      persist()
      app.fields.trigger = ''
      app.fields.seeking = ''
      app.fields['miss-note'] = ''
      app.form.score = undefined
      app.flash = copy.flash.miss
      flashHold = true
      go('#/today')
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
      const onSuccess = () => toast(copy.bridge.copied)
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
          else toast(fullUrl)
        } catch {
          toast(fullUrl)
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
    persist()
    app.flash = dict().flash.example
    flashHold = true
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
    persist()
    app.fields = {}
    toast(halfNight ? dict().plan.nightHalf : dict().plan.saved)
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
      persist()
      app.fields['trigger-name'] = ''
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
      persist()
      app.flash = dict().flash.imported
      flashHold = true
      go('#/today')
    } catch {
      toast(dict().errors.import)
    }
  }

  const onKey = (event: KeyboardEvent) => {
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
      const text =
        dict().eveningReminderNotification ||
        (dict().save === 'Сохранить'
          ? 'Вечерний обзор (5–7 минут спокойного взгляда на день)'
          : 'Time for the evening review (5–7 minutes of quiet reflection)')
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
    if (event.key !== STORAGE_KEY) return
    // Merge, never write back: the other tab already saved, so no echo loop.
    const before = app.db
    const merged = tabs.receive(before)
    if (!merged || same(before, merged)) return
    app.db = merged
    // A pause in progress lives only in this tab. Keep it, and its screen, unless the other tab reset the practice.
    if (app.pause && app.route.name === 'pause' && merged.onboardingComplete) {
      if (!same(before.settings, merged.settings) || !same(before.triggers, merged.triggers)) draw()
      return
    }
    sync()
    draw()
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

  sync()
  draw()
  const initialFocus = activeFocus(app.db)
  if (initialFocus && focusEndsAt(initialFocus) <= Date.now()) {
    focusBellPlayedId = initialFocus.id
  }
  lastShape = shape()
  window.setInterval(tick, 250)
}

function applyChrome(settings: Settings): void {
  const lang = resolveLang(settings.lang, navigator.language)
  const theme =
    settings.theme === 'system' ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'paper' : 'ink') : settings.theme
  document.documentElement.lang = lang
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'paper' ? '#f7f1e7' : '#100e0c')
}

export { shouldRemindEvening } from './timers'

