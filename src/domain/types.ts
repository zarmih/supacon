export const SCHEMA_VERSION = 2 as const

export type AwarenessScore = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10

export const SEEKINGS = [
  'boredom',
  'validation',
  'information',
  'habit',
  'relief',
  'connection',
  'stimulation',
  'status',
  'loss',
  'other',
] as const

export type Seeking = (typeof SEEKINGS)[number]

export const POST_MOTIVES = ['seen', 'truth', 'habit', 'anxiety', 'unsure'] as const

export type PostMotive = (typeof POST_MOTIVES)[number]

export type Impulse = Seeking | PostMotive

export type BrowseChoice = 'open' | 'postpone' | 'close'
export type PostChoice = 'post' | 'draft' | 'dont-post'
export type Choice = BrowseChoice | PostChoice

export type Intent = 'browse' | 'post'

export type Phase = 'calibration' | 'boundary' | 'contrast' | 'diagnosis' | 'practice'

export type PracticeMode = 'maintenance' | 'deepening' | 'free'

export type Theme = 'ink' | 'paper' | 'system'

export type LangSetting = 'auto' | 'en' | 'ru'

export type Band = 'autopilot' | 'partial' | 'clear' | 'spacious'

/** The job a pause is doing. Derived from what the person named, never from sex. */
export const CYCLES = ['approval', 'belonging', 'status', 'novelty', 'avoidance', 'loss'] as const

export type Cycle = (typeof CYCLES)[number]

export interface Settings {
  lang: LangSetting
  theme: Theme
  /** 0 means no session cap. */
  maxSessionsPerDay: number
  sessionMinutes: number
  postponeMinutes: number
  focusMinutes: number
  pauseSeconds: number
  notifications: boolean
  /** Local time `HH:MM`, or null when the evening reminder is off. */
  eveningReminder: string | null
  /** Up to three local times. Empty means the pause does not mention a window. */
  windows: string[]
  /** Minutes on either side of a window. */
  windowMinutes: number
  /** Local `HH:MM`. Both null means the night range is off. The range may cross midnight. */
  nightStart: string | null
  nightEnd: string | null
  /** A replacement written in a calm moment. Empty uses the built-in line. */
  replacements: Record<Cycle, string>
}

export interface Trigger {
  id: string
  label: string
  /** Preset ids are translated. Custom triggers keep `label`. */
  preset: boolean
  enabled: boolean
  createdAt: string
}

export interface PauseEvent {
  id: string
  at: string
  date: string
  intent: Intent
  triggerId: string
  awarenessBefore: AwarenessScore
  seeking: Impulse
  seekingNote: string
  choice: Choice
  awarenessAfter?: AwarenessScore
  overLimit: boolean
  postponeMinutes?: number
  elapsedSeconds: number
  dayNumber: number | null
  phase: Phase
  /** What "done" looked like, when opening. Absent means the open had no finish line. */
  finish?: string
}

export interface Session {
  id: string
  pauseId: string
  triggerId: string
  startedAt: string
  date: string
  plannedMinutes: number
  extendedMinutes: number
  endedAt?: string
  endReason?: 'manual' | 'timer' | 'replaced'
  awarenessAtStart: AwarenessScore
  seeking: Seeking
  overLimit: boolean
  found?: 'yes' | 'partly' | 'no'
  finish?: string
}

export interface MorningCheckin {
  date: string
  at: string
  awareness: AwarenessScore
  firstDesire: string
}

export interface EveningReview {
  date: string
  at: string
  lowestMoment: string
  note: string
  unloggedMisses: number
  likesChanged?: 'yes' | 'no' | 'unsure'
  likesNote?: string
  whereItBroke?: string
}

export interface FocusBlock {
  id: string
  date: string
  startedAt: string
  plannedMinutes: number
  endedAt?: string
  completed: boolean
}

export interface Postpone {
  id: string
  pauseId: string
  triggerId: string
  at: string
  until: string
}

export interface Miss {
  id: string
  at: string
  date: string
  triggerId: string
  awareness?: AwarenessScore
  seeking?: Seeking
  note: string
}

export interface DayMark {
  date: string
  realContact: boolean | null
  contactNote: string
}

export interface ExperimentMark {
  id: string
  weekIndex: number
  status: 'open' | 'done' | 'dismissed'
}

export interface Database {
  version: typeof SCHEMA_VERSION
  settings: Settings
  triggers: Trigger[]
  startedOn: string | null
  onboardingComplete: boolean
  practiceMode: PracticeMode | null
  events: PauseEvent[]
  sessions: Session[]
  mornings: MorningCheckin[]
  evenings: EveningReview[]
  focuses: FocusBlock[]
  postpones: Postpone[]
  misses: Miss[]
  dayMarks: DayMark[]
  experiments: ExperimentMark[]
  demo: boolean
}

export const PRESET_IDS = [
  'instagram',
  'tiktok',
  'youtube',
  'x',
  'reddit',
  'news',
  'shopping',
  'shorts',
  'other',
] as const

export type PresetId = (typeof PRESET_IDS)[number]

export function isAwarenessScore(value: number): value is AwarenessScore {
  return Number.isInteger(value) && value >= 1 && value <= 10
}

export function isSeeking(value: string): value is Seeking {
  return (SEEKINGS as readonly string[]).includes(value)
}

export function isPostMotive(value: string): value is PostMotive {
  return (POST_MOTIVES as readonly string[]).includes(value)
}
