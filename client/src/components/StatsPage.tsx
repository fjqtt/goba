import { useState } from 'react';
import { collectionStats, type CollectionRun } from '../practice/collection-progress';
import { translate, type Language } from '../i18n';

type Props = {
  run: CollectionRun;
  language: Language;
  busy: boolean;
  modeChangeDisabled: boolean;
  onRepeatMistakes: () => void;
  onContinueAll: () => void;
  onReset: () => void;
};

export function StatsPage({
  run,
  language,
  busy,
  modeChangeDisabled,
  onRepeatMistakes,
  onContinueAll,
  onReset,
}: Props) {
  const [confirmReset, setConfirmReset] = useState(false);
  const stats = collectionStats(run);
  const solved = stats.correct + stats.wrong;
  const solvedPercent = stats.total === 0 ? 0 : Math.round((solved / stats.total) * 100);
  const accuracy = solved === 0 ? 0 : Math.round((stats.correct / solved) * 100);

  return (
    <section className="stats-page" aria-labelledby="stats-title">
      <header className="stats-heading">
        <p>{translate(language, 'collectionTitle')}</p>
        <h1 id="stats-title">{translate(language, 'statistics')}</h1>
        <p className="stats-summary">{translate(language, 'completed', { solved, total: stats.total })}</p>
      </header>

      <p className="stats-book-description">{translate(language, 'bookDescription')}</p>

      <div className="stats-progress" aria-label={translate(language, 'completedPercent', { percent: solvedPercent })}>
        <i style={{ width: `${solvedPercent}%` }} />
      </div>

      <div className="stats-grid">
        <article><strong>{stats.correct}</strong><span>{translate(language, 'correct')}</span></article>
        <article><strong>{stats.wrong}</strong><span>{translate(language, 'mistakes')}</span></article>
        <article><strong>{stats.unseen}</strong><span>{translate(language, 'unseen')}</span></article>
        <article><strong>{accuracy}%</strong><span>{translate(language, 'accuracy')}</span></article>
      </div>

      <div className="stats-actions">
        <button type="button" disabled={busy || modeChangeDisabled || stats.wrong === 0} onClick={onRepeatMistakes}>
          {translate(language, 'repeatMistakes')}
        </button>
        <button type="button" disabled={busy || modeChangeDisabled || stats.unseen === 0} onClick={onContinueAll}>
          {translate(language, 'continueNew')}
        </button>
        {confirmReset ? (
          <div className="reset-confirmation">
            <span>{translate(language, 'resetPrompt')}</span>
            <button type="button" disabled={busy} onClick={onReset}>{translate(language, 'erase')}</button>
            <button type="button" disabled={busy} onClick={() => setConfirmReset(false)}>{translate(language, 'cancel')}</button>
          </div>
        ) : (
          <button className="reset-button" type="button" disabled={busy} onClick={() => setConfirmReset(true)}>
            {translate(language, 'resetProgress')}
          </button>
        )}
      </div>

      <p className="storage-note">{translate(language, 'progressStoredLocally')}</p>
    </section>
  );
}
