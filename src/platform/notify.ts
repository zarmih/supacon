const pendingTimeouts = new Set<unknown>()

export function cancelPendingNotifications(): void {
  const clearTimer = typeof window !== 'undefined' ? window.clearTimeout : clearTimeout
  for (const id of pendingTimeouts) {
    if (typeof clearTimer === 'function') {
      clearTimer(id as any)
    }
  }
  pendingTimeouts.clear()
}

export function pendingNotificationCount(): number {
  return pendingTimeouts.size
}

/**
 * Best-effort while this page stays open. A due time in the past second still
 * fires, so an evening reminder scheduled for "now" is not dropped.
 * The in-app card is the reliable reminder.
 */
export function notifyLater(
  title: string,
  body: string,
  at: number,
  shouldNotify: () => boolean = () => true,
): number | null {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return null
  if (!shouldNotify()) return null
  const delay = at - Date.now()
  if (delay < -1_000 || delay > 2_000_000_000) return null

  const setTimer = typeof window !== 'undefined' ? window.setTimeout : setTimeout
  if (typeof setTimer !== 'function') return null

  let timerId: unknown
  timerId = setTimer(() => {
    pendingTimeouts.delete(timerId)
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!shouldNotify()) return
    new Notification(title, { body })
  }, Math.max(0, delay))

  pendingTimeouts.add(timerId)
  return typeof timerId === 'number' ? timerId : 1
}


