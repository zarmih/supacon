import { describe, expect, it, vi } from 'vitest'
import { selectorFor, trapTab } from '../src/ui/focus'

function mockElement(tag: string, attrs: Record<string, string> = {}): Element {
  return {
    tagName: tag.toUpperCase(),
    id: attrs.id ?? '',
    getAttribute: (name: string) => (name in attrs ? attrs[name] : null),
  } as unknown as Element
}

describe('src/ui/focus.ts', () => {
  describe('selectorFor', () => {
    it('uses element id when present', () => {
      const el = mockElement('button', { id: 'step-title' })
      expect(selectorFor(el)).toBe('#step-title')
    })

    it('builds selector for stepper buttons with data-action, data-key, data-dir', () => {
      const el = mockElement('button', {
        'data-action': 'step',
        'data-key': 'maxSessionsPerDay',
        'data-dir': '1',
      })
      expect(selectorFor(el)).toBe('button[data-action="step"][data-key="maxSessionsPerDay"][data-dir="1"]')
    })

    it('builds selector for sound chips with data-action and data-value', () => {
      const el = mockElement('button', {
        'data-action': 'focus-sound',
        'data-value': 'bowl',
      })
      expect(selectorFor(el)).toBe('button[data-action="focus-sound"][data-value="bowl"]')
    })

    it('builds selector for trigger toggles using data-id', () => {
      const el = mockElement('button', {
        'data-action': 'toggle-trigger',
        'data-id': 'instagram',
      })
      expect(selectorFor(el)).toBe('button[data-action="toggle-trigger"][data-id="instagram"]')
    })

    it('builds selector for breath toggle button', () => {
      const el = mockElement('button', {
        'data-action': 'toggle-breath',
      })
      expect(selectorFor(el)).toBe('button[data-action="toggle-breath"]')
    })

    it('builds selector for links with href', () => {
      const el = mockElement('a', {
        href: '#/settings',
      })
      expect(selectorFor(el)).toBe('a[href="#/settings"]')
    })

    it('builds selector for named inputs', () => {
      const el = mockElement('input', {
        name: 'finish',
      })
      expect(selectorFor(el)).toBe('input[name="finish"]')
    })
  })

  describe('trapTab', () => {
    it('ignores non-Tab key events', () => {
      const event = { key: 'Enter', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent
      const root = {} as HTMLElement
      expect(trapTab(event, root)).toBe(false)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('returns false when no dialog is found in root', () => {
      const event = { key: 'Tab', shiftKey: false, preventDefault: vi.fn() } as unknown as KeyboardEvent
      const root = { querySelector: () => null } as unknown as HTMLElement
      expect(trapTab(event, root)).toBe(false)
      expect(event.preventDefault).not.toHaveBeenCalled()
    })
  })
})
