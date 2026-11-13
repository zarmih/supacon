import type { PauseDraft } from '../domain/pause'
import type { AwarenessScore, Database } from '../domain/types'
import type { Dict } from '../i18n/en'
import type { Route } from './route'

export interface FormState {
  score?: AwarenessScore
  likes?: 'yes' | 'no' | 'unsure'
  unlogged: number
  pendingEnd: boolean
}

export interface ViewModel {
  db: Database
  route: Route
  now: number
  pause: PauseDraft | null
  toast: string | null
  flash: string | null
  confirm: 'erase' | 'restart' | 'example' | null
  installReady: boolean
  hasBackup?: boolean
  offline?: boolean
  storageError?: boolean
  presets: string[]
  customs: { id: string; label: string }[]
  form: FormState
  fields: Record<string, string>
  dict: Dict
  /** An unfinished pause stored on this device that can be continued or discarded. */
  recovery?: PauseDraft | null
  /** A stored unfinished pause that stands in the way of the requested one. */
  conflict?: PauseDraft | null
  /** False when storage refused to keep the unfinished pause. */
  draftStored?: boolean
  /** A new version is waiting and this is a safe moment to reload into it. */
  updateReady?: boolean
}

export function emptyForm(): FormState {
  return { unlogged: 0, pendingEnd: false }
}
