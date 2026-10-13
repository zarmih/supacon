import { pendingPostpones, focusEndsAt, sessionEndsAt } from '../domain/clock'
import { exampleDatabase } from '../domain/example'
import { createId } from '../domain/ids'
import {
  advanceFromArrive,
  breathProgress,
  canChoose,
  choose,
  confirmSeeking,
  createDraft,
  goBack,
  isBrowsePause,
  setAfterScore,
  setScore,
  setSeeking,
  setSeekingNote,
  type PauseDraft,
} from '../domain/pause'
import type { Choice, PracticeMode, Seeking, Settings } from '../domain/types'
import { isAwarenessScore, isSeeking } from '../domain/types'
import { formatClock, localDate } from '../domain/time'
import { dictionary, resolveLang } from '../i18n'
import { notifyLater } from '../platform/notify'
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
import { loadDb, normalizeDatabase, saveDb, type KeyValue } from '../store/storage'
import { emptyForm, type FormState, type ViewModel } from './model'
import { render } from './render'
import { parseHash, routeKey, type Route } from './route'
import { FOCUS_MINUTES, PAUSE_SECONDS, POSTPONE_MINUTES, SESSION_CAPS, SESSION_MINUTES } from './screens/more'

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
}

const lists = {
  maxSessionsPerDay: SESSION_CAPS,
  sessionMinutes: SESSION_MINUTES,
  postponeMinutes: POSTPONE_MINUTES,
  focusMinutes: FOCUS_MINUTES,
  pauseSeconds: PAUSE_SECONDS,
} as const

