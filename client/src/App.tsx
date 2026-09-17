import { useEffect, useState } from 'react';
import type { ProblemV1 } from '@goba/problem-contract';
import { BoardAdapter } from './components/BoardAdapter';
import { StatsPage } from './components/StatsPage';
import { UpdateNotice } from './components/UpdateNotice';
import {
  CHO_COLLECTION_ID,
  CHO_COLLECTION_TITLE,
  loadBundledChoCatalog,
} from './catalog/bundled-catalog';
import {
  playStudentMove,
  createCheckpoint,
  displayedRulesState,
  restoreSession,
  startSession,
  stepDemonstration,
  type PuzzleSession,
} from './engine/puzzle-session';
import {
  advanceCollectionRun,
  currentProblemId,
  loadOrCreateCollectionRun,
  recordCollectionResult,
  resetCollectionRun,
  switchCollectionMode,
  type CollectionRun,
  type PracticeMode,
} from './practice/collection-progress';
import {
  clearActiveSession,
  loadActiveSession,
  requestPersistentStorage,
  saveActiveSession,
} from './storage/database';
import { recordTerminalReview } from './srs/review-events';

const OPPONENT_REPLY_DELAY_MS = 420;
const APP_BASE_PATH = import.meta.env.BASE_URL;
const PRACTICE_PATH = `${APP_BASE_PATH}practice/today`;
const STATISTICS_PATH = `${APP_BASE_PATH}statistics`;

type Page = 'practice' | 'statistics';

