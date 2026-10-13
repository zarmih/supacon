import type { LangSetting } from '../domain/types'
import { en, type Dict } from './en'
import { ru } from './ru'

export type { Dict }

export function resolveLang(setting: LangSetting, deviceLanguage: string): 'en' | 'ru' {
  if (setting === 'en' || setting === 'ru') return setting
  return deviceLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export function dictionary(lang: 'en' | 'ru'): Dict {
  return lang === 'ru' ? ru : en
}
