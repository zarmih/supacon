import { describe, expect, it } from 'vitest'
import { shouldRemindEvening } from '../src/ui/controller'
import { defaultSettings } from '../src/store/defaults'
import type { EveningReview, Settings } from '../src/domain/types'

describe('Evening Reminder Notification (shouldRemindEvening)', () => {
  const baseSettings: Settings = {
    ...defaultSettings(),
    notifications: true,
    eveningReminder: '21:30',
  }

  it('returns false when notifications are disabled', () => {
    const settings: Settings = { ...baseSettings, notifications: false }
    const now = new Date('2026-10-17T21:30:00')
    expect(shouldRemindEvening(settings, [], now, null)).toBe(false)
  })

  it('returns false when eveningReminder is not configured or invalid', () => {
    const noReminder: Settings = { ...baseSettings, eveningReminder: null }
    const invalidReminder: Settings = { ...baseSettings, eveningReminder: 'invalid' }
    const now = new Date('2026-10-17T21:30:00')
    expect(shouldRemindEvening(noReminder, [], now, null)).toBe(false)
    expect(shouldRemindEvening(invalidReminder, [], now, null)).toBe(false)
  })

  it('returns false when current time does not match eveningReminder', () => {
    // Current time is 21:29, reminder is 21:30
    const now = new Date(2026, 9, 17, 21, 29, 0)
    expect(shouldRemindEvening(baseSettings, [], now, null)).toBe(false)
  })

  it('returns true when time matches, notifications enabled, no review done, not yet reminded', () => {
    const now = new Date(2026, 9, 17, 21, 30, 15)
    expect(shouldRemindEvening(baseSettings, [], now, null)).toBe(true)
    expect(shouldRemindEvening(baseSettings, [], now, '2026-10-16')).toBe(true)
  })

  it('returns false if reminder was already sent today (eveningRemindedDate === today)', () => {
    const now = new Date(2026, 9, 17, 21, 30, 0)
    expect(shouldRemindEvening(baseSettings, [], now, '2026-10-17')).toBe(false)
  })

  it('returns false if today evening review is already completed', () => {
    const now = new Date(2026, 9, 17, 21, 30, 0)
    const evenings: EveningReview[] = [
      {
        date: '2026-10-17',
        at: '2026-10-17T20:45:00.000Z',
        lowestMoment: 'After work',
        note: 'Good calm review',
        unloggedMisses: 0,
      },
    ]
    expect(shouldRemindEvening(baseSettings, evenings, now, null)).toBe(false)
  })

  it('returns true if only past days evening reviews are completed', () => {
    const now = new Date(2026, 9, 17, 21, 30, 0)
    const evenings: EveningReview[] = [
      {
        date: '2026-10-16',
        at: '2026-10-16T21:00:00.000Z',
        lowestMoment: 'Evening',
        note: 'Yesterday review',
        unloggedMisses: 1,
      },
    ]
    expect(shouldRemindEvening(baseSettings, evenings, now, null)).toBe(true)
  })
})
