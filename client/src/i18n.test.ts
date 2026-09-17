import { describe, expect, it } from 'vitest';
import { translate, translateSessionMessage } from './i18n';

describe('interface translations', () => {
  it('interpolates Russian and English UI strings', () => {
    expect(translate('ru', 'completed', { solved: 12, total: 861 })).toBe('Пройдено 12 из 861');
    expect(translate('en', 'completed', { solved: 12, total: 861 })).toBe('Completed 12 of 861');
  });

  it('translates restored engine and content messages', () => {
    expect(translateSessionMessage('Решено.', 'en')).toBe('Solved.');
    expect(translateSessionMessage('Подсказка: рассмотрите E1.', 'en')).toBe('Hint: consider E1.');
    expect(translateSessionMessage('Custom source note', 'en')).toBe('Custom source note');
  });
});
