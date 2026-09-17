import { DEFAULT_LANGUAGE, type Language } from '../i18n';
import { db } from './database';

export const LANGUAGE_SETTING_KEY = 'interface-language';

export async function loadLanguage(): Promise<Language> {
  const value = (await db.settings.get(LANGUAGE_SETTING_KEY))?.value;
  return value === 'ru' || value === 'en' ? value : DEFAULT_LANGUAGE;
}

export async function saveLanguage(language: Language): Promise<void> {
  await db.settings.put({ key: LANGUAGE_SETTING_KEY, value: language });
}
