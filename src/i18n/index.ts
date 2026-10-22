import type { LangSetting } from '../domain/types'
import { en, type Dict, type Locale } from './en'
import { ru } from './ru'

export type { Dict, Locale }
export { pluralEn, pluralRu } from './plural'

export function resolveLang(setting: LangSetting, deviceLanguage: string): 'en' | 'ru' {
  if (setting === 'en' || setting === 'ru') return setting
  return deviceLanguage.toLowerCase().startsWith('ru') ? 'ru' : 'en'
}

export function dictionary(lang: 'en' | 'ru'): Dict {
  return lang === 'ru' ? ru : en
}

/** The locale a dictionary belongs to. Use this instead of comparing translated strings. */
export function getLocale(dict: Dict): Locale {
  return dict.locale
}
