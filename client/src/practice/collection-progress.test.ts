import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../storage/database';
import {
  advanceCollectionRun,
  collectionStats,
  createCollectionRun,
  currentProblemId,
  loadOrCreateCollectionRun,
  recordCollectionResult,
  resetCollectionRun,
  switchCollectionMode,
} from './collection-progress';

const noShuffle = () => 0.999;

describe('collection progress', () => {
  afterEach(async () => {
    await Promise.all([
      db.settings.clear(),
      db.sessions.clear(),
      db.reviewEvents.clear(),
      db.cards.clear(),
      db.outbox.clear(),
    ]);
  });

  it('keeps one shuffled order when the app is reopened', async () => {
    const first = await loadOrCreateCollectionRun('book', ['a', 'b', 'c'], () => 0);
    const restored = await loadOrCreateCollectionRun('book', ['a', 'b', 'c'], () => 0.999);
    expect(restored.queue).toEqual(first.queue);
    expect(restored.cursor).toBe(0);
  });

  it('records one result and advances without changing the result on replay', async () => {
    let run = createCollectionRun('book', ['a', 'b'], 'all', {}, noShuffle);
    expect(currentProblemId(run)).toBe('a');
    run = await recordCollectionResult(run, 'a', 'attempt-a', 'wrong');
    run = await recordCollectionResult(run, 'a', 'attempt-a', 'correct');
    expect(run.results.a?.outcome).toBe('wrong');
    run = await advanceCollectionRun(run, noShuffle);
    expect(currentProblemId(run)).toBe('b');
    expect(collectionStats(run)).toEqual({ total: 2, correct: 0, wrong: 1, unseen: 1 });
  });

  it('rotates only mistakes until they are solved', async () => {
    let run = createCollectionRun('book', ['a', 'b'], 'all', {}, noShuffle);
    run = await recordCollectionResult(run, 'a', 'first-a', 'wrong');
    run = await advanceCollectionRun(run, noShuffle);
    run = await recordCollectionResult(run, 'b', 'first-b', 'correct');
    run = await advanceCollectionRun(run, noShuffle);
    run = await switchCollectionMode(run, 'mistakes', noShuffle);
    expect(run.queue).toEqual(['a']);

    run = await recordCollectionResult(run, 'a', 'retry-a', 'wrong');
    run = await advanceCollectionRun(run, noShuffle);
    expect(currentProblemId(run)).toBe('a');
    run = await recordCollectionResult(run, 'a', 'retry-a-2', 'correct');
    run = await advanceCollectionRun(run, noShuffle);
    expect(currentProblemId(run)).toBeUndefined();
    expect(collectionStats(run)).toEqual({ total: 2, correct: 2, wrong: 0, unseen: 0 });
  });

  it('resets every result and returns to the full collection', async () => {
    let run = createCollectionRun('book', ['a', 'b'], 'all', {}, noShuffle);
    run = await recordCollectionResult(run, 'a', 'attempt-a', 'correct');
    const event = {
      eventId: 'event-a',
      attemptId: 'attempt-a',
      problemId: 'a',
      revision: 1,
      learningVersion: 1,
      deviceId: 'local-device',
      deviceSeq: 1,
      occurredAt: '2026-09-17T00:00:00.000Z',
      timezone: 'UTC',
      rating: 'Good' as const,
      firstTryCorrect: true,
      hintCount: 0,
      solutionViewed: false,
      path: [],
      schedulerVersion: 'test',
    };
    await db.sessions.put({
      key: 'active',
      attemptId: 'attempt-a',
      problemId: 'a',
      revision: 1,
      nodeId: 0,
      phase: 'ready',
      message: '',
      path: [],
      hintCount: 0,
      demoIndex: 0,
      updatedAt: '2026-09-17T00:00:00.000Z',
    });
    await db.reviewEvents.put(event);
    await db.cards.put({ key: 'a:1', problemId: 'a', learningVersion: 1, projection: {} });
    await db.outbox.put({ eventId: event.eventId, payload: event, attempts: 0, nextAttemptAt: event.occurredAt });
    await db.settings.put({ key: 'device-id', value: 'local-device' });
    run = await resetCollectionRun(run, noShuffle);
    expect(run.mode).toBe('all');
    expect(run.queue).toEqual(['a', 'b']);
    expect(run.results).toEqual({});
    expect(await db.sessions.count()).toBe(0);
    expect(await db.reviewEvents.count()).toBe(0);
    expect(await db.cards.count()).toBe(0);
    expect(await db.outbox.count()).toBe(0);
    expect((await db.settings.get('device-id'))?.value).toBe('local-device');
  });
});