export function startApp(root: HTMLElement, kv: KeyValue): void {
  const app: App = {
    db: loadDb(kv) ?? emptyDatabase(),
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
  }
  let flashHold = false
  let focusKey = ''
  let remindedOn = ''
  let toastToken = 0

  const dict = () => dictionary(resolveLang(app.db.settings.lang, navigator.language))

  const persist = () => {
    try {
      saveDb(kv, app.db)
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
    presets: app.presets,
    customs: app.customs,
    form: app.form,
    fields: app.fields,
    dict: dict(),
  })

  const draw = () => {
    app.now = Date.now()
    applyChrome(app.db.settings)
    root.innerHTML = render(view())
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
      return draft
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
      if (!enabled) {
        app.pause = null
        return
      }
      const same = app.pause && app.pause.triggerId === next.triggerId && app.pause.intent === next.intent
      if (!same) {
        app.pause =
          restoreDraft(next.intent, next.triggerId) ??
          createDraft({
            id: createId(),
            intent: next.intent,
            triggerId: next.triggerId,
            now: Date.now(),
            minSeconds: app.db.settings.pauseSeconds,
            completedPauses: app.db.events.filter(isBrowsePause).length,
          })
        saveDraft(app.pause)
      }
    } else {
      app.pause = null
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
    app.pause = null
    saveDraft(null)
    if (result.sessionId) {
      app.flash = null
      flashHold = false
      go(`#/session/${result.sessionId}`)
      return
    }
    if (choice === 'postpone') {
      const until = app.db.postpones.at(-1)?.until
      if (until) notifyLater(dict().appName, dict().home.return, new Date(until).getTime())
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
      const next = choose(app.pause, value, Date.now())
      if (!next) return
      app.pause = next
      saveDraft(app.pause)
      draw()
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
      if (isAwarenessScore(score)) app.form.score = score
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
      app.db = saveContact(app.db, {
        date: today,
        realContact: element.dataset.value === 'yes',
        note: '',
      })
      persist()
      draw()
      return
    }
    if (action === 'focus-start') {
      app.db = startFocus(app.db, new Date())
      persist()
      const running = activeFocus(app.db)
      if (running) notifyLater(copy.appName, copy.focus.doneTitle, focusEndsAt(running))
      draw()
      return
    }
    if (action === 'focus-end') {
      const running = activeFocus(app.db)
      if (!running) return
      const completed = element.dataset.value === 'done'
      app.db = endFocus(app.db, running.id, completed, new Date())
      persist()
      app.flash = completed ? copy.flash.focusDone : copy.flash.focusEarly
      flashHold = true
      go('#/today')
      return
    }
    if (action === 'ask-end') {
      app.form.pendingEnd = true
      draw()
      return
    }
    const routeNow = app.route
    if (action === 'session-end' && routeNow.name === 'session') {
      const found = element.dataset.found
      const answer = found === 'yes' || found === 'partly' || found === 'no' ? found : null
      const session = app.db.sessions.find((item) => item.id === routeNow.id)
      const reason = session && sessionEndsAt(session) <= Date.now() ? 'timer' : 'manual'
      app.db = endSession(app.db, routeNow.id, answer, new Date(), reason)
      persist()
      app.flash = copy.flash.session
      flashHold = true
      go('#/today')
      return
    }
    if (action === 'session-extend' && routeNow.name === 'session') {
      app.db = extendSession(app.db, routeNow.id)
      persist()
      app.form.pendingEnd = false
      const session = activeSession(app.db)
      if (session) notifyLater(copy.appName, copy.session.up, sessionEndsAt(session))
      draw()
      return
    }
    if (action === 'miss-trigger') {
      app.fields.trigger = element.dataset.value ?? ''
      draw()
      return
    }
    if (action === 'miss-seeking') {
      app.fields.seeking = element.dataset.value ?? ''
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
      app.flash = copy.flash.miss
      flashHold = true
      go('#/today')
      return
    }
    if (action === 'experiment') {
      const id = element.dataset.id
      const week = Number(element.dataset.week)
      const status = element.dataset.status
      if (!id || !week || (status !== 'done' && status !== 'dismissed')) return
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
    if (action === 'notify') {
      void toggleNotifications()
      return
    }
    if (action === 'export') {
      exportJson()
      return
    }
    if (action === 'import') {
      document.getElementById('import-file')?.click()
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

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(app.db, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `supacon-${localDate(new Date())}.json`
    link.click()
    URL.revokeObjectURL(url)
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
      const parsed = normalizeDatabase(JSON.parse(await file.text()))
      if (!parsed) {
        toast(dict().errors.import)
        return
      }
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
    if (event.key === 'Escape' && app.confirm) {
      app.confirm = null
      draw()
      return
    }
    const typing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement
    if (typing) return
    if (!app.pause) return
    if (event.key === 'Escape') {
      const previous = goBack(app.pause)
      if (previous.step !== app.pause.step) {
        app.pause = previous
        saveDraft(app.pause)
        draw()
      } else go('#/today')
      return
    }
    const number = event.key === '0' ? 10 : Number(event.key)
    if (!isAwarenessScore(number)) return
    if (app.pause.step === 'score') app.pause = setScore(app.pause, number)
    else if (app.pause.step === 'after') app.pause = setAfterScore(app.pause, number)
    else return
    saveDraft(app.pause)
    draw()
  }

  const patch = () => {
    for (const node of document.querySelectorAll<HTMLElement>('[data-clock="remain"]')) {
      const until = Number(node.dataset.until)
      if (!until) continue
      node.textContent = formatClock(until - Date.now())
    }
    if (!app.pause) return
    const ring = document.querySelector('[data-ring]')
    if (ring) ring.setAttribute('stroke-dashoffset', String(RING * (1 - breathProgress(app.pause, Date.now()))))
    const ready = canChoose(app.pause, Date.now())
    for (const button of document.querySelectorAll<HTMLButtonElement>('[data-needs-breath]')) button.disabled = !ready
    const note = document.querySelector<HTMLElement>('[data-breath-note]')
    if (note) note.hidden = ready
  }

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
  const tick = () => {
    if (document.hidden) return
    app.now = Date.now()
    maybeRemind()
    const nextShape = shape()
    if (nextShape !== lastShape) {
      lastShape = nextShape
      draw()
      return
    }
    patch()
  }

  const maybeRemind = () => {
    const reminder = app.db.settings.eveningReminder
    if (!reminder || !app.db.settings.notifications) return
    const now = new Date()
    const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const today = localDate(now)
    if (stamp === reminder && remindedOn !== today) {
      remindedOn = today
      notifyLater(dict().appName, dict().home.eveningTodo, Date.now())
    }
  }

  root.addEventListener('click', onClick)
  root.addEventListener('submit', onSubmit)
  root.addEventListener('input', onInput)
  root.addEventListener('change', onChange)
  window.addEventListener('hashchange', () => {
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

  sync()
  draw()
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

