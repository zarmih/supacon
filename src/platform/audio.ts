/**
 * Pure Web Audio API synthesis for mindful transitions.
 * No external sound files or network requests.
 * Uses a 432 Hz sine tone with smooth exponential decay (calm, meditative bell).
 */

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

/**
 * Soft, gentle completion bell for focus blocks.
 * Synthesizes a calming 432 Hz sine wave with a 1.5s exponential decay.
 * Volume is kept quiet and soothing.
 */
export function playCompletionBell(): boolean {
  try {
    const ctx = getAudioContext()
    if (!ctx) return false

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {})
    }

    const now = ctx.currentTime
    const duration = 1.5 // 1.5 seconds decay
    const frequency = 432 // 432 Hz calming bell pitch
    const peakGain = 0.15 // Gentle, not loud

    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(frequency, now)

    // Smooth clickless attack ramp (20ms)
    gain.gain.setValueAtTime(0.0001, now)
    gain.gain.linearRampToValueAtTime(peakGain, now + 0.02)

    // Smooth exponential decay over 1.5 seconds down to near silence
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + duration)

    osc.onended = () => {
      try {
        osc.disconnect()
        gain.disconnect()
      } catch {
        // Disconnect silently
      }
    }

    return true
  } catch {
    return false
  }
}
