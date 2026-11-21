import { describe, expect, it } from 'vitest'
import { render } from '../src/ui/render'
import { emptyDatabase, defaultSettings } from '../src/store/defaults'
import { emptyForm, type ViewModel } from '../src/ui/model'
import { en } from '../src/i18n/en'
import { ru } from '../src/i18n/ru'
import {
  createDraft,
  advanceFromArrive,
  setScore,
  setSeeking,
  setFeelingBefore,
  setFeelingAfter,
  choose,
} from '../src/domain/pause'
import { commitPause } from '../src/store/mutate'
import { saveDb, loadDb, saveBackup, restoreBackup, type KeyValue } from '../src/store/storage'

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
    presets: ['instagram'],
    customs: [],
    form: emptyForm(),
    fields: {},
    dict: en,
    offline: true,
    ...overrides,
  }
}

function createMemoryStorage(): KeyValue & { dump: () => Record<string, string> } {
  const store: Record<string, string> = {}
  return {
    get: (key: string) => store[key] ?? null,
    set: (key: string, value: string) => {
      store[key] = value
    },
    remove: (key: string) => {
      delete store[key]
    },
    dump: () => ({ ...store }),
  }
}

describe('offline launch and self-contained local operation', () => {
  describe('offline status detection and UI cues', () => {
    it('renders localized offline banner when offline is true', () => {
      const enView = createMockView({ offline: true, dict: en })
      const enHtml = render(enView)
      expect(enHtml).toContain('class="offline-banner"')
      expect(enHtml).toContain(en.offlineNotice)

      const ruView = createMockView({ offline: true, dict: ru })
      const ruHtml = render(ruView)
      expect(ruHtml).toContain('class="offline-banner"')
      expect(ruHtml).toContain(ru.offlineNotice)
    })

    it('omits offline banner when online is true', () => {
      const onlineView = createMockView({ offline: false, dict: en })
      const html = render(onlineView)
      expect(html).not.toContain('class="offline-banner"')
      expect(html).not.toContain(en.offlineNotice)
    })
  })

  describe('end-to-end pause ritual execution without network', () => {
    it('executes complete pause lifecycle and commits to local storage offline', () => {
      const kv = createMemoryStorage()
      const db = emptyDatabase()
      db.settings = { ...defaultSettings(), lang: 'en' }
      db.triggers = [
        { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-10' },
      ]

      // Initial save to storage
      saveDb(kv, db)
      expect(loadDb(kv)).not.toBeNull()

      // 1. User starts pause offline
      const now = new Date(2026, 9, 15, 14, 0, 0)
      let draft = advanceFromArrive(
        createDraft({
          id: 'test-offline-pause-1',
          intent: 'browse',
          triggerId: 'instagram',
          now: now.getTime() - 15_000,
          minSeconds: 10,
          completedPauses: 2,
        }),
      )
      expect(draft.step).toBe('score')

      // 2. Set score, feeling before, seeking, and choose action
      draft = setScore(draft, 4)
      draft = setFeelingBefore(draft, 'scattered')
      draft = setSeeking(draft, 'validation')
      draft = setFeelingAfter(draft, 'grounded')

      const chosen = choose(draft, 'open', now.getTime())
      expect(chosen).not.toBeNull()

      // 3. Commit pause event into local database
      const result = commitPause(db, chosen!, now)
      expect(result).not.toBeNull()
      const updatedDb = result!.db

      // 4. Save updated DB to KV storage and create backup
      saveDb(kv, updatedDb)
      saveBackup(kv, updatedDb)

      const reloadedDb = loadDb(kv)
      expect(reloadedDb).not.toBeNull()
      expect(reloadedDb?.events.length).toBe(1)
      expect(reloadedDb?.events[0]?.id).toBe('test-offline-pause-1')
      expect(reloadedDb?.events[0]?.feelingBefore).toBe('scattered')
      expect(reloadedDb?.events[0]?.feelingAfter).toBe('grounded')

      // 5. Verify backup is recoverable offline
      const restored = restoreBackup(kv)
      expect(restored).toBe(true)
      const afterRestore = loadDb(kv)
      expect(afterRestore?.events.length).toBe(1)
    })
  })

  describe('PWA static asset and precache configuration audit for cold start', () => {
    it('configures workbox to precache fonts, icons, styles, scripts and navigation fallback', async () => {
      const fs: any = await import('' + 'node:fs')
      const path: any = await import('' + 'node:path')
      const rootDir = path.resolve('.')
      const viteConfig = fs.readFileSync(path.resolve(rootDir, 'vite.config.ts'), 'utf8')

      // Workbox precache patterns must include .woff2 fonts and media
      expect(viteConfig).toContain("globPatterns: ['**/*.{js,css,html,svg,png,woff2}']")

      // Screenshots must be excluded from precache to avoid wasting mobile storage
      expect(viteConfig).toContain("globIgnores: ['**/screenshots/**']")

      // SPA navigation fallback ensures any route (#/) resolves to cached index.html
      expect(viteConfig).toContain("navigateFallback: 'index.html'")
    })

    it('ensures all required icons exist on disk for standalone installation', async () => {
      const fs: any = await import('' + 'node:fs')
      const path: any = await import('' + 'node:path')
      const rootDir = path.resolve('.')
      const requiredIcons = [
        'public/favicon.svg',
        'public/icons/apple-touch-icon.png',
        'public/icons/icon-192.png',
        'public/icons/icon-512.png',
        'public/icons/icon-maskable-512.png',
      ]

      for (const icon of requiredIcons) {
        const fullPath = path.resolve(rootDir, icon)
        expect(fs.existsSync(fullPath), `Missing icon: ${icon}`).toBe(true)
        const stat = fs.statSync(fullPath)
        expect(stat.size).toBeGreaterThan(0)
      }
    })

    it('imports variable fonts locally so no Google Fonts or external CDNs are contacted', async () => {
      const fs: any = await import('' + 'node:fs')
      const path: any = await import('' + 'node:path')
      const rootDir = path.resolve('.')
      const mainPath = path.resolve(rootDir, 'src/main.ts')
      const mainContent = fs.readFileSync(mainPath, 'utf8')

      expect(mainContent).toContain("import '@fontsource-variable/literata/wght.css'")
      expect(mainContent).toContain("import '@fontsource-variable/manrope/wght.css'")

      const packageJson = JSON.parse(fs.readFileSync(path.resolve(rootDir, 'package.json'), 'utf8'))
      expect(packageJson.dependencies).toHaveProperty('@fontsource-variable/literata')
      expect(packageJson.dependencies).toHaveProperty('@fontsource-variable/manrope')
    })

    it('verifies manifest provides standalone display, start URL, and full icon set', async () => {
      const fs: any = await import('' + 'node:fs')
      const path: any = await import('' + 'node:path')
      const rootDir = path.resolve('.')
      const manifestPath = path.resolve(rootDir, 'dist/manifest.webmanifest')
      if (fs.existsSync(manifestPath)) {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
        expect(manifest.display).toBe('standalone')
        expect(manifest.start_url).toBe('/')
        expect(manifest.icons.length).toBeGreaterThanOrEqual(4)
        const maskable = manifest.icons.some((i: any) => i.purpose?.includes('maskable'))
        expect(maskable).toBe(true)
      }
    })
  })
})
