/**
 * Pure Web Audio API synthesis for mindful transitions.
 * No external sound files or network requests.
 * Synthesizes gentle gong, Tibetan singing bowl, and soft chime.
 */

import { isFocusSound, type FocusSound } from '../domain/types'

type AudioContextClass = typeof AudioContext

function getAudioContextConstructor(): AudioContextClass | null {
  const win = typeof window !== 'undefined' ? (window as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass }) : null
  const glob = typeof globalThis !== 'undefined' ? (globalThis as unknown as { AudioContext?: AudioContextClass; webkitAudioContext?: AudioContextClass }) : null

  return win?.AudioContext || win?.webkitAudioContext || glob?.AudioContext || glob?.webkitAudioContext || null
}

let activeAudioContext: AudioContext | null = null

export function getAudioContext(): AudioContext | null {
  const Ctor = getAudioContextConstructor()
  if (!Ctor) return null
  try {
    if (!activeAudioContext || activeAudioContext.state === 'closed') {
      activeAudioContext = new Ctor()
    }
    return activeAudioContext
  } catch {
    return null
  }
}

/**
 * Reset cached audio context (useful for testing or cleanup).
 */
export function resetAudioContext(): void {
  activeAudioContext = null
}

export interface SoundPartial {
  frequency: number
  gain: number
  type?: OscillatorType
}

export interface SoundProfile {
  duration: number
  attack: number
  partials: SoundPartial[]
}

export const SOUND_PROFILES: Record<FocusSound, SoundProfile> = {
  gong: {
    duration: 1.5,
    attack: 0.02,
    partials: [{ frequency: 432, gain: 0.15, type: 'sine' }],
  },
  bowl: {
    duration: 2.0,
    attack: 0.06,
    partials: [
      { frequency: 288, gain: 0.12, type: 'sine' },
      { frequency: 576, gain: 0.03, type: 'sine' },
    ],
  },
  chime: {
    duration: 1.2,
    attack: 0.01,
    partials: [
      { frequency: 864, gain: 0.10, type: 'sine' },
      { frequency: 1296, gain: 0.02, type: 'sine' },
    ],
  },
}

/**
 * Synthesizes a mindful transition tone for focus completion.
 * Pure Web Audio API synthesis without binary assets.
 * Supports:
 * - 'gong': Meditative 432 Hz sine tone with 1.5s decay.
 * - 'bowl': Tibetan singing bowl with warm fundamental (288 Hz) and harmonic overtone (576 Hz).
 * - 'chime': Soft crystalline bell with silvery 864 Hz pitch and delicate overtone (1296 Hz).
 */
export function playCompletionBell(sound: FocusSound = 'gong'): boolean {
  try {
    const ctx = getAudioContext()
    if (!ctx) return false

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const soundKey: FocusSound = isFocusSound(sound) ? sound : 'gong'
    const profile = SOUND_PROFILES[soundKey] ?? SOUND_PROFILES.gong
    const now = ctx.currentTime

    const nodes: Array<{ osc: OscillatorNode; gain: GainNode }> = []

    for (const partial of profile.partials) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()

      osc.type = partial.type ?? 'sine'
      osc.frequency.setValueAtTime(partial.frequency, now)

      // Smooth clickless attack ramp
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.linearRampToValueAtTime(partial.gain, now + profile.attack)

      // Smooth exponential decay down to near silence
      gain.gain.exponentialRampToValueAtTime(0.0001, now + profile.duration)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now)
      osc.stop(now + profile.duration)

      nodes.push({ osc, gain })
    }

    const first = nodes[0]
    if (first) {
      first.osc.onended = () => {
        for (const { osc, gain } of nodes) {
          try {
            osc.disconnect()
            gain.disconnect()
          } catch {
            // Disconnect silently
          }
        }
      }
    }

    return true
  } catch {
    return false
  }
}

export const playFocusSound = playCompletionBell
