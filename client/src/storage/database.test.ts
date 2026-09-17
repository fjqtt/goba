import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { createSampleProblem } from '../fixtures/sample-problem';
import { createCheckpoint, startSession } from '../engine/puzzle-session';
import { clearActiveSession, db, loadActiveSession, saveActiveSession } from './database';

describe('session checkpoint storage', () => {
  afterEach(async () => {
    await db.sessions.clear();
  });

  it('round-trips the active attempt', async () => {
    const session = await startSession(await createSampleProblem());
    const checkpoint = createCheckpoint(session);
    await saveActiveSession(checkpoint);
    expect(await loadActiveSession()).toEqual(checkpoint);
  });

  it('only clears the matching attempt', async () => {
    const session = await startSession(await createSampleProblem());
    await saveActiveSession(createCheckpoint(session));
    await clearActiveSession('another-attempt');
    expect(await loadActiveSession()).toBeDefined();
    await clearActiveSession(session.attemptId);
    expect(await loadActiveSession()).toBeUndefined();
  });
});
