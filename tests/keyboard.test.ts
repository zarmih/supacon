import { beforeEach, describe, expect, it, vi } from 'vitest'
import { handleKeyboardEvent, type KeyboardContext } from '../src/ui/keyboard'
import { createDraft } from '../src/domain/pause'

function makeKeyEvent(key: string, overrides: Partial<KeyboardEvent> = {}): KeyboardEvent {
  return {
    key,
    preventDefault: vi.fn(),
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    target: null,
    ...overrides,
  } as unknown as KeyboardEvent
}

describe('src/ui/keyboard.ts', () => {
  let ctx: KeyboardContext
  let calls: string[]

  beforeEach(() => {
    calls = []
    const draft = createDraft({
      id: 'p1',
      intent: 'browse',
      triggerId: 'instagram',
      now: Date.now(),
      minSeconds: 10,
      completedPauses: 5,
    })

    ctx = {
      route: { name: 'pause', intent: 'browse', triggerId: 'instagram' },
      pause: draft,
      confirm: null,
      haptics: true,
      readField: vi.fn(() => ''),
      setPause: vi.fn((p) => {
        ctx.pause = p
        calls.push('setPause')
      }),
      setConfirm: vi.fn((c) => {
        ctx.confirm = c
        calls.push('setConfirm')
      }),
      saveDraft: vi.fn(() => calls.push('saveDraft')),
      go: vi.fn(() => calls.push('go')),
      draw: vi.fn(() => calls.push('draw')),
      applyChoice: vi.fn(() => calls.push('applyChoice')),
    }
  })

  it('handles Escape by stepping back or navigating to today', () => {
    const event = makeKeyEvent('Escape')
    handleKeyboardEvent(event, ctx)

    expect(calls).toContain('go')
  })

  it('handles digit keys 1-9 and 0 for awareness scoring', () => {
    if (ctx.pause) ctx.pause.step = 'score'

    const event = makeKeyEvent('7')
    handleKeyboardEvent(event, ctx)

    expect(calls).toContain('setPause')
    expect(calls).toContain('saveDraft')
    expect(calls).toContain('draw')
    expect(ctx.pause?.awarenessBefore).toBe(7)
  })

  it('cycles seeking impulses with arrow keys', () => {
    if (ctx.pause) {
      ctx.pause.step = 'seeking'
      ctx.pause.seeking = 'boredom'
    }

    const event = makeKeyEvent('ArrowRight')
    handleKeyboardEvent(event, ctx)

    expect(calls).toContain('setPause')
    expect(calls).toContain('draw')
    expect(ctx.pause?.seeking).not.toBe('boredom')
  })

  it('handles choice hotkeys (O for open) when breath timer is ready', () => {
    if (ctx.pause) {
      ctx.pause.step = 'choose'
      ctx.pause.startedAt = Date.now() - 15_000
      ctx.pause.awarenessBefore = 8
      ctx.pause.seeking = 'habit'
    }

    const event = makeKeyEvent('o')
    handleKeyboardEvent(event, ctx)

    expect(ctx.applyChoice).toHaveBeenCalledWith('open')
  })
})
