import { emptyReplacements, isHm, knownCycle } from '../domain/cycles'
import type { Cycle, Database, EveningReview, PauseEvent } from '../domain/types'
import { CYCLES, SCHEMA_VERSION, isAwarenessScore, isSeeking } from '../domain/types'
import { emptyDatabase } from './defaults'
import { sanitizeSettings } from './mutate'

export const STORAGE_KEY = 'supacon.v1'
export const BACKUP_KEY = 'supacon.v1.bak'

export interface KeyValue {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

export function memoryStore(): KeyValue {
  const map = new Map<string, string>()
  return {
    get: (key) => map.get(key) ?? null,
    set: (key, value) => {
      map.set(key, value)
    },
    remove: (key) => {
      map.delete(key)
    },
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

export function normalizeDatabase(raw: unknown): Database | null {
  if (!isRecord(raw) || (raw.version !== 1 && raw.version !== SCHEMA_VERSION)) return null
  const base = emptyDatabase()
  if (!isRecord(raw.settings)) return null
  const settings = raw.settings
  base.settings = {
    ...base.settings,
    lang: settings.lang === 'en' || settings.lang === 'ru' || settings.lang === 'auto' ? settings.lang : 'auto',
    theme: settings.theme === 'paper' || settings.theme === 'system' || settings.theme === 'ink' ? settings.theme : 'ink',
    maxSessionsPerDay: typeof settings.maxSessionsPerDay === 'number' ? settings.maxSessionsPerDay : 3,
    sessionMinutes: typeof settings.sessionMinutes === 'number' ? settings.sessionMinutes : 15,
    postponeMinutes: typeof settings.postponeMinutes === 'number' ? settings.postponeMinutes : 30,
    focusMinutes: typeof settings.focusMinutes === 'number' ? settings.focusMinutes : 45,
    pauseSeconds: typeof settings.pauseSeconds === 'number' ? settings.pauseSeconds : 10,
    notifications: settings.notifications === true,
    haptics: settings.haptics !== false,
    sound: settings.sound !== false,
    eveningReminder: typeof settings.eveningReminder === 'string' ? settings.eveningReminder : null,
    windows: normalizeWindows(settings.windows),
    windowMinutes: settings.windowMinutes === 30 || settings.windowMinutes === 60 ? settings.windowMinutes : 45,
    nightStart: isHm(settings.nightStart) ? settings.nightStart : null,
    nightEnd: isHm(settings.nightEnd) ? settings.nightEnd : null,
    replacements: normalizeReplacements(settings.replacements),
  }
  if (!base.settings.nightStart || !base.settings.nightEnd || base.settings.nightStart === base.settings.nightEnd) {
    base.settings.nightStart = null
    base.settings.nightEnd = null
  }
  base.triggers = asArray(raw.triggers).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.label !== 'string') return []
    return [
      {
        id: item.id,
        label: item.label.slice(0, 40),
        preset: item.preset === true,
        enabled: item.enabled !== false,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date(0).toISOString(),
      },
    ]
  })
  base.startedOn = typeof raw.startedOn === 'string' ? raw.startedOn : null
  base.onboardingComplete = raw.onboardingComplete === true
  base.practiceMode =
    raw.practiceMode === 'maintenance' || raw.practiceMode === 'deepening' || raw.practiceMode === 'free'
      ? raw.practiceMode
      : null
  base.demo = raw.demo === true
  base.events = asArray(raw.events).flatMap((item) => normalizeEvent(item))
  base.sessions = asArray(raw.sessions).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.triggerId !== 'string') return []
    if (typeof item.startedAt !== 'string' || typeof item.date !== 'string') return []
    if (typeof item.awarenessAtStart !== 'number' || !isAwarenessScore(item.awarenessAtStart)) return []
    if (typeof item.seeking !== 'string' || !isSeeking(item.seeking)) return []
    return [
      {
        id: item.id,
        pauseId: typeof item.pauseId === 'string' ? item.pauseId : item.id,
        triggerId: item.triggerId,
        startedAt: item.startedAt,
        date: item.date,
        plannedMinutes: typeof item.plannedMinutes === 'number' ? item.plannedMinutes : 15,
        extendedMinutes: typeof item.extendedMinutes === 'number' ? item.extendedMinutes : 0,
        ...(typeof item.endedAt === 'string' ? { endedAt: item.endedAt } : {}),
        ...(item.endReason === 'manual' || item.endReason === 'timer' || item.endReason === 'replaced'
          ? { endReason: item.endReason }
          : {}),
        awarenessAtStart: item.awarenessAtStart,
        seeking: item.seeking,
        overLimit: item.overLimit === true,
        ...(item.found === 'yes' || item.found === 'partly' || item.found === 'no' ? { found: item.found } : {}),
        ...(typeof item.finish === 'string' && item.finish.trim() ? { finish: item.finish.trim().slice(0, 80) } : {}),
      },
    ]
  })
  base.mornings = asArray(raw.mornings).flatMap((item) => {
    if (!isRecord(item) || typeof item.date !== 'string' || typeof item.firstDesire !== 'string') return []
    if (typeof item.awareness !== 'number' || !isAwarenessScore(item.awareness)) return []
    return [
      {
        date: item.date,
        at: typeof item.at === 'string' ? item.at : item.date,
        awareness: item.awareness,
        firstDesire: item.firstDesire,
      },
    ]
  })
  base.evenings = asArray(raw.evenings).flatMap((item) => normalizeEvening(item))
  base.focuses = asArray(raw.focuses).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.startedAt !== 'string') return []
    return [
      {
        id: item.id,
        date: typeof item.date === 'string' ? item.date : item.startedAt.slice(0, 10),
        startedAt: item.startedAt,
        plannedMinutes: typeof item.plannedMinutes === 'number' ? item.plannedMinutes : 45,
        ...(typeof item.endedAt === 'string' ? { endedAt: item.endedAt } : {}),
        completed: item.completed === true,
      },
    ]
  })
  base.postpones = asArray(raw.postpones).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.until !== 'string') return []
    if (typeof item.pauseId !== 'string' || typeof item.triggerId !== 'string' || typeof item.at !== 'string') return []
    return [{ id: item.id, pauseId: item.pauseId, triggerId: item.triggerId, at: item.at, until: item.until }]
  })
  base.misses = asArray(raw.misses).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.triggerId !== 'string') return []
    return [
      {
        id: item.id,
        at: typeof item.at === 'string' ? item.at : new Date(0).toISOString(),
        date: typeof item.date === 'string' ? item.date : '1970-01-01',
        triggerId: item.triggerId,
        ...(typeof item.awareness === 'number' && isAwarenessScore(item.awareness) ? { awareness: item.awareness } : {}),
        ...(typeof item.seeking === 'string' ? { seeking: item.seeking as SeekingLoose } : {}),
        note: typeof item.note === 'string' ? item.note : '',
      },
    ]
  })
  base.dayMarks = asArray(raw.dayMarks).flatMap((item) => {
    if (!isRecord(item) || typeof item.date !== 'string') return []
    return [
      {
        date: item.date,
        realContact: item.realContact === true ? true : item.realContact === false ? false : null,
        contactNote: typeof item.contactNote === 'string' ? item.contactNote : '',
      },
    ]
  })
  base.experiments = asArray(raw.experiments).flatMap((item) => {
    if (!isRecord(item) || typeof item.id !== 'string' || typeof item.weekIndex !== 'number') return []
    const status = item.status === 'done' || item.status === 'dismissed' || item.status === 'open' ? item.status : 'open'
    return [{ id: item.id, weekIndex: item.weekIndex, status }]
  })
  base.settings = sanitizeSettings(base.settings)
  return base
}

