import type { AwarenessScore, Database, PauseEvent, Seeking } from './types'
import { createId } from './ids'
import { addDays } from './time'
import { localDateTime } from './clock'
import { defaultSettings, emptyDatabase } from '../store/defaults'

interface Beat {
  day: number
  hour: number
  minute: number
  triggerId: string
  awareness: AwarenessScore
  seeking: Seeking
  choice: 'open' | 'postpone' | 'close'
  after: AwarenessScore
  found?: 'yes' | 'partly' | 'no'
}

/**
 * A finished calibration week with a readable shape:
 * low-awareness validation at night opens; higher scores postpone; mornings close.
 * Dates are relative to `today`, which becomes protocol day 7.
 */
export function exampleDatabase(today: string, now = new Date()): Database {
  const startedOn = addDays(today, -6)
  const db = emptyDatabase()
  db.settings = { ...defaultSettings(), pauseSeconds: 10 }
  db.onboardingComplete = true
  db.startedOn = startedOn
  db.demo = true
  db.practiceMode = null
  db.triggers = [
    { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: now.toISOString() },
    { id: 'youtube', label: 'YouTube', preset: true, enabled: true, createdAt: now.toISOString() },
    { id: 'news', label: 'News', preset: true, enabled: true, createdAt: now.toISOString() },
    { id: 'other', label: 'Something else', preset: true, enabled: true, createdAt: now.toISOString() },
  ]

  const beats: Beat[] = []
  for (let day = 1; day <= 7; day += 1) {
    const early = day <= 4
    beats.push({
      day,
      hour: 22,
      minute: 10,
      triggerId: 'instagram',
      awareness: (early ? 3 : 7) as AwarenessScore,
      seeking: 'validation',
      choice: early ? 'open' : 'postpone',
      after: (early ? 4 : 8) as AwarenessScore,
      found: early ? 'no' : undefined,
    })
    beats.push({
      day,
      hour: 22,
      minute: 40,
      triggerId: 'instagram',
      awareness: (early ? 4 : 8) as AwarenessScore,
      seeking: 'validation',
      choice: early ? 'open' : 'postpone',
      after: (early ? 5 : 8) as AwarenessScore,
      found: early ? 'no' : undefined,
    })
    beats.push({
      day,
      hour: 8,
      minute: 15,
      triggerId: 'news',
      awareness: 8,
      seeking: 'information',
      choice: 'close',
      after: 8,
    })
    beats.push({
      day,
      hour: 13,
      minute: 5,
      triggerId: 'youtube',
      awareness: (early ? 5 : 7) as AwarenessScore,
      seeking: 'boredom',
      choice: early ? 'open' : 'postpone',
      after: (early ? 5 : 8) as AwarenessScore,
      found: early ? 'partly' : undefined,
    })
  }

  for (const beat of beats) {
    const date = addDays(startedOn, beat.day - 1)
    const at = localDateTime(date, beat.hour, beat.minute)
    const event: PauseEvent = {
      id: createId(),
      at: at.toISOString(),
      date,
      intent: 'browse',
      triggerId: beat.triggerId,
      awarenessBefore: beat.awareness,
      seeking: beat.seeking,
      seekingNote: '',
      choice: beat.choice,
      awarenessAfter: beat.after,
      overLimit: false,
      elapsedSeconds: 12,
      dayNumber: beat.day,
      phase: beat.day <= 2 ? 'calibration' : beat.day <= 4 ? 'boundary' : beat.day <= 6 ? 'contrast' : 'diagnosis',
    }
    if (beat.choice === 'postpone') {
      event.postponeMinutes = 30
      const postponeAt = at.toISOString()
      db.postpones.push({
        id: createId(),
        pauseId: event.id,
        triggerId: beat.triggerId,
        at: postponeAt,
        until: new Date(at.getTime() + 30 * 60_000).toISOString(),
      })
    }
    db.events.push(event)
    if (beat.choice === 'open' && beat.found) {
      db.sessions.push({
        id: createId(),
        pauseId: event.id,
        triggerId: beat.triggerId,
        startedAt: at.toISOString(),
        date,
        plannedMinutes: 15,
        extendedMinutes: 0,
        endedAt: new Date(at.getTime() + 12 * 60_000).toISOString(),
        endReason: 'manual',
        awarenessAtStart: beat.awareness,
        seeking: beat.seeking,
        overLimit: false,
        found: beat.found,
      })
    }
  }

  for (let day = 1; day <= 7; day += 1) {
    const date = addDays(startedOn, day - 1)
    db.mornings.push({
      date,
      at: localDateTime(date, 7, 40).toISOString(),
      awareness: (day < 4 ? 5 : 7) as AwarenessScore,
      firstDesire: day < 4 ? 'Check who replied' : 'See the night, then make coffee',
    })
    db.evenings.push({
      date,
      at: localDateTime(date, 21, 10).toISOString(),
      lowestMoment: day <= 3 ? 'Late, on the couch' : 'Still late, but I saw it',
      note: '',
      unloggedMisses: day === 2 ? 1 : 0,
      ...(day === 7
        ? {
            likesChanged: 'yes' as const,
            likesNote: 'Shorter. Less like relief.',
            whereItBroke: 'The second night open, before I had scored.',
          }
        : {}),
    })
    if (day !== 3) {
      db.focuses.push({
        id: createId(),
        date,
        startedAt: localDateTime(date, day >= 5 ? 22 : 16, 0).toISOString(),
        plannedMinutes: 45,
        endedAt: localDateTime(date, day >= 5 ? 22 : 16, 45).toISOString(),
        completed: true,
      })
    }
    if (day >= 5) {
      db.dayMarks.push({
        date,
        realContact: day !== 6,
        contactNote: day === 5 ? 'Walk with a friend' : '',
      })
    }
  }

  db.misses.push({
    id: createId(),
    at: localDateTime(addDays(startedOn, 1), 23, 5).toISOString(),
    date: addDays(startedOn, 1),
    triggerId: 'instagram',
    awareness: 2,
    seeking: 'habit',
    note: '',
  })

  db.events.push({
    id: createId(),
    at: localDateTime(addDays(startedOn, 3), 19, 0).toISOString(),
    date: addDays(startedOn, 3),
    intent: 'post',
    triggerId: 'instagram',
    awarenessBefore: 4,
    seeking: 'seen',
    seekingNote: '',
    choice: 'dont-post',
    elapsedSeconds: 14,
    overLimit: false,
    dayNumber: 4,
    phase: 'boundary',
  })
  db.events.push({
    id: createId(),
    at: localDateTime(addDays(startedOn, 5), 12, 30).toISOString(),
    date: addDays(startedOn, 5),
    intent: 'post',
    triggerId: 'instagram',
    awarenessBefore: 7,
    seeking: 'truth',
    seekingNote: '',
    choice: 'post',
    elapsedSeconds: 11,
    overLimit: false,
    dayNumber: 6,
    phase: 'contrast',
  })

  return db
}
