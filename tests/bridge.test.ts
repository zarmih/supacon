import { describe, expect, it } from 'vitest'
import { emptyDatabase } from '../src/store/defaults'
import { en } from '../src/i18n/en'
import { ru } from '../src/i18n/ru'
import { emptyForm } from '../src/ui/model'
import { bridgeScreen } from '../src/ui/screens/more'

describe('bridge screen', () => {
  it('renders copy buttons and pause links for enabled triggers', () => {
    const db = emptyDatabase()
    db.triggers = [
      { id: 'instagram', label: 'Instagram', enabled: true, preset: true, createdAt: '2026-10-17' },
      { id: 'telegram', label: 'Telegram', enabled: false, preset: true, createdAt: '2026-10-17' },
      { id: 'custom-app', label: 'Custom App', enabled: true, preset: false, createdAt: '2026-10-17' },
    ]

    const html = bridgeScreen({
      db,
      dict: en,
      route: { name: 'bridge' },
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
    })

    expect(html).toContain('data-action="copy-bridge"')
    expect(html).toContain('data-url="#/pause/instagram"')
    expect(html).toContain('data-url="#/pause/custom-app"')
    expect(html).not.toContain('data-url="#/pause/telegram"')
    expect(html).toContain('#/pause/instagram')
    expect(html).toContain('bridge-steps')
    expect(html).toContain('Open &quot;Shortcuts&quot;')
  })

  it('renders note when no triggers are enabled', () => {
    const db = emptyDatabase()
    db.triggers = [{ id: 'instagram', label: 'Instagram', enabled: false, preset: true, createdAt: '2026-10-17' }]

    const html = bridgeScreen({
      db,
      dict: ru,
      route: { name: 'bridge' },
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
    })

    expect(html).toContain(ru.bridge.none)
    expect(html).toContain('#/triggers')
    expect(html).not.toContain('data-action="copy-bridge"')
  })

  it('i18n bridge dictionaries contain all required keys with matching structure', () => {
    const enKeys = Object.keys(en.bridge).sort()
    const ruKeys = Object.keys(ru.bridge).sort()
    expect(enKeys).toEqual(ruKeys)

    expect(en.bridge.copy).toBeTruthy()
    expect(ru.bridge.copy).toBe('Скопировать ссылку')
    expect(en.bridge.copied).toBeTruthy()
    expect(ru.bridge.copied).toBe('Ссылка скопирована')
    expect(en.bridge.test).toBeTruthy()
    expect(ru.bridge.test).toBe('Проверить')

    expect(en.bridge.iphoneSteps.length).toBeGreaterThanOrEqual(4)
    expect(ru.bridge.iphoneSteps.length).toBeGreaterThanOrEqual(4)
    expect(ru.bridge.iphoneSteps.some((step) => step.includes('Автоматизация'))).toBe(true)
    expect(ru.bridge.iphoneSteps.some((step) => step.includes('Приложение'))).toBe(true)
    expect(ru.bridge.iphoneSteps.some((step) => step.includes('Открыть URL'))).toBe(true)
  })
})
