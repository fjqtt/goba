import { db, type SettingRecord } from '../storage/database';

export type PracticeOutcome = 'correct' | 'wrong';
export type PracticeMode = 'all' | 'mistakes';

export type ProblemProgress = {
  outcome: PracticeOutcome;
  attemptId: string;
  completedAt: string;
};

export type CollectionRun = {
  schemaVersion: 1;
  collectionId: string;
  catalogProblemIds: string[];
  mode: PracticeMode;
  queue: string[];
  cursor: number;
  results: Record<string, ProblemProgress>;
  updatedAt: string;
};

export type CollectionStats = {
  total: number;
  correct: number;
  wrong: number;
  unseen: number;
};

type RandomSource = () => number;

export async function loadOrCreateCollectionRun(
  collectionId: string,
  catalogProblemIds: string[],
  random: RandomSource = Math.random,
): Promise<CollectionRun> {
  const normalizedIds = unique(catalogProblemIds);
  const stored = await db.settings.get(storageKey(collectionId));
  const existing = parseRun(stored?.value, collectionId);
  const run = existing
    ? reconcileCatalog(existing, normalizedIds, random)
    : createCollectionRun(collectionId, normalizedIds, 'all', {}, random);
  await saveCollectionRun(run);
  return run;
}

export function createCollectionRun(
  collectionId: string,
  catalogProblemIds: string[],
  mode: PracticeMode = 'all',
  results: Record<string, ProblemProgress> = {},
  random: RandomSource = Math.random,
): CollectionRun {
  const ids = unique(catalogProblemIds);
  return {
    schemaVersion: 1,
    collectionId,
    catalogProblemIds: ids,
    mode,
    queue: shuffled(eligibleProblemIds(ids, results, mode), random),
    cursor: 0,
    results: filterResults(results, new Set(ids)),
    updatedAt: new Date().toISOString(),
  };
}

export function currentProblemId(run: CollectionRun): string | undefined {
  return run.queue[run.cursor];
}

export function isCollectionPassComplete(run: CollectionRun): boolean {
  return currentProblemId(run) === undefined;
}

export async function recordCollectionResult(
  run: CollectionRun,
  problemId: string,
  attemptId: string,
  outcome: PracticeOutcome,
): Promise<CollectionRun> {
  if (currentProblemId(run) !== problemId) {
    throw new Error('Result does not belong to the current collection problem');
  }
  const existing = run.results[problemId];
  if (existing?.attemptId === attemptId) return run;
  const next: CollectionRun = {
    ...run,
    results: {
      ...run.results,
      [problemId]: { outcome, attemptId, completedAt: new Date().toISOString() },
    },
    updatedAt: new Date().toISOString(),
  };
  await saveCollectionRun(next);
  return next;
}

export async function advanceCollectionRun(
  run: CollectionRun,
  random: RandomSource = Math.random,
): Promise<CollectionRun> {
  const advanced = { ...run, cursor: run.cursor + 1, updatedAt: new Date().toISOString() };
  if (!isCollectionPassComplete(advanced) || run.mode === 'all') {
    await saveCollectionRun(advanced);
    return advanced;
  }

  const remainingMistakes = eligibleProblemIds(run.catalogProblemIds, run.results, 'mistakes');
  const next = remainingMistakes.length === 0
    ? advanced
    : {
        ...advanced,
        queue: shuffled(remainingMistakes, random),
        cursor: 0,
        updatedAt: new Date().toISOString(),
      };
  await saveCollectionRun(next);
  return next;
}

export async function switchCollectionMode(
  run: CollectionRun,
  mode: PracticeMode,
  random: RandomSource = Math.random,
): Promise<CollectionRun> {
  const next = createCollectionRun(
    run.collectionId,
    run.catalogProblemIds,
    mode,
    run.results,
    random,
  );
  await saveCollectionRun(next);
  return next;
}

export async function resetCollectionRun(
  run: CollectionRun,
  random: RandomSource = Math.random,
): Promise<CollectionRun> {
  const next = createCollectionRun(run.collectionId, run.catalogProblemIds, 'all', {}, random);
  await db.transaction(
    'rw',
    [db.settings, db.sessions, db.reviewEvents, db.cards, db.outbox],
    async () => {
      await db.sessions.clear();
      await db.reviewEvents.clear();
      await db.cards.clear();
      await db.outbox.clear();
      await saveCollectionRun(next);
    },
  );
  return next;
}

export function collectionStats(run: CollectionRun): CollectionStats {
  let correct = 0;
  let wrong = 0;
  for (const problemId of run.catalogProblemIds) {
    if (run.results[problemId]?.outcome === 'correct') correct += 1;
    if (run.results[problemId]?.outcome === 'wrong') wrong += 1;
  }
  return {
    total: run.catalogProblemIds.length,
    correct,
    wrong,
    unseen: run.catalogProblemIds.length - correct - wrong,
  };
}

async function saveCollectionRun(run: CollectionRun): Promise<void> {
  const record: SettingRecord = { key: storageKey(run.collectionId), value: run };
  await db.settings.put(record);
}

function reconcileCatalog(
  run: CollectionRun,
  catalogProblemIds: string[],
  random: RandomSource,
): CollectionRun {
  const ids = unique(catalogProblemIds);
  if (sameIds(run.catalogProblemIds, ids)) return run;
  const allowed = new Set(ids);
  const results = filterResults(run.results, allowed);
  return createCollectionRun(run.collectionId, ids, run.mode, results, random);
}

function eligibleProblemIds(
  problemIds: string[],
  results: Record<string, ProblemProgress>,
  mode: PracticeMode,
): string[] {
  if (mode === 'mistakes') {
    return problemIds.filter(problemId => results[problemId]?.outcome === 'wrong');
  }
  return problemIds.filter(problemId => results[problemId] === undefined);
}

function filterResults(
  results: Record<string, ProblemProgress>,
  allowed: Set<string>,
): Record<string, ProblemProgress> {
  return Object.fromEntries(Object.entries(results).filter(([problemId]) => allowed.has(problemId)));
}

function parseRun(value: unknown, collectionId: string): CollectionRun | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const candidate = value as Partial<CollectionRun>;
  if (
    candidate.schemaVersion !== 1
    || candidate.collectionId !== collectionId
    || (candidate.mode !== 'all' && candidate.mode !== 'mistakes')
    || !Array.isArray(candidate.catalogProblemIds)
    || !candidate.catalogProblemIds.every(item => typeof item === 'string')
    || !Array.isArray(candidate.queue)
    || !candidate.queue.every(item => typeof item === 'string')
    || !Number.isInteger(candidate.cursor)
    || (candidate.cursor ?? -1) < 0
    || !candidate.results
    || typeof candidate.results !== 'object'
    || typeof candidate.updatedAt !== 'string'
  ) return undefined;
  return candidate as CollectionRun;
}

function shuffled<T>(values: T[], random: RandomSource): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex]!, result[index]!];
  }
  return result;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function storageKey(collectionId: string): string {
  return `collection-run:${collectionId}`;
}
