import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAudioContext, playCompletionBell, resetAudioContext } from '../src/platform/audio'

describe('audio platform module', () => {
  const originalAudioContext = (globalThis as unknown as { AudioContext?: unknown }).AudioContext
  const originalWebkitAudioContext = (globalThis as unknown as { webkitAudioContext?: unknown }).webkitAudioContext

  beforeEach(() => {
    resetAudioContext()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    resetAudioContext()
    Object.defineProperty(globalThis, 'AudioContext', {
      value: originalAudioContext,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'webkitAudioContext', {
      value: originalWebkitAudioContext,
      configurable: true,
      writable: true,
    })
    if (typeof window !== 'undefined') {
      delete (window as unknown as { AudioContext?: unknown }).AudioContext
      delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
    }
  })

  it('safely returns false when AudioContext is unsupported', () => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'webkitAudioContext', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    if (typeof window !== 'undefined') {
      delete (window as unknown as { AudioContext?: unknown }).AudioContext
      delete (window as unknown as { webkitAudioContext?: unknown }).webkitAudioContext
    }

    expect(getAudioContext()).toBeNull()
    expect(playCompletionBell()).toBe(false)
  })

  it('synthesizes a 432 Hz gentle bell with 1.5s decay', () => {
    const mockGainParam = {
      setValueAtTime: vi.fn(),
      linearRampToValueAtTime: vi.fn(),
      exponentialRampToValueAtTime: vi.fn(),
    }
    const mockGainNode = {
      gain: mockGainParam,
      connect: vi.fn(),
      disconnect: vi.fn(),
    }

    const mockFreqParam = {
      setValueAtTime: vi.fn(),
    }
    const mockOscillatorNode = {
      type: '',
      frequency: mockFreqParam,
      connect: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
      disconnect: vi.fn(),
      onended: null as (() => void) | null,
    }

    const destinationObj = {}
    const mockContext = {
      currentTime: 10,
      state: 'running',
      destination: destinationObj,
      createOscillator: vi.fn().mockReturnValue(mockOscillatorNode),
      createGain: vi.fn().mockReturnValue(mockGainNode),
      resume: vi.fn().mockResolvedValue(undefined),
    }

    class MockAudioContext {
      constructor() {
        return mockContext as unknown as AudioContext
      }
    }

    Object.defineProperty(globalThis, 'AudioContext', {
      value: MockAudioContext,
      configurable: true,
      writable: true,
    })

    const result = playCompletionBell()
    expect(result).toBe(true)

    // Oscillator parameters
    expect(mockContext.createOscillator).toHaveBeenCalled()
    expect(mockOscillatorNode.type).toBe('sine')
    expect(mockFreqParam.setValueAtTime).toHaveBeenCalledWith(432, 10)

    // Gain envelope (soft attack + 1.5s exponential decay)
    expect(mockContext.createGain).toHaveBeenCalled()
    expect(mockGainParam.setValueAtTime).toHaveBeenCalledWith(0.0001, 10)
    expect(mockGainParam.linearRampToValueAtTime).toHaveBeenCalledWith(0.15, 10 + 0.02)
    expect(mockGainParam.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 10 + 1.5)

    // Connections: Osc -> Gain -> Destination
    expect(mockOscillatorNode.connect).toHaveBeenCalledWith(mockGainNode)
    expect(mockGainNode.connect).toHaveBeenCalledWith(destinationObj)

    // Start and Stop timing
    expect(mockOscillatorNode.start).toHaveBeenCalledWith(10)
    expect(mockOscillatorNode.stop).toHaveBeenCalledWith(10 + 1.5)

    // Cleanup onended
    expect(mockOscillatorNode.onended).toBeTypeOf('function')
    mockOscillatorNode.onended?.()
    expect(mockOscillatorNode.disconnect).toHaveBeenCalled()
    expect(mockGainNode.disconnect).toHaveBeenCalled()
  })

  it('supports webkitAudioContext when standard AudioContext is missing', () => {
    Object.defineProperty(globalThis, 'AudioContext', {
      value: undefined,
      configurable: true,
      writable: true,
    })
    if (typeof window !== 'undefined') {
      delete (window as unknown as { AudioContext?: unknown }).AudioContext
    }

    const mockContext = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: vi.fn().mockReturnValue({
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      resume: vi.fn().mockResolvedValue(undefined),
    }

    class MockWebkitAudioContext {
      constructor() {
        return mockContext as unknown as AudioContext
      }
    }

    Object.defineProperty(globalThis, 'webkitAudioContext', {
      value: MockWebkitAudioContext,
      configurable: true,
      writable: true,
    })

    const result = playCompletionBell()
    expect(result).toBe(true)
  })

  it('resumes suspended audio context if needed', () => {
    const resumeMock = vi.fn().mockResolvedValue(undefined)
    const mockContext = {
      currentTime: 0,
      state: 'suspended',
      destination: {},
      createOscillator: vi.fn().mockReturnValue({
        frequency: { setValueAtTime: vi.fn() },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        disconnect: vi.fn(),
      }),
      createGain: vi.fn().mockReturnValue({
        gain: {
          setValueAtTime: vi.fn(),
          linearRampToValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn(),
        },
        connect: vi.fn(),
        disconnect: vi.fn(),
      }),
      resume: resumeMock,
    }

    class MockAudioContext {
      constructor() {
        return mockContext as unknown as AudioContext
      }
    }

    Object.defineProperty(globalThis, 'AudioContext', {
      value: MockAudioContext,
      configurable: true,
      writable: true,
    })

    expect(playCompletionBell()).toBe(true)
    expect(resumeMock).toHaveBeenCalled()
  })

  it('safely handles internal exceptions and returns false', () => {
    const mockContext = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: vi.fn().mockImplementation(() => {
        throw new Error('Web Audio error')
      }),
      createGain: vi.fn(),
    }

    class MockAudioContext {
      constructor() {
        return mockContext as unknown as AudioContext
      }
    }

    Object.defineProperty(globalThis, 'AudioContext', {
      value: MockAudioContext,
      configurable: true,
      writable: true,
    })

    expect(playCompletionBell()).toBe(false)
  })
})
