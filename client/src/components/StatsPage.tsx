import { useState } from 'react';
import { collectionStats, type CollectionRun } from '../practice/collection-progress';

type Props = {
  run: CollectionRun;
  collectionTitle: string;
  busy: boolean;
  modeChangeDisabled: boolean;
  onRepeatMistakes: () => void;
  onContinueAll: () => void;
  onReset: () => void;
};

export function StatsPage({
  run,
  collectionTitle,
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
        <p>{collectionTitle}</p>
        <h1 id="stats-title">Статистика</h1>
        <p className="stats-summary">Пройдено {solved} из {stats.total}</p>
      </header>

      <div className="stats-progress" aria-label={`Пройдено ${solvedPercent}%`}>
        <i style={{ width: `${solvedPercent}%` }} />
      </div>

      <div className="stats-grid">
        <article><strong>{stats.correct}</strong><span>Правильно</span></article>
        <article><strong>{stats.wrong}</strong><span>Ошибки</span></article>
        <article><strong>{stats.unseen}</strong><span>Не решено</span></article>
        <article><strong>{accuracy}%</strong><span>Точность</span></article>
      </div>

      <div className="stats-actions">
        <button type="button" disabled={busy || modeChangeDisabled || stats.wrong === 0} onClick={onRepeatMistakes}>
          Повторять ошибки
        </button>
        <button type="button" disabled={busy || modeChangeDisabled || stats.unseen === 0} onClick={onContinueAll}>
          Продолжить новые
        </button>
        {confirmReset ? (
          <div className="reset-confirmation">
            <span>Стереть результаты и историю повторений?</span>
            <button type="button" disabled={busy} onClick={onReset}>Стереть</button>
            <button type="button" disabled={busy} onClick={() => setConfirmReset(false)}>Отмена</button>
          </div>
        ) : (
          <button className="reset-button" type="button" disabled={busy} onClick={() => setConfirmReset(true)}>
            Сбросить прогресс
          </button>
        )}
      </div>

      <p className="storage-note">Прогресс хранится локально на этом устройстве.</p>
    </section>
  );
}
