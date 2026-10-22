import { afterEach, describe, expect, it, vi } from 'vitest'
import { vibrateBreathDone, vibrateChoice, vibrateTick } from '../src/platform/haptics'

describe('haptics', () => {
  const originalNavigator = globalThis.navigator

  afterEach(() => {
    vi.restoreAllMocks()
    Object.defineProperty(globalThis, 'navigator', {
      value: originalNavigator,
      configurable: true,
      writable: true,
    })
  })

  it('gracefully returns false when navigator.vibrate is not available', () => {
    Object.defineProperty(globalThis, 'navigator', {
      value: {},
      configurable: true,
      writable: true,
    })
    expect(vibrateBreathDone()).toBe(false)
    expect(vibrateChoice()).toBe(false)
    expect(vibrateTick()).toBe(false)
  })

  it('triggers soft breath-done pattern when supported', () => {
    const vibrateMock = vi.fn().mockReturnValue(true)
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    })

    const res = vibrateBreathDone()
    expect(res).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith([15, 50, 15])
  })

  it('triggers gentle choice haptic when supported', () => {
    const vibrateMock = vi.fn().mockReturnValue(true)
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    })

    const res = vibrateChoice()
    expect(res).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith(18)
  })

  it('triggers gentle micro-tick when supported', () => {
    const vibrateMock = vi.fn().mockReturnValue(true)
    Object.defineProperty(globalThis, 'navigator', {
      value: { vibrate: vibrateMock },
      configurable: true,
      writable: true,
    })

    const res = vibrateTick()
    expect(res).toBe(true)
    expect(vibrateMock).toHaveBeenCalledWith(10)
  })
})
