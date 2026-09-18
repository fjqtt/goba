import { BOOK } from './book';

export type { Language } from './i18n-types';
export { DEFAULT_LANGUAGE } from './i18n-types';
import type { Language } from './i18n-types';

const translations = {
  ru: {
    brand: BOOK.title.ru,
    brandAria: `${BOOK.title.ru}, сегодняшняя практика`,
    back: 'Назад',
    statistics: 'Статистика',
    settings: 'Настройки',
    openStatistics: 'Задача {{position}} из {{total}}. Открыть статистику',
    openSettings: 'Открыть настройки',
    loadingStatistics: 'Готовим статистику…',
    whiteToPlay: 'Ход белых',
    blackToPlay: 'Ход чёрных',
    refutationStep: 'Ход {{current}} из {{total}}',
    problemActions: 'Действия с задачей',
    mainNavigation: 'Основная навигация',
    previous: 'Назад',
    forward: 'Вперёд',
    next: 'Дальше',
    collectionLoadFailed: 'Сборник не загрузился',
    retry: 'Повторить',
    mistakesCleared: 'Ошибки разобраны',
    collectionCompleted: 'Сборник пройден',
    viewStatistics: 'Посмотреть статистику',
    loadingBoard: 'Готовим доску…',
    collectionTitle: BOOK.title.ru,
    completed: 'Пройдено {{solved}} из {{total}}',
    completedPercent: 'Пройдено {{percent}}%',
    correct: 'Правильно',
    mistakes: 'Ошибки',
    unseen: 'Не решено',
    accuracy: 'Точность',
    repeatMistakes: 'Повторять ошибки',
    continueNew: 'Продолжить новые',
    resetPrompt: 'Стереть результаты и историю повторений?',
    erase: 'Стереть',
    cancel: 'Отмена',
    resetProgress: 'Сбросить прогресс',
    progressStoredLocally: 'Прогресс хранится локально на этом устройстве.',
    goBoard: 'Доска го',
    boardKeyboardHelp: 'Доска. Стрелки выбирают точку, Enter делает ход.',
    updateReady: 'Обновление готово',
    attemptSaved: 'Попытка сохранена.',
    update: 'Обновить',
    postponeUpdate: 'Отложить обновление',
    settingsTitle: 'Настройки',
    language: 'Язык',
    languageDescription: 'Язык интерфейса приложения.',
    russian: 'Русский',
    english: 'English',
    languageSavedLocally: 'Выбор языка сохранён на этом устройстве.',
    documentTitle: BOOK.title.ru,
    documentDescription: BOOK.tagline.ru,
    bookDescription: BOOK.description.ru,
  },
  en: {
    brand: BOOK.title.en,
    brandAria: `${BOOK.title.en}, today's practice`,
    back: 'Back',
    statistics: 'Statistics',
    settings: 'Settings',
    openStatistics: 'Problem {{position}} of {{total}}. Open statistics',
    openSettings: 'Open settings',
    loadingStatistics: 'Preparing statistics…',
    whiteToPlay: 'White to play',
    blackToPlay: 'Black to play',
    refutationStep: 'Move {{current}} of {{total}}',
    problemActions: 'Problem actions',
    mainNavigation: 'Main navigation',
    previous: 'Back',
    forward: 'Forward',
    next: 'Next',
    collectionLoadFailed: 'Could not load the collection',
    retry: 'Try again',
    mistakesCleared: 'Mistakes cleared',
    collectionCompleted: 'Collection complete',
    viewStatistics: 'View statistics',
    loadingBoard: 'Preparing the board…',
    collectionTitle: BOOK.title.en,
    completed: 'Completed {{solved}} of {{total}}',
    completedPercent: '{{percent}}% completed',
    correct: 'Correct',
    mistakes: 'Mistakes',
    unseen: 'Not attempted',
    accuracy: 'Accuracy',
    repeatMistakes: 'Repeat mistakes',
    continueNew: 'Continue new problems',
    resetPrompt: 'Erase results and review history?',
    erase: 'Erase',
    cancel: 'Cancel',
    resetProgress: 'Reset progress',
    progressStoredLocally: 'Progress is stored locally on this device.',
    goBoard: 'Go board',
    boardKeyboardHelp: 'Board. Use arrow keys to select a point and Enter to play.',
    updateReady: 'Update ready',
    attemptSaved: 'Your attempt is saved.',
    update: 'Update',
    postponeUpdate: 'Postpone update',
    settingsTitle: 'Settings',
    language: 'Language',
    languageDescription: 'Language used by the app interface.',
    russian: 'Русский',
    english: 'English',
    languageSavedLocally: 'Your language choice is saved on this device.',
    documentTitle: BOOK.title.en,
    documentDescription: BOOK.tagline.en,
    bookDescription: BOOK.description.en,
  },
} as const;

