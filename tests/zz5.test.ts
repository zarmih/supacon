import { describe, it } from 'vitest'
import { playCompletionBell, resetAudioContext } from '../src/platform/audio'
import { remaining } from '../src/ui/screens/unfinished'

function makeCtx(state: string) {
  const nodes: any[] = []
  const ctx: any = {
    currentTime: 5,
    state,
    destination: {},
    createOscillator: () => {
      const n: any = { type: '', frequency: { setValueAtTime: () => {} }, connect: () => {}, start: () => {}, stop: () => {}, disconnect: () => {}, onended: null }
      nodes.push(n)
      return n
    },
    createGain: () => {
      const n: any = { gain: { setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} }, connect: () => {}, disconnect: () => {} }
      return n
    },
    resume: () => Promise.resolve(),
  }
  return { ctx, nodes }
}

describe('probe2', () => {
  it('suspended context: does the tone get scheduled?', async () => {
    resetAudioContext()
    const { ctx, nodes } = makeCtx('suspended')
    ;(globalThis as any).AudioContext = class {
      constructor() {
        return ctx
      }
    }
    const ok = playCompletionBell('bowl')
    console.log('RESULT:', ok, 'oscillators:', nodes.length, 'started:', nodes.map((n) => n.start.mock?.calls ?? 'plain'))
    console.log('onended is function:', typeof nodes[0]?.onended)
    resetAudioContext()
  })

  it('remaining() rendering', () => {
    const now = 1_700_000_000_000
    for (const at of [now, now - 1000, now - 3 * 3600_000 - 1, now - 24 * 3600_000, now - 48 * 3600_000]) {
      console.log('left', now - at, '->', remaining(at, now))
    }
  })

  it('resetAudioContext leaks the old context?', () => {
    const { ctx } = makeCtx('running')
    ;(globalThis as any).AudioContext = class {
      constructor() {
        return ctx
      }
    }
    playCompletionBell('gong')
    resetAudioContext()
    console.log('old context state after reset (no close call available):', ctx.state)
  })
})