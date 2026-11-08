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
  presets: string[]
  customs: { id: string; label: string }[]
  form: FormState
  fields: Record<string, string>
  dict: Dict
}

export function emptyForm(): FormState {
  return { unlogged: 0, pendingEnd: false }
}
