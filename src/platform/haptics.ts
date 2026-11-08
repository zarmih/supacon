/**
 * Tactile feedback for mindful pauses.
 * Vibrations are kept minimal, soft and calm — no jarring or abrupt alerts.
 */

function vibrate(pattern: number | number[]): boolean {
  if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return false
  if (typeof navigator.vibrate !== 'function') return false
  try {
    return navigator.vibrate(pattern)
  } catch {
    return false
  }
}

/**
 * Soft breath-done release: two gentle 15ms pulses separated by 50ms pause.
 */
export function vibrateBreathDone(): boolean {
  return vibrate([15, 50, 15])
}

/**
 * Gentle subtle tick for micro-interactions (10ms).
 */
export function vibrateTick(): boolean {
  return vibrate(10)
}

/**
 * Soft confirmation pulse on selecting a pause choice (18ms).
 */
export function vibrateChoice(): boolean {
  return vibrate(18)
}
