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
 * Fires a notification gently via service worker registration (showNotification)
 * if available, falling back to window.Notification.
 */
export async function fireNotification(
  title: string,
  options?: NotificationOptions,
): Promise<boolean> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return false

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.ready
      if (reg && typeof reg.showNotification === 'function') {
        await reg.showNotification(title, options)
        return true
      }
    } catch {
      // Fall through to window.Notification
    }
  }

  try {
    new Notification(title, options)
    return true
  } catch {
    return false
  }
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
  timerId = setTimer(async () => {
    pendingTimeouts.delete(timerId)
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!shouldNotify()) return
    await fireNotification(title, { body })
  }, Math.max(0, delay))

  pendingTimeouts.add(timerId)
  return typeof timerId === 'number' ? timerId : 1
}


