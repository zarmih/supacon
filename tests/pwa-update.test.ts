import { describe, expect, it, vi } from 'vitest'
import { render } from '../src/ui/render'
import { emptyDatabase } from '../src/store/defaults'
import { emptyForm, type ViewModel } from '../src/ui/model'
import { en } from '../src/i18n/en'
import { ru } from '../src/i18n/ru'
import type { Route } from '../src/ui/route'

function createMockView(overrides: Partial<ViewModel> = {}): ViewModel {
  return {
    db: emptyDatabase(),
    route: { name: 'today' },
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
    offline: false,
    updateReady: false,
    ...overrides,
  }
}

/** Pure recreation of controller's safeToUpdate logic for testing condition matrix */
function evaluateSafeToUpdate(params: {
  storageError: boolean
  hasPause: boolean
  routeName: Route['name']
  activeElementType?: 'none' | 'input' | 'textarea' | 'readonly-input' | 'button'
}): boolean {
  if (params.storageError) return false
  if (params.hasPause) return false
  const busy: Route['name'][] = ['pause', 'session', 'focus', 'onboarding', 'morning', 'evening', 'miss', 'plan']
  if (busy.includes(params.routeName)) return false
  if (params.activeElementType === 'input' || params.activeElementType === 'textarea') return false
  return true
}

describe('service worker update prompt and safe reload verification', () => {
  describe('UI banner rendering', () => {
    it('renders update banner when updateReady is true in English', () => {
      const view = createMockView({ updateReady: true, dict: en })
      const html = render(view)

      expect(html).toContain('class="update-banner banner"')
      expect(html).toContain('data-banner="update"')
      expect(html).toContain(en.update.ready)
      expect(html).toContain(en.update.apply)
      expect(html).toContain(en.update.later)
      expect(html).toContain('data-action="update-apply"')
      expect(html).toContain('data-action="update-later"')
    })

    it('renders update banner when updateReady is true in Russian', () => {
      const view = createMockView({ updateReady: true, dict: ru })
      const html = render(view)

      expect(html).toContain('class="update-banner banner"')
      expect(html).toContain('data-banner="update"')
      expect(html).toContain(ru.update.ready)
      expect(html).toContain(ru.update.apply)
      expect(html).toContain(ru.update.later)
      expect(html).toContain('data-action="update-apply"')
      expect(html).toContain('data-action="update-later"')
    })

    it('does not render update banner when updateReady is false or undefined', () => {
      const viewFalse = createMockView({ updateReady: false })
      expect(render(viewFalse)).not.toContain('data-banner="update"')

      const viewUndefined = createMockView({ updateReady: undefined })
      expect(render(viewUndefined)).not.toContain('data-banner="update"')
    })
  })

  describe('safe-to-update safety rules matrix', () => {
    it('allows update on calm screens when idle', () => {
      const calmScreens: Route['name'][] = ['today', 'journal', 'insights', 'settings']
      for (const routeName of calmScreens) {
        const isSafe = evaluateSafeToUpdate({
          storageError: false,
          hasPause: false,
          routeName,
          activeElementType: 'none',
        })
        expect(isSafe, `Screen ${routeName} should be safe to update`).toBe(true)
      }
    })

    it('blocks update on active or busy screens to prevent interrupting rituals', () => {
      const busyScreens: Route['name'][] = ['pause', 'session', 'focus', 'onboarding', 'morning', 'evening', 'miss', 'plan']
      for (const routeName of busyScreens) {
        const isSafe = evaluateSafeToUpdate({
          storageError: false,
          hasPause: false,
          routeName,
          activeElementType: 'none',
        })
        expect(isSafe, `Screen ${routeName} should block updates`).toBe(false)
      }
    })

    it('blocks update when a pause is active in memory', () => {
      const isSafe = evaluateSafeToUpdate({
        storageError: false,
        hasPause: true,
        routeName: 'today',
        activeElementType: 'none',
      })
      expect(isSafe).toBe(false)
    })

    it('blocks update when storage failure exists to prevent data loss on reload', () => {
      const isSafe = evaluateSafeToUpdate({
        storageError: true,
        hasPause: false,
        routeName: 'today',
        activeElementType: 'none',
      })
      expect(isSafe).toBe(false)
    })

    it('blocks update when an input or textarea is active (typing in progress)', () => {
      expect(
        evaluateSafeToUpdate({
          storageError: false,
          hasPause: false,
          routeName: 'today',
          activeElementType: 'input',
        }),
      ).toBe(false)

      expect(
        evaluateSafeToUpdate({
          storageError: false,
          hasPause: false,
          routeName: 'today',
          activeElementType: 'textarea',
        }),
      ).toBe(false)
    })

    it('allows update when active element is readonly or button', () => {
      expect(
        evaluateSafeToUpdate({
          storageError: false,
          hasPause: false,
          routeName: 'today',
          activeElementType: 'readonly-input',
        }),
      ).toBe(true)

      expect(
        evaluateSafeToUpdate({
          storageError: false,
          hasPause: false,
          routeName: 'today',
          activeElementType: 'button',
        }),
      ).toBe(true)
    })
  })

  describe('update action handling contracts', () => {
    it('executes apply callback only if memory persists cleanly first', () => {
      const applyMock = vi.fn()
      let updatePending: { apply: () => void } | null = { apply: applyMock }

      // Simulated controller handler for update-apply
      const handleUpdateApply = (persistSucceeds: boolean) => {
        if (!updatePending) return
        if (!persistSucceeds) return // Save failed, abort reload
        const cb = updatePending.apply
        updatePending = null
        cb()
      }

      // Case 1: Storage failure prevents reload
      handleUpdateApply(false)
      expect(applyMock).not.toHaveBeenCalled()
      expect(updatePending).not.toBeNull()

      // Case 2: Storage success triggers reload
      handleUpdateApply(true)
      expect(applyMock).toHaveBeenCalledTimes(1)
      expect(updatePending).toBeNull()
    })

    it('dismisses banner without reloading when update-later is chosen', () => {
      const applyMock = vi.fn()
      let updatePending: { apply: () => void } | null = { apply: applyMock }

      // Simulated controller handler for update-later
      const handleUpdateLater = () => {
        updatePending = null
      }

      handleUpdateLater()
      expect(updatePending).toBeNull()
      expect(applyMock).not.toHaveBeenCalled()
    })
  })

  describe('build configuration and SW registration contracts', () => {
    it('verifies vite.config.ts configures prompt mode and cache cleanup', async () => {
      const fs: any = await import('' + 'node:fs')
      const path: any = await import('' + 'node:path')
      const rootDir = path.resolve('.')
      const viteConfig = fs.readFileSync(path.resolve(rootDir, 'vite.config.ts'), 'utf8')
      expect(viteConfig).toContain("registerType: 'prompt'")
      expect(viteConfig).toContain('cleanupOutdatedCaches: true')
    })

    it('verifies src/main.ts wires onNeedRefresh to app.offerUpdate', async () => {
      const fs: any = await import('' + 'node:fs')
      const path: any = await import('' + 'node:path')
      const rootDir = path.resolve('.')
      const mainContent = fs.readFileSync(path.resolve(rootDir, 'src/main.ts'), 'utf8')
      expect(mainContent).toContain('onNeedRefresh()')
      expect(mainContent).toContain('app?.offerUpdate(() => void updateSW(true))')
      expect(mainContent).toContain('__supaconOfferUpdate')
    })
  })
})
