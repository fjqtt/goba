import { translate, type Language } from '../i18n';

type Props = {
  language: Language;
  onLanguageChange: (language: Language) => void;
};

export function SettingsPage({ language, onLanguageChange }: Props) {
  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <header className="settings-heading">
        <h1 id="settings-title">{translate(language, 'settingsTitle')}</h1>
      </header>

      <fieldset className="settings-card">
        <legend>{translate(language, 'language')}</legend>
        <p>{translate(language, 'languageDescription')}</p>
        <div className="language-switch">
          <label className={language === 'ru' ? 'selected' : ''}>
            <input
              type="radio"
              name="language"
              value="ru"
              checked={language === 'ru'}
              onChange={() => onLanguageChange('ru')}
            />
            {translate(language, 'russian')}
          </label>
          <label className={language === 'en' ? 'selected' : ''}>
            <input
              type="radio"
              name="language"
              value="en"
              checked={language === 'en'}
              onChange={() => onLanguageChange('en')}
            />
            {translate(language, 'english')}
          </label>
        </div>
      </fieldset>

      <p className="storage-note">{translate(language, 'languageSavedLocally')}</p>
    </section>
  );
}
