import { describe, expect, it } from 'vitest'
import { settingsScreen } from '../src/ui/screens/more'
import { dictionary } from '../src/i18n'
import { emptyDatabase } from '../src/store/defaults'
import type { ViewModel } from '../src/ui/model'

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

describe('Settings Screen - Focus Sound Selection', () => {
  it('renders sound toggle and sound choice chips with defaults (gong selected)', () => {
    const view = mockViewModel()
    const html = settingsScreen(view)

    // Toggle sound
    expect(html).toContain('data-action="toggle-sound"')
    expect(html).toContain('aria-pressed="true"')

    // Focus sound fieldset
    expect(html).toContain('data-action="focus-sound" data-value="gong"')
    expect(html).toContain('data-action="focus-sound" data-value="bowl"')
    expect(html).toContain('data-action="focus-sound" data-value="chime"')

    // Default gong is active
    expect(html).toMatch(/class="chip is-on"[^>]*data-action="focus-sound"[^>]*data-value="gong"/)
    expect(html).toMatch(/data-action="focus-sound"[^>]*data-value="bowl"[^>]*aria-pressed="false"/)
    expect(html).toMatch(/data-action="focus-sound"[^>]*data-value="chime"[^>]*aria-pressed="false"/)
  })

  it('reflects selected sound when bowl or chime is chosen', () => {
    const view = mockViewModel()
    view.db.settings.focusSound = 'bowl'
    const htmlBowl = settingsScreen(view)
    expect(htmlBowl).toMatch(/class="chip is-on"[^>]*data-action="focus-sound"[^>]*data-value="bowl"/)
    expect(htmlBowl).toMatch(/data-action="focus-sound"[^>]*data-value="gong"[^>]*aria-pressed="false"/)

    view.db.settings.focusSound = 'chime'
    const htmlChime = settingsScreen(view)
    expect(htmlChime).toMatch(/class="chip is-on"[^>]*data-action="focus-sound"[^>]*data-value="chime"/)
    expect(htmlChime).toMatch(/data-action="focus-sound"[^>]*data-value="gong"[^>]*aria-pressed="false"/)
  })

  it('renders localized labels in Russian and English', () => {
    const viewEn = mockViewModel({ dict: dictionary('en') })
    const htmlEn = settingsScreen(viewEn)
    expect(htmlEn).toContain('Gong')
    expect(htmlEn).toContain('Singing bowl')
    expect(htmlEn).toContain('Soft chime')

    const viewRu = mockViewModel({ dict: dictionary('ru') })
    const htmlRu = settingsScreen(viewRu)
    expect(htmlRu).toContain('Гонг')
    expect(htmlRu).toContain('Поющая чаша')
    expect(htmlRu).toContain('Мягкий колокольчик')
  })
})
