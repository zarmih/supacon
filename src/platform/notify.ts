/**
 * Best-effort while this page stays open. A due time in the past second still
 * fires, so an evening reminder scheduled for "now" is not dropped.
 * The in-app card is the reliable reminder.
 */
export function notifyLater(title: string, body: string, at: number): void {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  const delay = at - Date.now()
  if (delay < -1_000 || delay > 2_000_000_000) return
  window.setTimeout(() => {
    if (Notification.permission !== 'granted') return
    new Notification(title, { body })
  }, Math.max(0, delay))
}
