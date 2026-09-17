import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createSampleProblem } from '../fixtures/sample-problem';
import { playStudentMove, revealHint, startSession } from '../engine/puzzle-session';
import { db } from '../storage/database';
import { recordTerminalReview } from './review-events';
import { SCHEDULER_VERSION } from './scheduler';

describe('review event transaction', () => {
  afterEach(async () => {
    await Promise.all([
      db.reviewEvents.clear(), db.cards.clear(), db.outbox.clear(), db.settings.clear(),
    ]);
  });

  it('writes one event, projection and outbox item per attempt', async () => {
    const problem = await createSampleProblem();
    const firstMove = await playStudentMove(await startSession(problem), 346);
    const secondMove = await playStudentMove(firstMove, 325);
    const completed = await playStudentMove(secondMove, 343);
    const first = await recordTerminalReview(completed);
    const duplicate = await recordTerminalReview(completed);

    expect(first?.rating).toBe('Good');
    expect(first?.firstTryCorrect).toBe(true);
    expect(first?.schedulerVersion).toBe(SCHEDULER_VERSION);
    expect(duplicate?.eventId).toBe(first?.eventId);
    expect(await db.reviewEvents.count()).toBe(1);
    expect(await db.cards.count()).toBe(1);
    expect(await db.outbox.count()).toBe(1);
  });

  it('grades a hinted success and a failure as Again', async () => {
    const problem = await createSampleProblem();
    const hinted = revealHint(await startSession(problem));
    const firstMove = await playStudentMove(hinted, 346);
    const secondMove = await playStudentMove(firstMove, 325);
    const success = await playStudentMove(secondMove, 343);
    const failure = await playStudentMove(await startSession(problem), 325);
    expect((await recordTerminalReview(success))?.rating).toBe('Again');
    expect((await recordTerminalReview(failure))?.rating).toBe('Again');
  });
});