type SeekingLoose = NonNullable<Database['misses'][number]['seeking']>

function normalizeEvent(item: unknown): PauseEvent[] {
  if (!isRecord(item) || typeof item.id !== 'string' || typeof item.at !== 'string' || typeof item.date !== 'string') {
    return []
  }
  if (typeof item.awarenessBefore !== 'number' || !isAwarenessScore(item.awarenessBefore)) return []
  if (item.intent !== 'browse' && item.intent !== 'post') return []
  if (typeof item.choice !== 'string' || typeof item.triggerId !== 'string' || typeof item.seeking !== 'string') return []
  return [
    {
      id: item.id,
      at: item.at,
      date: item.date,
      intent: item.intent,
      triggerId: item.triggerId,
      awarenessBefore: item.awarenessBefore,
      seeking: item.seeking as PauseEvent['seeking'],
      seekingNote: typeof item.seekingNote === 'string' ? item.seekingNote : '',
      choice: item.choice as PauseEvent['choice'],
      ...(typeof item.awarenessAfter === 'number' && isAwarenessScore(item.awarenessAfter)
        ? { awarenessAfter: item.awarenessAfter }
        : {}),
      overLimit: item.overLimit === true,
      ...(typeof item.postponeMinutes === 'number' ? { postponeMinutes: item.postponeMinutes } : {}),
      elapsedSeconds: typeof item.elapsedSeconds === 'number' ? item.elapsedSeconds : 0,
      dayNumber: typeof item.dayNumber === 'number' ? item.dayNumber : null,
      ...(typeof item.finish === 'string' && item.finish.trim() ? { finish: item.finish.trim().slice(0, 80) } : {}),
      phase:
        item.phase === 'calibration' ||
        item.phase === 'boundary' ||
        item.phase === 'contrast' ||
        item.phase === 'diagnosis' ||
        item.phase === 'practice'
          ? item.phase
          : 'practice',
    },
  ]
}