export function App() {
  const [catalog, setCatalog] = useState<ProblemV1[]>([]);
  const [run, setRun] = useState<CollectionRun | null>(null);
  const [session, setSession] = useState<PuzzleSession | null>(null);
  const [pendingReply, setPendingReply] = useState<PuzzleSession | null>(null);
  const [resultRecorded, setResultRecorded] = useState(false);
  const [page, setPage] = useState<Page>(() => pageFromPath(window.location.pathname));
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    const handlePopState = () => setPage(pageFromPath(window.location.pathname));
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  useEffect(() => {
    void requestPersistentStorage();
  }, []);

  useEffect(() => {
    let active = true;
    loadBundledChoCatalog()
      .then(async samples => {
        const collectionRun = await loadOrCreateCollectionRun(
          CHO_COLLECTION_ID,
          samples.map(problem => problem.problemId),
        );
        const activeProblemId = currentProblemId(collectionRun);
        const problem = samples.find(candidate => candidate.problemId === activeProblemId);
        if (!problem) return { samples, run: collectionRun, session: null };
        const checkpoint = await loadActiveSession().catch(() => undefined);
        let restored: PuzzleSession | undefined;
        if (checkpoint?.problemId === problem.problemId) {
          restored = await restoreSession(problem, checkpoint).catch(() => undefined);
        }
        return { samples, run: collectionRun, session: restored ?? await startSession(problem) };
      })
      .then(result => {
        if (!active) return;
        setCatalog(result.samples);
        setRun(result.run);
        setSession(result.session);
        if (result.session && ['success', 'failure'].includes(result.session.phase)) {
          setResultRecorded(
            result.run.results[result.session.problem.problemId]?.attemptId === result.session.attemptId,
          );
        }
      })
      .catch(error => {
        if (!active) return;
        setLoadError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => active && setBusy(false));
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!session) return;
    void saveActiveSession(createCheckpoint(session)).catch(() => {
      // Local practice remains usable when IndexedDB is unavailable or full.
    });
  }, [session]);

  useEffect(() => {
    if (!session || !run || !['success', 'failure'].includes(session.phase)) return;
    const existing = run.results[session.problem.problemId];
    if (existing?.attemptId === session.attemptId) {
      setResultRecorded(true);
      return;
    }
    let active = true;
    setResultRecorded(false);
    void recordTerminalReview(session).catch(() => {
      // A later foreground pass can retry because attemptId remains stable.
    });
    void recordCollectionResult(
      run,
      session.problem.problemId,
      session.attemptId,
      session.phase === 'success' ? 'correct' : 'wrong',
    ).then(next => {
      if (!active) return;
      setRun(next);
      setResultRecorded(true);
    }).catch(() => {
      // Keep Next disabled until the durable result can be written.
    });
    return () => { active = false; };
  }, [run, session]);

  const play = async (point: number) => {
    if (!session || busy) return;
    setBusy(true);
    try {
      const next = await playStudentMove(session, point, {
        beforeOpponentReply: async positionAfterStudentMove => {
          setPendingReply(positionAfterStudentMove);
          await delay(OPPONENT_REPLY_DELAY_MS);
        },
      });
      setSession(next);
    } finally {
      setPendingReply(null);
      setBusy(false);
    }
  };

  const nextProblem = async () => {
    if (!run || !session || !resultRecorded) return;
    setBusy(true);
    try {
      const nextRun = await advanceCollectionRun(run);
      await clearActiveSession(session.attemptId);
      const nextId = currentProblemId(nextRun);
      const nextProblem = catalog.find(candidate => candidate.problemId === nextId);
      setRun(nextRun);
      setResultRecorded(false);
      setSession(nextProblem ? await startSession(nextProblem) : null);
      if (!nextProblem) navigateTo('statistics');
    } finally {
      setBusy(false);
    }
  };

  const beginMode = async (mode: PracticeMode) => {
    if (!run) return;
    setBusy(true);
    try {
      const nextRun = await switchCollectionMode(run, mode);
      if (session) await clearActiveSession(session.attemptId);
      const nextId = currentProblemId(nextRun);
      const nextProblem = catalog.find(candidate => candidate.problemId === nextId);
      setRun(nextRun);
      setResultRecorded(false);
      setSession(nextProblem ? await startSession(nextProblem) : null);
      navigateTo('practice');
    } finally {
      setBusy(false);
    }
  };

  const resetProgress = async () => {
    if (!run) return;
    setBusy(true);
    try {
      const nextRun = await resetCollectionRun(run);
      const nextProblem = catalog.find(candidate => candidate.problemId === currentProblemId(nextRun));
      setRun(nextRun);
      setResultRecorded(false);
      setSession(nextProblem ? await startSession(nextProblem) : null);
      navigateTo('practice');
    } finally {
      setBusy(false);
    }
  };

  const problem = run
    ? catalog.find(candidate => candidate.problemId === currentProblemId(run)) ?? null
    : null;
  const visualSession = pendingReply ?? session;
  const displayState = visualSession ? displayedRulesState(visualSession) : null;
  const headingColor = pendingReply ? displayState?.toPlay : problem?.studentColor;
  const passTotal = run?.queue.length ?? 0;
  const passPosition = run && currentProblemId(run) ? run.cursor + 1 : passTotal;
  const attemptInProgress = Boolean(
    session
    && session.path.length > 0
    && !['success', 'failure'].includes(session.phase),
  );

  const navigateTo = (nextPage: Page) => {
    const path = nextPage === 'statistics' ? STATISTICS_PATH : PRACTICE_PATH;
    if (window.location.pathname !== path) window.history.pushState(null, '', path);
    setPage(nextPage);
    window.scrollTo({ top: 0 });
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href={PRACTICE_PATH} aria-label="Тихий ход, сегодняшняя практика" onClick={event => {
          event.preventDefault();
          navigateTo('practice');
        }}>
          <span className="brand-mark" aria-hidden="true">●</span>
          <span>Тихий ход</span>
        </a>
        {page === 'statistics' ? (
          <a className="topbar-link" href={PRACTICE_PATH} onClick={event => {
            event.preventDefault();
            navigateTo('practice');
          }}><span aria-hidden="true">←</span> Назад</a>
        ) : (
          <a
            className={`topbar-link${run ? '' : ' topbar-link-disabled'}`}
            href={run ? STATISTICS_PATH : PRACTICE_PATH}
            aria-label={`Задача ${passPosition} из ${passTotal}. Открыть статистику`}
            aria-disabled={!run}
            onClick={event => {
              event.preventDefault();
              if (run) navigateTo('statistics');
            }}
          >
            Статистика
          </a>
        )}
      </header>

      {page === 'statistics' && run ? (
        <StatsPage
          run={run}
          collectionTitle={CHO_COLLECTION_TITLE}
          busy={busy || Boolean(session && ['success', 'failure'].includes(session.phase) && !resultRecorded)}
          modeChangeDisabled={attemptInProgress}
          onRepeatMistakes={() => void beginMode('mistakes')}
          onContinueAll={() => void beginMode('all')}
          onReset={() => void resetProgress()}
        />
      ) : page === 'statistics' ? (
        <div className="loading" role="status">Готовим статистику…</div>
      ) : (
        <>
      {problem && session && (
        <section className="practice-heading">
          <h1>{headingColor === 'W' ? 'Ход белых' : 'Ход чёрных'}</h1>
        </section>
      )}

      {problem && session ? (
        <>
          <BoardAdapter
            signMap={displayState!.board.signMap}
            viewport={problem.viewport}
            toPlay={displayState!.toPlay}
            disabled={busy || ['success', 'failure', 'content-error'].includes(session.phase)}
            onMove={play}
          />

          {['success', 'failure', 'unknown', 'illegal', 'content-error'].includes(session.phase) && (
            <section className={`feedback feedback-${session.phase}`} aria-live="polite">
              <span className="feedback-symbol" aria-hidden="true">{phaseSymbol(session.phase)}</span>
              <p>
                {session.message}
                {session.phase === 'failure' && (
                  <small>Ход {session.demoIndex} из {session.path.length}</small>
                )}
              </p>
            </section>
          )}

          <nav className="bottom-actions" aria-label="Действия с задачей">
            {session.phase === 'failure' && (
              <>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || session.demoIndex === 0}
                  onClick={() => setSession(stepDemonstration(session, -1))}
                >
                  Назад
                </button>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={busy || session.demoIndex === session.path.length}
                  onClick={() => setSession(stepDemonstration(session, 1))}
                >
                  Вперёд
                </button>
              </>
            )}
            <button
              className="next-button"
              type="button"
              disabled={busy || !resultRecorded || !['success', 'failure'].includes(session.phase)}
              onClick={() => void nextProblem()}
            >
              Дальше <span aria-hidden="true">→</span>
            </button>
          </nav>
        </>
      ) : loadError && !busy ? (
        <section className="collection-complete collection-error" role="alert">
          <span aria-hidden="true">!</span>
          <h1>Сборник не загрузился</h1>
          <p>{loadError}</p>
          <button type="button" onClick={() => window.location.reload()}>Повторить</button>
        </section>
      ) : run && !busy ? (
        <section className="collection-complete">
          <span aria-hidden="true">✓</span>
          <h1>{run.mode === 'mistakes' ? 'Ошибки разобраны' : 'Сборник пройден'}</h1>
          <button type="button" onClick={() => navigateTo('statistics')}>Посмотреть статистику</button>
        </section>
      ) : (
        <div className="loading" role="status">Готовим доску…</div>
      )}
        </>
      )}
      <UpdateNotice safeToUpdate={!busy} />
    </main>
  );
}

function phaseSymbol(phase: PuzzleSession['phase']): string {
  if (phase === 'success') return '✓';
  if (phase === 'failure' || phase === 'illegal' || phase === 'content-error') return '!';
  if (phase === 'unknown') return '?';
  return '•';
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, milliseconds));
}

function pageFromPath(pathname: string): Page {
  const normalizedPath = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return normalizedPath === STATISTICS_PATH ? 'statistics' : 'practice';
}
