import { describe, expect, it } from 'vitest'
import { emptyDatabase } from '../src/store/defaults'
import { en } from '../src/i18n/en'
import { ru } from '../src/i18n/ru'
import { emptyForm, type ViewModel } from '../src/ui/model'
import { parseHash, routeKey } from '../src/ui/route'
import { detectPlatform, pauseLink, quickScreen } from '../src/ui/screens/quick'
import { pauseScreen } from '../src/ui/screens/pause'

function view(overrides: Partial<ViewModel> = {}): ViewModel {
  const db = emptyDatabase()
  db.onboardingComplete = true
  db.triggers = [
    { id: 'instagram', label: 'Instagram', enabled: true, preset: true, createdAt: '2026-10-17' },
    { id: 'telegram', label: 'Telegram', enabled: false, preset: false, createdAt: '2026-10-17' },
    { id: 'my app', label: 'My app', enabled: true, preset: false, createdAt: '2026-10-17' },
  ]
  return {
    db,
    dict: en,
    route: { name: 'quick' },
    now: Date.now(),
    pause: null,
    toast: null,
    flash: null,
    confirm: null,
    installReady: false,
    presets: [],
    customs: [],
    form: emptyForm(),
    fields: {},
    ...overrides,
  }
}

describe('quick entry routes', () => {
  it('maps the old bridge address and keeps the chosen trigger', () => {
    expect(parseHash('#/bridge')).toEqual({ name: 'quick' })
    expect(parseHash('#/quick?trigger=instagram')).toEqual({ name: 'quick', triggerId: 'instagram' })
    expect(routeKey({ name: 'quick', triggerId: 'a' })).toBe(routeKey({ name: 'quick', triggerId: 'b' }))
  })

  it('marks a test launch without changing the trigger', () => {
    expect(parseHash('#/pause/instagram?check=1')).toEqual({ name: 'pause', intent: 'browse', triggerId: 'instagram', check: true })
    expect(parseHash('#/pause/instagram')).toEqual({ name: 'pause', intent: 'browse', triggerId: 'instagram' })
    expect(routeKey(parseHash('#/pause/instagram?check=1'))).not.toBe(routeKey(parseHash('#/pause/instagram')))
  })
})

describe('pauseLink and detectPlatform', () => {
  it('builds an absolute link from the current page, dropping any hash', () => {
    expect(pauseLink('https://x.example/app/#/quick?trigger=a', 'my app')).toBe('https://x.example/app/#/pause/my%20app')
    expect(parseHash(pauseLink('https://x.example/', 'my app').split('#')[1] ?? '')).toMatchObject({ triggerId: 'my app' })
  })

  it('recognises phones by user agent, iPadOS by touch points', () => {
    expect(detectPlatform('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5)).toBe('ios')
    expect(detectPlatform('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0)).toBe('desktop')
    expect(detectPlatform('Mozilla/5.0 (Linux; Android 15; Pixel 7)')).toBe('android')
  })
})

describe('quickScreen', () => {
  it('offers only enabled triggers and a link for the selected one', () => {
    const html = quickScreen(view({ route: { name: 'quick', triggerId: 'my app' } }))
    expect(html).toContain('#/quick?trigger=instagram')
    expect(html).not.toContain('trigger=telegram')
    expect(html).toContain('#/pause/my%20app?check=1')
    expect(html).toContain('data-action="copy-bridge"')
    expect(html).toContain('Open URLs')
    expect(html).toContain('What Supacon cannot do')
  })

  it('falls back to the first enabled trigger and says when none is on', () => {
    expect(quickScreen(view({ route: { name: 'quick', triggerId: 'telegram' } }))).toContain('#/pause/instagram?check=1')
    const none = view({ dict: ru })
    none.db.triggers = none.db.triggers.map((trigger) => ({ ...trigger, enabled: false }))
    const html = quickScreen(none)
    expect(html).toContain(ru.quick.pickNone)
    expect(html).not.toContain('copy-bridge')
  })

  it('never promises interception or background notifications', () => {
    for (const dict of [en, ru]) {
      const text = JSON.stringify(dict.quick).toLowerCase()
      expect(text).not.toMatch(/blocks? the app|intercepts|перехватывает приложени/)
    }
  })
})

describe('pause screen trigger states', () => {
  it('explains a switched-off trigger and offers to turn it on', () => {
    const html = pauseScreen(view({ route: { name: 'pause', intent: 'browse', triggerId: 'telegram' } }))
    expect(html).toContain('data-state="disabled"')
    expect(html).toContain('Telegram is switched off')
    expect(html).toContain('data-action="enable-and-pause"')
  })

  it('explains an unknown trigger without substituting another', () => {
    const html = pauseScreen(view({ route: { name: 'pause', intent: 'browse', triggerId: 'snapchat' } }))
    expect(html).toContain('data-state="unknown"')
    expect(html).toContain('“snapchat”')
    expect(html).not.toContain('enable-and-pause')
    expect(html).toContain('href="#/pause"')
  })

  it('shows a test launch as a check, with no ritual', () => {
    const html = pauseScreen(view({ route: { name: 'pause', intent: 'browse', triggerId: 'instagram', check: true } }))
    expect(html).toContain('data-state="check"')
    expect(html).not.toContain('data-action="arrive"')
  })
})