export type TranslationKey = keyof typeof translations.ru;

export function translate(
  language: Language,
  key: TranslationKey,
  values: Record<string, string | number> = {},
): string {
  return Object.entries(values).reduce(
    (text, [name, value]) => text.replaceAll(`{{${name}}}`, String(value)),
    translations[language][key] as string,
  );
}

const sessionMessages: Record<string, { ru: string; en: string }> = {
  'Найдите лучший ход.': { ru: 'Найдите лучший ход.', en: 'Find the best move.' },
  'Ожидался ход соперника, но ответ не задан.': {
    ru: 'Ожидался ход соперника, но ответ не задан.',
    en: "The opponent's reply is missing.",
  },
  'Эта точка уже занята.': { ru: 'Эта точка уже занята.', en: 'This point is already occupied.' },
  'Этот ход — самоубийство группы.': {
    ru: 'Этот ход — самоубийство группы.',
    en: 'This move is suicide.',
  },
  'Этот ход повторяет прежнюю позицию.': {
    ru: 'Этот ход повторяет прежнюю позицию.',
    en: 'This move repeats an earlier position.',
  },
  'Этот ход недопустим.': { ru: 'Этот ход недопустим.', en: 'This move is illegal.' },
  'Этот ход ещё не проверен. Попробуйте другой.': {
    ru: 'Этот ход ещё не проверен. Попробуйте другой.',
    en: 'This move has not been verified. Try another one.',
  },
  'Соперник может опровергнуть этот ход.': {
    ru: 'Соперник может опровергнуть этот ход.',
    en: 'The opponent can refute this move.',
  },
  'Верно. Смотрим ответ соперника…': {
    ru: 'Верно. Смотрим ответ соперника…',
    en: "Correct. Checking the opponent's reply…",
  },
  'Для этой позиции нет подготовленной подсказки.': {
    ru: 'Для этой позиции нет подготовленной подсказки.',
    en: 'No hint is available for this position.',
  },
  'Подсказка: здесь нужен пасс.': {
    ru: 'Подсказка: здесь нужен пасс.',
    en: 'Hint: pass here.',
  },
  'У позиции соперника отсутствует defaultReply.': {
    ru: 'У позиции соперника отсутствует defaultReply.',
    en: "The opponent position has no default reply.",
  },
  'defaultReply указывает за пределы списка ходов.': {
    ru: 'defaultReply указывает за пределы списка ходов.',
    en: 'The default reply points outside the move list.',
  },
  'Ваш ход.': { ru: 'Ваш ход.', en: 'Your move.' },
  'Состояние доски не совпало с проверенным деревом. Попытка не будет оценена.': {
    ru: 'Состояние доски не совпало с проверенным деревом. Попытка не будет оценена.',
    en: 'The board state does not match the verified tree. This attempt will not be graded.',
  },
  'Решено.': { ru: 'Решено.', en: 'Solved.' },
  'Группа не живёт.': { ru: 'Группа не живёт.', en: 'The group does not live.' },
  'Группа соперника выжила.': { ru: 'Группа соперника выжила.', en: 'The opponent group survived.' },
};

export function translateSessionMessage(message: string, language: Language): string {
  const exact = sessionMessages[message];
  if (exact) return exact[language];

  const hint = /^Подсказка: рассмотрите (.+)\.$/.exec(message);
  if (hint) return language === 'ru' ? message : `Hint: consider ${hint[1]}.`;

  const illegalReply = /^Подготовленный ответ нелегален: (.+)\.$/.exec(message);
  if (illegalReply) {
    return language === 'ru' ? message : `The prepared reply is illegal: ${illegalReply[1]}.`;
  }

  return message;
}
