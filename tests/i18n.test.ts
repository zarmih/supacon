import { describe, expect, it } from 'vitest'
import { dictionary, getLocale, pluralEn, pluralRu, resolveLang } from '../src/i18n'
import { en } from '../src/i18n/en'
import { ru } from '../src/i18n/ru'

type Leaf = { path: string; value: unknown }

function leaves(value: unknown, path = ''): Leaf[] {
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) =>
      leaves(child, path ? `${path}.${key}` : key),
    )
  }
  return [{ path, value }]
}

const enLeaves = leaves(en)
const ruLeaves = leaves(ru)

describe('i18n dictionaries', () => {
  it('en and ru have identical key sets', () => {
    const enKeys = enLeaves.map((leaf) => leaf.path).sort()
    const ruKeys = ruLeaves.map((leaf) => leaf.path).sort()
    expect(ruKeys).toEqual(enKeys)
  })

  it('leaves have matching kinds (string / function arity / array length)', () => {
    const ruByPath = new Map(ruLeaves.map((leaf) => [leaf.path, leaf.value]))
    for (const { path, value } of enLeaves) {
      const other = ruByPath.get(path)
      expect(typeof other, path).toBe(typeof value)
      if (typeof value === 'function') expect((other as () => unknown).length, path).toBe(value.length)
      if (Array.isArray(value)) expect((other as unknown[]).length, path).toBe(value.length)
    }
  })

  it('has no empty string values', () => {
    for (const { path, value } of [...enLeaves, ...ruLeaves]) {
      if (typeof value === 'string') expect(value.trim(), path).not.toBe('')
      if (Array.isArray(value)) {
        for (const item of value) expect(String(item).trim(), path).not.toBe('')
      }
    }
  })

  it('function values return non-empty strings', () => {
    for (const { path, value } of [...enLeaves, ...ruLeaves]) {
      if (typeof value !== 'function') continue
      // Strings are safe for every parameter type used in the dictionaries (labels, hours, numbers in templates).
      const args = Array.from({ length: value.length }, () => '3')
      const out = (value as (...a: unknown[]) => unknown)(...args)
      expect(typeof out, path).toBe('string')
      expect(String(out).trim(), path).not.toBe('')
    }
  })

  it('english dictionary contains no Cyrillic except the native name of Russian', () => {
    for (const { path, value } of enLeaves) {
      if (path === 'settingsScreen.russian') continue
      if (typeof value === 'string') expect(value, path).not.toMatch(/[\u0400-\u04FF]/)
    }
  })

  it('exposes an explicit locale on each dictionary', () => {
    expect(en.locale).toBe('en')
    expect(ru.locale).toBe('ru')
    expect(getLocale(dictionary('en'))).toBe('en')
    expect(getLocale(dictionary('ru'))).toBe('ru')
    expect(getLocale(dictionary(resolveLang('auto', 'ru-RU')))).toBe('ru')
    expect(getLocale(dictionary(resolveLang('auto', 'en-US')))).toBe('en')
  })
})

