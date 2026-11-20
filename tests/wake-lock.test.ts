import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetWakeLockForTest,
  isWakeLockActive,
  isWakeLockRequested,
  releaseWakeLock,
  requestWakeLock,
} from '../src/platform/wake-lock'

interface MockSentinel extends EventTarget {
  released: boolean
  release: () => Promise<void>
}

function createMockSentinel(): MockSentinel {
  const target = new EventTarget() as MockSentinel
  target.released = false
  target.release = vi.fn().mockImplementation(async () => {
    target.released = true
    target.dispatchEvent(new Event('release'))
  })
  return target
}

describe('src/platform/wake-lock.ts', () => {
  beforeEach(() => {
    _resetWakeLockForTest()
    vi.restoreAllMocks()
  })

  afterEach(() => {
    _resetWakeLockForTest()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  describe('absence of Wake Lock API', () => {
    it('returns false and does not throw when navigator has no wakeLock property', async () => {
      vi.stubGlobal('navigator', {})
      const acquired = await requestWakeLock()
      expect(acquired).toBe(false)
      expect(isWakeLockActive()).toBe(false)

      await expect(releaseWakeLock()).resolves.toBeUndefined()
    })

    it('returns false when navigator.wakeLock is undefined', async () => {
      vi.stubGlobal('navigator', { wakeLock: undefined })
      const acquired = await requestWakeLock()
      expect(acquired).toBe(false)
      expect(isWakeLockActive()).toBe(false)
    })
  })

  describe('mocked navigator.wakeLock', () => {
    it('successfully requests screen wake lock and tracks active state', async () => {
      const sentinel = createMockSentinel()
      const requestMock = vi.fn().mockResolvedValue(sentinel)

      vi.stubGlobal('navigator', {
        wakeLock: { request: requestMock },
      })

      expect(isWakeLockActive()).toBe(false)
      const acquired = await requestWakeLock()

      expect(acquired).toBe(true)
      expect(requestMock).toHaveBeenCalledWith('screen')
      expect(isWakeLockActive()).toBe(true)
      expect(isWakeLockRequested()).toBe(true)
    })

    it('does not re-request wake lock if already actively held', async () => {
      const sentinel = createMockSentinel()
      const requestMock = vi.fn().mockResolvedValue(sentinel)

      vi.stubGlobal('navigator', {
        wakeLock: { request: requestMock },
      })

      await requestWakeLock()
      expect(requestMock).toHaveBeenCalledTimes(1)

      const second = await requestWakeLock()
      expect(second).toBe(true)
      expect(requestMock).toHaveBeenCalledTimes(1)
    })

    it('updates active state when sentinel fires release event', async () => {
      const sentinel = createMockSentinel()
      vi.stubGlobal('navigator', {
        wakeLock: { request: vi.fn().mockResolvedValue(sentinel) },
      })

      await requestWakeLock()
      expect(isWakeLockActive()).toBe(true)

      // Browser releases the sentinel internally
      sentinel.dispatchEvent(new Event('release'))
      expect(isWakeLockActive()).toBe(false)
    })

    it('releases active sentinel on releaseWakeLock()', async () => {
      const sentinel = createMockSentinel()
      vi.stubGlobal('navigator', {
        wakeLock: { request: vi.fn().mockResolvedValue(sentinel) },
      })

      await requestWakeLock()
      expect(isWakeLockActive()).toBe(true)

      await releaseWakeLock()
      expect(sentinel.release).toHaveBeenCalled()
      expect(isWakeLockActive()).toBe(false)
      expect(isWakeLockRequested()).toBe(false)
    })

    it('handles request rejection gracefully without throwing', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const requestMock = vi.fn().mockRejectedValue(new Error('NotAllowedError: Low power mode'))

      vi.stubGlobal('navigator', {
        wakeLock: { request: requestMock },
      })

      const acquired = await requestWakeLock()
      expect(acquired).toBe(false)
      expect(isWakeLockActive()).toBe(false)
      expect(consoleSpy).toHaveBeenCalled()
    })

    it('handles sentinel release rejection gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const sentinel = createMockSentinel()
      sentinel.release = vi.fn().mockRejectedValue(new Error('Release failed'))

      vi.stubGlobal('navigator', {
        wakeLock: { request: vi.fn().mockResolvedValue(sentinel) },
      })

      await requestWakeLock()
      await expect(releaseWakeLock()).resolves.toBeUndefined()
      expect(consoleSpy).toHaveBeenCalled()
      expect(isWakeLockActive()).toBe(false)
    })
  })

  describe('re-acquisition on visibilitychange', () => {
    it('re-acquires wake lock when document returns to visible after being hidden', async () => {
      let sentinel1 = createMockSentinel()
      let sentinel2 = createMockSentinel()
      const requestMock = vi
        .fn()
        .mockResolvedValueOnce(sentinel1)
        .mockResolvedValueOnce(sentinel2)

      let currentVisibility: DocumentVisibilityState = 'visible'
      const docTarget = new EventTarget()

      vi.stubGlobal('navigator', {
        wakeLock: { request: requestMock },
      })

      vi.stubGlobal('document', {
        get visibilityState() {
          return currentVisibility
        },
        addEventListener: (event: string, handler: EventListener) => docTarget.addEventListener(event, handler),
        removeEventListener: (event: string, handler: EventListener) => docTarget.removeEventListener(event, handler),
      })

      // 1. Initial wake lock request while visible
      await requestWakeLock()
      expect(requestMock).toHaveBeenCalledTimes(1)
      expect(isWakeLockActive()).toBe(true)

      // 2. Tab becomes hidden -> OS/browser releases sentinel
      currentVisibility = 'hidden'
      sentinel1.dispatchEvent(new Event('release'))
      expect(isWakeLockActive()).toBe(false)
      expect(isWakeLockRequested()).toBe(true) // Still wanted by active focus session

      // 3. Tab returns to visible -> dispatches visibilitychange
      currentVisibility = 'visible'
      docTarget.dispatchEvent(new Event('visibilitychange'))

      // Allow async acquire to finish
      await Promise.resolve()
      await Promise.resolve()

      expect(requestMock).toHaveBeenCalledTimes(2)
      expect(isWakeLockActive()).toBe(true)
    })

    it('does not re-acquire wake lock if releaseWakeLock was called before becoming visible', async () => {
      const sentinel1 = createMockSentinel()
      const requestMock = vi.fn().mockResolvedValue(sentinel1)

      let currentVisibility: DocumentVisibilityState = 'visible'
      const docTarget = new EventTarget()

      vi.stubGlobal('navigator', {
        wakeLock: { request: requestMock },
      })

      vi.stubGlobal('document', {
        get visibilityState() {
          return currentVisibility
        },
        addEventListener: (event: string, handler: EventListener) => docTarget.addEventListener(event, handler),
        removeEventListener: (event: string, handler: EventListener) => docTarget.removeEventListener(event, handler),
      })

      await requestWakeLock()
      expect(requestMock).toHaveBeenCalledTimes(1)

      // User ends focus session, explicitly releasing the wake lock
      await releaseWakeLock()
      expect(isWakeLockRequested()).toBe(false)

      // Tab visibility changes
      currentVisibility = 'visible'
      docTarget.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()

      expect(requestMock).toHaveBeenCalledTimes(1)
      expect(isWakeLockActive()).toBe(false)
    })

    it('does not attempt re-acquisition if document becomes hidden instead of visible', async () => {
      const sentinel = createMockSentinel()
      const requestMock = vi.fn().mockResolvedValue(sentinel)

      let currentVisibility: DocumentVisibilityState = 'visible'
      const docTarget = new EventTarget()

      vi.stubGlobal('navigator', {
        wakeLock: { request: requestMock },
      })

      vi.stubGlobal('document', {
        get visibilityState() {
          return currentVisibility
        },
        addEventListener: (event: string, handler: EventListener) => docTarget.addEventListener(event, handler),
        removeEventListener: (event: string, handler: EventListener) => docTarget.removeEventListener(event, handler),
      })

      await requestWakeLock()
      expect(requestMock).toHaveBeenCalledTimes(1)

      // Sentinel released
      sentinel.dispatchEvent(new Event('release'))

      // Visibility change event fires while state is 'hidden'
      currentVisibility = 'hidden'
      docTarget.dispatchEvent(new Event('visibilitychange'))
      await Promise.resolve()

      expect(requestMock).toHaveBeenCalledTimes(1)
    })
  })
})
