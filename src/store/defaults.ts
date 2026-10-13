import type { Database, Settings } from '../domain/types'
import { SCHEMA_VERSION } from '../domain/types'

export function defaultSettings(): Settings {
  return {
    lang: 'auto',
    theme: 'ink',
    maxSessionsPerDay: 3,
    sessionMinutes: 15,
    postponeMinutes: 30,
    focusMinutes: 45,
    pauseSeconds: 10,
    notifications: false,
    eveningReminder: null,
  }
}

export function emptyDatabase(): Database {
  return {
    version: SCHEMA_VERSION,
    settings: defaultSettings(),
    triggers: [],
    startedOn: null,
    onboardingComplete: false,
    practiceMode: null,
    events: [],
    sessions: [],
    mornings: [],
    evenings: [],
    focuses: [],
    postpones: [],
    misses: [],
    dayMarks: [],
    experiments: [],
    demo: false,
  }
}
