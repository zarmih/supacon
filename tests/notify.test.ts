import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cancelPendingNotifications, notifyLater, pendingNotificationCount } from '../src/platform/notify'

describe('notifyLater & cancelPendingNotifications', () => {
  let createdNotifications: { title: string; options?: NotificationOptions }[] = []

  beforeEach(() => {
    vi.useFakeTimers()
    cancelPendingNotifications()
    createdNotifications = []

    class MockNotification {
      static permission: NotificationPermission = 'granted'
      constructor(title: string, options?: NotificationOptions) {
        createdNotifications.push({ title, options })
      }
    }

    vi.stubGlobal('Notification', MockNotification)
  })

  afterEach(() => {
    cancelPendingNotifications()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('schedules a notification and fires when timer elapses', () => {
    const at = Date.now() + 5000
    const timerId = notifyLater('Supacon', 'Focus done', at)

    expect(timerId).not.toBeNull()
    expect(pendingNotificationCount()).toBe(1)
    expect(createdNotifications.length).toBe(0)

    vi.advanceTimersByTime(5000)

    expect(createdNotifications.length).toBe(1)
    expect(createdNotifications[0]?.title).toBe('Supacon')
    expect(createdNotifications[0]?.options?.body).toBe('Focus done')
    expect(pendingNotificationCount()).toBe(0)
  })

  it('cancels pending notifications before they fire', () => {
    const at = Date.now() + 10000
    notifyLater('Supacon', 'Postpone done', at)
    expect(pendingNotificationCount()).toBe(1)

    cancelPendingNotifications()
    expect(pendingNotificationCount()).toBe(0)

    vi.advanceTimersByTime(10000)
    expect(createdNotifications.length).toBe(0)
  })

  it('does not fire if shouldNotify callback returns false when timer elapses', () => {
    let notificationsEnabled = true
    const at = Date.now() + 3000

    notifyLater('Supacon', 'Evening review', at, () => notificationsEnabled)
    expect(pendingNotificationCount()).toBe(1)

    // User disables notifications before the timer fires
    notificationsEnabled = false

    vi.advanceTimersByTime(3000)
    expect(createdNotifications.length).toBe(0)
    expect(pendingNotificationCount()).toBe(0)
  })

  it('ignores notifications if permission is not granted', () => {
    // @ts-expect-error permission override
    Notification.permission = 'denied'

    const timerId = notifyLater('Supacon', 'Should not fire', Date.now() + 1000)
    expect(timerId).toBeNull()
    expect(pendingNotificationCount()).toBe(0)
  })

  it('ignores notifications scheduled too far in the past or far future', () => {
    const past = Date.now() - 5000
    expect(notifyLater('Supacon', 'Past', past)).toBeNull()

    const farFuture = Date.now() + 3_000_000_000
    expect(notifyLater('Supacon', 'Far future', farFuture)).toBeNull()
  })
})
