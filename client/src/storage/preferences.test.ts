import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { LANGUAGE_SETTING_KEY, loadLanguage, saveLanguage } from './preferences';

describe('interface preferences', () => {
  afterEach(async () => {
    await db.settings.delete(LANGUAGE_SETTING_KEY);
  });

  it('uses Russian by default and persists an explicit language', async () => {
    await expect(loadLanguage()).resolves.toBe('ru');
    await saveLanguage('en');
    await expect(loadLanguage()).resolves.toBe('en');
  });

  it('ignores an invalid stored language', async () => {
    await db.settings.put({ key: LANGUAGE_SETTING_KEY, value: 'de' });
    await expect(loadLanguage()).resolves.toBe('ru');
  });
});
