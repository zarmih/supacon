import { describe, expect, it } from 'vitest'
import { dictionary } from '../src/i18n'
import { emptyDatabase } from '../src/store/defaults'
import type { ViewModel } from '../src/ui/model'
import { formatBuildInfo, settingsScreen } from '../src/ui/screens/more'

function mockViewModel(overrides: Partial<ViewModel> = {}): ViewModel {
  const db = emptyDatabase()
  return {
    db,
    route: { name: 'settings' },
    now: Date.now(),
    pause: null,
    toast: null,
    flash: null,
    confirm: null,
    installReady: false,
    presets: [],
    customs: [],
    form: { unlogged: 0, pendingEnd: false },
    fields: {},
    dict: dictionary('en'),
    ...overrides,
  }
}

describe('Settings Screen - Build Date / Version & ICS Export', () => {
  describe('formatBuildInfo', () => {
    it('formats ISO timestamps into YYYY-MM-DD date', () => {
      const info = formatBuildInfo('2026-11-20T14:30:00.000Z')
      expect(info).toBe('Build: 2026-11-20')
    })

    it('formats date and version when version is provided', () => {
      const info = formatBuildInfo('2026-11-20T14:30:00.000Z', '0.1.0')
      expect(info).toBe('Build: 2026-11-20 (0.1.0)')
    })

    it('handles custom version tags with prefixes like v0.2.1-beta', () => {
      const info = formatBuildInfo('2026-12-01', 'v0.2.1-beta')
      expect(info).toBe('Build: 2026-12-01 (v0.2.1-beta)')
    })

    it('omits version parentheses when version is empty string', () => {
      const info = formatBuildInfo('2026-11-20', '')
      expect(info).toBe('Build: 2026-11-20')
    })

    it('falls back to default build date when called without arguments', () => {
      const info = formatBuildInfo()
      expect(info).toMatch(/^Build: \d{4}-\d{2}-\d{2}/)
    })
  })

  describe('settingsScreen rendering', () => {
    it('renders build date and provenance in Settings HTML', () => {
      const view = mockViewModel()
      const html = settingsScreen(view)

      expect(html).toContain('<p class="muted">Build: ')
      expect(html).toMatch(/<p class="muted">Build: \d{4}-\d{2}-\d{2}/)
    })

    it('renders the .ics calendar export action button in choice list', () => {
      const view = mockViewModel({ dict: dictionary('en') })
      const html = settingsScreen(view)

      expect(html).toContain('data-action="export-ics"')
      expect(html).toContain('Export calendar (.ics)')
      expect(html).toContain('data-action="export-csv"')
      expect(html).toContain('data-action="export-diary"')
    })

    it('renders localized export .ics button in Russian locale', () => {
      const view = mockViewModel({ dict: dictionary('ru') })
      const html = settingsScreen(view)

      expect(html).toContain('data-action="export-ics"')
      expect(html).toContain('Экспорт календаря (.ics)')
      expect(html).toContain('Экспорт CSV (.csv)')
    })
  })
})