function normalizeWindows(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  for (const item of value) {
    if (!isHm(item) || seen.has(item)) continue
    seen.add(item)
    if (seen.size === 3) break
  }
  return [...seen].sort()
}

function normalizeReplacements(value: unknown): Record<Cycle, string> {
  const replacements = emptyReplacements()
  if (!isRecord(value)) return replacements
  for (const cycle of CYCLES) {
    const text = value[cycle]
    if (typeof text === 'string' && knownCycle(cycle)) replacements[cycle] = text.trim().slice(0, 160)
  }
  return replacements
}

function normalizeEvening(item: unknown): EveningReview[] {
  if (!isRecord(item) || typeof item.date !== 'string') return []
  return [
    {
      date: item.date,
      at: typeof item.at === 'string' ? item.at : item.date,
      lowestMoment: typeof item.lowestMoment === 'string' ? item.lowestMoment : '',
      note: typeof item.note === 'string' ? item.note : '',
      unloggedMisses: typeof item.unloggedMisses === 'number' ? item.unloggedMisses : 0,
      ...(item.likesChanged === 'yes' || item.likesChanged === 'no' || item.likesChanged === 'unsure'
        ? { likesChanged: item.likesChanged }
        : {}),
      ...(typeof item.likesNote === 'string' ? { likesNote: item.likesNote } : {}),
      ...(typeof item.whereItBroke === 'string' ? { whereItBroke: item.whereItBroke } : {}),
    },
  ]
}

export function loadDb(kv: KeyValue): Database | null {
  const raw = kv.get(STORAGE_KEY)
  if (!raw) return null
  try {
    const parsed = normalizeDatabase(JSON.parse(raw))
    if (!parsed) {
      kv.set(BACKUP_KEY, raw)
      return null
    }
    return parsed
  } catch {
    kv.set(BACKUP_KEY, raw)
    return null
  }
}

export function saveDb(kv: KeyValue, db: Database): void {
  kv.set(STORAGE_KEY, JSON.stringify(db))
}

export function saveBackup(kv: KeyValue, db: Database): void {
  kv.set(BACKUP_KEY, JSON.stringify(db))
}

export function hasValidBackup(kv: KeyValue): boolean {
  const raw = kv.get(BACKUP_KEY)
  if (!raw) return false
  try {
    return normalizeDatabase(JSON.parse(raw)) !== null
  } catch {
    return false
  }
}

export function restoreBackup(kv: KeyValue): boolean {
  const raw = kv.get(BACKUP_KEY)
  if (!raw) return false
  try {
    const parsed = normalizeDatabase(JSON.parse(raw))
    if (!parsed) return false
    saveDb(kv, parsed)
    kv.remove(BACKUP_KEY)
    return true
  } catch {
    return false
  }
}

export function inspectImport(rawJson: string): {
  ok: boolean
  pauseCount: number
  dateRange?: string
  version?: number
  error?: string
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawJson)
  } catch {
    return { ok: false, pauseCount: 0, error: 'Invalid JSON syntax' }
  }

  if (!isRecord(parsed)) {
    return { ok: false, pauseCount: 0, error: 'Expected a JSON object' }
  }

  const version = typeof parsed.version === 'number' ? parsed.version : undefined
  if (parsed.version !== 1 && parsed.version !== SCHEMA_VERSION) {
    return {
      ok: false,
      pauseCount: 0,
      version,
      error: `Unsupported version: ${String(parsed.version)}`,
    }
  }

  const db = normalizeDatabase(parsed)
  if (!db) {
    return { ok: false, pauseCount: 0, version, error: 'Invalid database structure' }
  }

  const pauseCount = db.events.length

  const dates = new Set<string>()
  if (db.startedOn) dates.add(db.startedOn)
  for (const e of db.events) dates.add(e.date)
  for (const m of db.mornings) dates.add(m.date)
  for (const ev of db.evenings) dates.add(ev.date)
  for (const f of db.focuses) dates.add(f.date)
  for (const d of db.dayMarks) dates.add(d.date)
  for (const mi of db.misses) dates.add(mi.date)

  let dateRange: string | undefined
  if (dates.size > 0) {
    const sorted = [...dates].sort()
    const first = sorted[0]
    const last = sorted[sorted.length - 1]
    if (first && last) {
      dateRange = first === last ? first : `${first} — ${last}`
    }
  }

  return {
    ok: true,
    pauseCount,
    ...(dateRange ? { dateRange } : {}),
    version: db.version,
  }
}