describe('plural forms', () => {
  it('pluralRu picks one / few / many correctly', () => {
    const f = (n: number) => pluralRu(n, 'пауза', 'паузы', 'пауз')
    expect([0, 1, 2, 4, 5, 11, 12, 14, 15, 21, 22, 25, 101, 111, 112, 122].map(f)).toEqual([
      'пауз', 'пауза', 'паузы', 'паузы', 'пауз', 'пауз', 'пауз', 'пауз', 'пауз', 'пауза', 'паузы', 'пауз', 'пауза', 'пауз', 'пауз', 'паузы',
    ])
  })

  it('pluralEn picks singular only for 1', () => {
    expect(pluralEn(1, 'pause', 'pauses')).toBe('pause')
    expect(pluralEn(0, 'pause', 'pauses')).toBe('pauses')
    expect(pluralEn(2, 'pause', 'pauses')).toBe('pauses')
  })

  it('russian counted strings agree with 1 / 2 / 5', () => {
    expect(ru.home.missesLoggedToday(1)).toBe('Записан 1 пропуск сегодня')
    expect(ru.home.missesLoggedToday(2)).toBe('Записано 2 пропуска сегодня')
    expect(ru.home.missesLoggedToday(5)).toBe('Записано пропусков сегодня: 5')
    expect(ru.home.missesLoggedToday(21)).toBe('Записан 21 пропуск сегодня')
    expect(ru.home.sessionsOpen(1)).toBe('1 сессия')
    expect(ru.home.sessionsOpen(3)).toBe('3 сессии')
    expect(ru.home.sessionsOpen(5)).toBe('5 сессий')
    expect(ru.home.stats('6.0', 1, 0)).toContain('1 пауза')
    expect(ru.home.stats('6.0', 2, 0)).toContain('2 паузы')
    expect(ru.home.stats('6.0', 5, 0)).toContain('5 пауз')
    expect(ru.home.protocolPauses(1)).toBe('За 7 дней пройдена 1 пауза.')
    expect(ru.home.protocolPauses(3)).toBe('За 7 дней пройдено 3 паузы.')
    expect(ru.home.protocolPauses(12)).toBe('За 7 дней пройдено 12 пауз.')
    expect(ru.insight.hourBody('21:00', 1)).toBe('21:00 · 1 пауза')
    expect(ru.insight.hourBody('21:00', 5)).toBe('21:00 · 5 пауз')
    expect(ru.insight.seekingBody('Скука', 2)).toBe('Скука, 2 раза, когда оценка была 1–4.')
    expect(ru.insight.seekingBody('Скука', 5)).toBe('Скука, 5 раз, когда оценка была 1–4.')
    expect(ru.insight.posts(1, 1)).toBe('Перед публикацией была 1 пауза, и в 1 случае был шаг назад.')
    expect(ru.insight.posts(3, 2)).toBe('Перед публикацией было 3 паузы, и в 2 случаях был шаг назад.')
    expect(ru.letter.paused(1)).toBe('Была одна пауза.')
    expect(ru.letter.paused(22)).toBe('Было 22 паузы.')
    expect(ru.letter.paused(25)).toBe('Было 25 пауз.')
    expect(ru.insight.misses(1)).toBe('В записи 1 пропуск, записанных или оценённых.')
    expect(ru.insight.misses(5)).toBe('В записи 5 пропусков, записанных или оценённых.')
    expect(ru.evening.loggedMissesToday(3)).toBe('Записано 3 пропуска сегодня.')
  })

  it('english counted strings agree with 1 / many', () => {
    expect(en.home.stats('6.0', 1, 0)).toContain('1 pause ·')
    expect(en.home.stats('6.0', 2, 0)).toContain('2 pauses')
    expect(en.insight.hourBody('9 pm', 1)).toBe('9 pm · 1 pause')
    expect(en.insight.seekingBody('Boredom', 1)).toContain('1 time,')
    expect(en.insight.misses(1)).toBe('1 miss in the record, logged or estimated.')
    expect(en.insight.extra(1)).toBe('1 extra minute was logged past a session.')
    expect(en.home.missesLoggedToday(1)).toBe('1 miss logged today')
    expect(en.home.missesLoggedToday(4)).toBe('4 misses logged today')
  })
})

describe('source hygiene', () => {
  const sources = import.meta.glob(['../src/ui/**/*.ts', '../src/main.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>

  it('finds UI sources to scan', () => {
    expect(Object.keys(sources).some((file) => file.includes('/screens/today.ts'))).toBe(true)
  })

  it('UI code contains no Cyrillic literals (all copy lives in src/i18n)', () => {
    const offenders: string[] = []
    for (const [file, text] of Object.entries(sources)) {
      text.split('\n').forEach((line, index) => {
        if (/[\u0400-\u04FF]/.test(line)) offenders.push(`${file}:${index + 1}: ${line.trim()}`)
      })
    }
    expect(offenders).toEqual([])
  })

  it('UI code never detects the language by comparing translated strings', () => {
    const offenders: string[] = []
    for (const [file, text] of Object.entries(sources)) {
      if (/\.(save|back|cancel|appName)\s*===\s*['"`]/.test(text)) offenders.push(file)
    }
    expect(offenders).toEqual([])
  })
})
