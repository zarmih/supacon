import { focusEndsAt } from '../domain/clock'
import { breathDone, type PauseDraft } from '../domain/pause'
import { localDate } from '../domain/time'
import type { EveningReview, FocusBlock, Settings } from '../domain/types'

export function shouldRemindEvening(
  settings: Settings,
  evenings: EveningReview[],
  now: Date,
  eveningRemindedDate: string | null | undefined,
): boolean {
  if (!settings.notifications) return false
  const reminder = settings.eveningReminder
  if (!reminder || !/^\d{2}:\d{2}$/.test(reminder)) return false
  const stamp = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  if (stamp !== reminder) return false
  const today = localDate(now)
  if (eveningRemindedDate === today) return false
  const eveningDone = evenings.some((entry) => entry.date === today)
  if (eveningDone) return false
  return true
}

export function checkBreathHaptics(
  pause: PauseDraft | null,
  now: number,
  lastVibratedId: string | null,
  hapticsEnabled: boolean,
  onVibrate: () => void,
): string | null {
  if (!pause) return lastVibratedId
  if (lastVibratedId !== pause.id && breathDone(pause, now)) {
    if (hapticsEnabled) onVibrate()
    return pause.id
  }
  return lastVibratedId
}

export function checkFocusBell(
  focus: FocusBlock | null,
  now: number,
  lastPlayedId: string | null,
  soundEnabled: boolean,
  onPlaySound: () => void,
): string | null {
  if (!focus) return lastPlayedId
  const endsAt = focusEndsAt(focus)
  if (now >= endsAt) {
    if (lastPlayedId !== focus.id) {
      if (now - endsAt < 3000 && soundEnabled) {
        onPlaySound()
      }
      return focus.id
    }
  }
  return lastPlayedId
}
