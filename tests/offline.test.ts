import { afterEach, describe, expect, it, vi } from 'vitest'
import { isOffline, isOnline, subscribeNetwork } from '../src/platform/offline'
import { render } from '../src/ui/render'
import { emptyDatabase } from '../src/store/defaults'
import { en } from '../src/i18n/en'
import { emptyForm } from '../src/ui/model'

describe('offline platform status', () => {
  const originalNavigator = globalThis.navigator
  const originalWindow = globalThis.window

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: originalWindow,
      configurable: true,
      writable: true,
    })
  })

  it('detects online and offline states correctly', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: true },
      configurable: true,
      writable: true,
    })
    expect(isOnline()).toBe(true)
    expect(isOffline()).toBe(false)

    Object.defineProperty(globalThis, 'navigator', {
      value: { onLine: false },
      configurable: true,
      writable: true,
    })
    expect(isOnline()).toBe(false)
    expect(isOffline()).toBe(true)
  })

  it('safely defaults to online when navigator or onLine is missing', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    expect(isOnline()).toBe(true)
    expect(isOffline()).toBe(false)
  })

  it('subscribes to window online/offline events and cleans up', () => {
    const listeners: Record<string, () => void> = {}
    const addEventListenerMock = vi.fn((event: string, listener: () => void) => {
      listeners[event] = listener
    })
    const removeEventListenerMock = vi.fn((event: string) => {
      delete listeners[event]
    })

    Object.defineProperty(globalThis, 'window', {
      value: {
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock,
      },
      configurable: true,
      writable: true,
    })

    const callback = vi.fn()
    const unsubscribe = subscribeNetwork(callback)

    expect(addEventListenerMock).toHaveBeenCalledWith('online', expect.any(Function))
    expect(addEventListenerMock).toHaveBeenCalledWith('offline', expect.any(Function))

    // Simulate going offline
    listeners['offline']?.()
    expect(callback).toHaveBeenCalledWith(false)

    // Simulate coming back online
    listeners['online']?.()
    expect(callback).toHaveBeenCalledWith(true)

    // Unsubscribe
    unsubscribe()
    expect(removeEventListenerMock).toHaveBeenCalledWith('online', expect.any(Function))
    expect(removeEventListenerMock).toHaveBeenCalledWith('offline', expect.any(Function))
  })

  it('safely handles missing window in subscribeNetwork', () => {
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    const callback = vi.fn()
    const unsubscribe = subscribeNetwork(callback)
    expect(() => unsubscribe()).not.toThrow()
  })

  it('renders offline indicator in render() when offline is true', async () => {
    const view = {
      db: emptyDatabase(),
      route: { name: 'today' as const },
      now: 1_000_000,
      pause: null,
      toast: null,
      flash: null,
      confirm: null,
      installReady: false,
      presets: [],
      customs: [],
      form: emptyForm(),
      fields: {},
      dict: en,
      offline: true,
    }

    const htmlOffline = render(view)
    expect(htmlOffline).toContain('class="offline-banner"')
    expect(htmlOffline).toContain(en.offlineNotice)

    const htmlOnline = render({ ...view, offline: false })
    expect(htmlOnline).not.toContain('class="offline-banner"')
    expect(htmlOnline).not.toContain(en.offlineNotice)

    const { ru } = await import('../src/i18n/ru')
    const htmlRu = render({ ...view, dict: ru, offline: true })
    expect(htmlRu).toContain(ru.offlineNotice)
  })
})
