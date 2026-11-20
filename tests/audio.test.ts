import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getAudioContext, playCompletionBell, playFocusSound, resetAudioContext, SOUND_PROFILES } from '../src/platform/audio'
import { checkFocusBell } from '../src/ui/timers'
import type { FocusBlock } from '../src/domain/types'

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

  it('synthesizes a Tibetan singing bowl with warm fundamental (288 Hz) and overtone (576 Hz)', () => {
    const createdOscs: Array<{
      type: string
      frequency: { setValueAtTime: ReturnType<typeof vi.fn> }
      connect: ReturnType<typeof vi.fn>
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
      onended: (() => void) | null
    }> = []
    const createdGains: Array<{
      gain: {
        setValueAtTime: ReturnType<typeof vi.fn>
        linearRampToValueAtTime: ReturnType<typeof vi.fn>
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
      }
      connect: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []

    const mockContext = {
      currentTime: 5,
      state: 'running',
      destination: {},
      createOscillator: vi.fn().mockImplementation(() => {
        const osc = {
          type: '',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
        }
        createdOscs.push(osc)
        return osc
      }),
      createGain: vi.fn().mockImplementation(() => {
        const g = {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        createdGains.push(g)
        return g
      }),
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

    const result = playCompletionBell('bowl')
    expect(result).toBe(true)

    expect(createdOscs).toHaveLength(2)
    expect(createdGains).toHaveLength(2)

    const osc0 = createdOscs[0]!
    const osc1 = createdOscs[1]!
    const gain0 = createdGains[0]!
    const gain1 = createdGains[1]!

    // Fundamental (288 Hz)
    expect(osc0.type).toBe('sine')
    expect(osc0.frequency.setValueAtTime).toHaveBeenCalledWith(288, 5)
    expect(gain0.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.12, 5 + 0.06)
    expect(gain0.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 5 + 2.0)
    expect(osc0.start).toHaveBeenCalledWith(5)
    expect(osc0.stop).toHaveBeenCalledWith(5 + 2.0)

    // Harmonic overtone (576 Hz)
    expect(osc1.type).toBe('sine')
    expect(osc1.frequency.setValueAtTime).toHaveBeenCalledWith(576, 5)
    expect(gain1.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.03, 5 + 0.06)
    expect(gain1.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 5 + 2.0)
    expect(osc1.start).toHaveBeenCalledWith(5)
    expect(osc1.stop).toHaveBeenCalledWith(5 + 2.0)

    // Cleanup onended
    expect(osc0.onended).toBeTypeOf('function')
    osc0.onended?.()
    expect(osc0.disconnect).toHaveBeenCalled()
    expect(osc1.disconnect).toHaveBeenCalled()
    expect(gain0.disconnect).toHaveBeenCalled()
    expect(gain1.disconnect).toHaveBeenCalled()
  })

  it('synthesizes a soft chime with silvery 864 Hz and 1296 Hz partials via playFocusSound', () => {
    const createdOscs: Array<{
      type: string
      frequency: { setValueAtTime: ReturnType<typeof vi.fn> }
      connect: ReturnType<typeof vi.fn>
      start: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
      onended: (() => void) | null
    }> = []
    const createdGains: Array<{
      gain: {
        setValueAtTime: ReturnType<typeof vi.fn>
        linearRampToValueAtTime: ReturnType<typeof vi.fn>
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>
      }
      connect: ReturnType<typeof vi.fn>
      disconnect: ReturnType<typeof vi.fn>
    }> = []

    const mockContext = {
      currentTime: 2,
      state: 'running',
      destination: {},
      createOscillator: vi.fn().mockImplementation(() => {
        const osc = {
          type: '',
          frequency: { setValueAtTime: vi.fn() },
          connect: vi.fn(),
          start: vi.fn(),
          stop: vi.fn(),
          disconnect: vi.fn(),
          onended: null,
        }
        createdOscs.push(osc)
        return osc
      }),
      createGain: vi.fn().mockImplementation(() => {
        const g = {
          gain: {
            setValueAtTime: vi.fn(),
            linearRampToValueAtTime: vi.fn(),
            exponentialRampToValueAtTime: vi.fn(),
          },
          connect: vi.fn(),
          disconnect: vi.fn(),
        }
        createdGains.push(g)
        return g
      }),
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

    const result = playFocusSound('chime')
    expect(result).toBe(true)

    expect(createdOscs).toHaveLength(2)
    expect(createdGains).toHaveLength(2)

    const chimeOsc0 = createdOscs[0]!
    const chimeOsc1 = createdOscs[1]!
    const chimeGain0 = createdGains[0]!
    const chimeGain1 = createdGains[1]!

    // Primary chime (864 Hz)
    expect(chimeOsc0.type).toBe('sine')
    expect(chimeOsc0.frequency.setValueAtTime).toHaveBeenCalledWith(864, 2)
    expect(chimeGain0.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.10, 2 + 0.01)
    expect(chimeGain0.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 2 + 1.2)
    expect(chimeOsc0.start).toHaveBeenCalledWith(2)
    expect(chimeOsc0.stop).toHaveBeenCalledWith(2 + 1.2)

    // Overtone (1296 Hz)
    expect(chimeOsc1.type).toBe('sine')
    expect(chimeOsc1.frequency.setValueAtTime).toHaveBeenCalledWith(1296, 2)
    expect(chimeGain1.gain.linearRampToValueAtTime).toHaveBeenCalledWith(0.02, 2 + 0.01)
    expect(chimeGain1.gain.exponentialRampToValueAtTime).toHaveBeenCalledWith(0.0001, 2 + 1.2)
  })

  it('falls back to gong (432 Hz) when given an unknown sound name', () => {
    const mockFreqParam = { setValueAtTime: vi.fn() }
    const mockContext = {
      currentTime: 0,
      state: 'running',
      destination: {},
      createOscillator: vi.fn().mockReturnValue({
        type: '',
        frequency: mockFreqParam,
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

    const result = playCompletionBell('unknown' as any)
    expect(result).toBe(true)
    expect(mockFreqParam.setValueAtTime).toHaveBeenCalledWith(432, 0)
  })

  it('exports sound profiles for all supported sounds', () => {
    expect(SOUND_PROFILES.gong.duration).toBe(1.5)
    expect(SOUND_PROFILES.bowl.duration).toBe(2.0)
    expect(SOUND_PROFILES.chime.duration).toBe(1.2)
  })

  describe('checkFocusBell integration', () => {
    const mockFocus: FocusBlock = {
      id: 'focus-1',
      startedAt: new Date(Date.now() - 46 * 60_000).toISOString(),
      plannedMinutes: 45,
      date: '2026-11-20',
      completed: false,
    }

    it('plays sound when focus is finished within 3 seconds and sound is enabled', () => {
      const onPlay = vi.fn()
      const now = new Date(mockFocus.startedAt).getTime() + 45 * 60_000 + 1000 // 1s past end
      const playedId = checkFocusBell(mockFocus, now, null, true, onPlay)

      expect(playedId).toBe('focus-1')
      expect(onPlay).toHaveBeenCalledTimes(1)
    })

    it('does not play sound when sound is disabled', () => {
      const onPlay = vi.fn()
      const now = new Date(mockFocus.startedAt).getTime() + 45 * 60_000 + 1000
      const playedId = checkFocusBell(mockFocus, now, null, false, onPlay)

      expect(playedId).toBe('focus-1')
      expect(onPlay).not.toHaveBeenCalled()
    })

    it('does not replay sound if already played for the same block', () => {
      const onPlay = vi.fn()
      const now = new Date(mockFocus.startedAt).getTime() + 45 * 60_000 + 1000
      const playedId = checkFocusBell(mockFocus, now, 'focus-1', true, onPlay)

      expect(playedId).toBe('focus-1')
      expect(onPlay).not.toHaveBeenCalled()
    })
  })
})
