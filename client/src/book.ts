import type { Language } from './i18n-types';

export type LocalizedText = Record<Language, string>;

/**
 * The single book this application is built around. Each book ships as its own
 * application at its own URL: to create the next one, copy the client with a new
 * BOOK value (pack pointers, titles, description) and build with its base path.
 */
export type BookConfig = {
  id: string;
  collectionId: string;
  packId: string;
  packRevision: number;
  problemCount: number;
  /** Manifest path relative to the deploy base. */
  packManifestPath: string;
  title: LocalizedText;
  shortTitle: LocalizedText;
  tagline: LocalizedText;
  description: LocalizedText;
};

export const BOOK: BookConfig = {
  id: 'cho-elementary',
  collectionId: 'cho-chikun-elementary-local-candidates-v1',
  packId: 'cho-chikun-elementary-local-candidates',
  packRevision: 4,
  problemCount: 707,
  packManifestPath: 'packs/cho-elementary/4/manifest.json',
  title: {
    ru: 'Чо Чикун. Начальный уровень',
    en: 'Cho Chikun Elementary',
  },
  shortTitle: {
    ru: 'Чо Чикун',
    en: 'Cho Chikun',
  },
  tagline: {
    ru: 'Задачи цумэго из «Энциклопедии жизни и смерти» Чо Чикуна. Работает без сети.',
    en: "Tsumego problems from Cho Chikun's Encyclopedia of Life and Death. Works offline.",
  },
  description: {
    ru: '«Энциклопедия жизни и смерти» Чо Чикуна — классический сборник задач цумэго. '
      + 'Начальный том: 900 задач на базовые формы жизни и смерти, от первых приёмов до уверенного чтения углов. '
      + 'Чо Чикун — почётный Мэйдзин и обладатель рекордного числа титулов в истории японского профессионального го.',
    en: "Cho Chikun's Encyclopedia of Life and Death is a classic tsumego collection. "
      + 'The elementary volume holds 900 problems on fundamental life-and-death shapes, '
      + 'from first techniques to confident corner reading. '
      + 'Cho Chikun, Honorary Meijin, holds the record number of titles in Japanese professional go.',
  },
};
