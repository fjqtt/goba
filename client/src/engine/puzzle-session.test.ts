import { describe, expect, it } from 'vitest';
import { createSampleProblem } from '../fixtures/sample-problem';
import {
  createCheckpoint,
  displayedRulesState,
  playStudentMove,
  restoreSession,
  revealHint,
  startSession,
  stepDemonstration,
  type PuzzleSession,
} from './puzzle-session';

describe('PuzzleSession', () => {
  it('plays a verified correct move to explicit success', async () => {
    const session = await startSession(await createSampleProblem());
    const continuation = await playStudentMove(session, 346);
    expect(continuation.phase).toBe('ready');
    expect(continuation.path.map(step => step.by)).toEqual(['student', 'opponent']);
    const result = await playStudentMove(continuation, 325);
    expect(result.phase).toBe('ready');
    expect(result.path.map(step => step.by)).toEqual(['student', 'opponent', 'student', 'opponent']);
    const success = await playStudentMove(result, 343);
    expect(success.phase).toBe('success');
    expect(success.path).toHaveLength(5);
    expect(success.rulesState.board.get([1, 18])).toBe(-1);
  });

  it('exposes the student position before applying the prepared opponent reply', async () => {
    const session = await startSession(await createSampleProblem());
    const intermediate: PuzzleSession[] = [];
    const continuation = await playStudentMove(session, 346, {
      beforeOpponentReply: position => { intermediate.push(position); },
    });

    expect(intermediate).toHaveLength(1);
    expect(intermediate[0]!.path.map(step => step.by)).toEqual(['student']);
    expect(intermediate[0]!.rulesState.board.get([4, 18])).toBe(-1);
    expect(continuation.path.map(step => step.by)).toEqual(['student', 'opponent']);
  });

  it('plays the prepared refutation after a wrong move', async () => {
    const session = await startSession(await createSampleProblem());
    const result = await playStudentMove(session, 325);
    expect(result.phase).toBe('failure');
    expect(result.path.map(step => step.by)).toEqual(['student', 'opponent']);
    const previous = stepDemonstration(result, -1);
    expect(previous.demoIndex).toBe(1);
    expect(displayedRulesState(previous).board.get([4, 18])).toBe(0);
    expect(displayedRulesState(result).board.get([4, 18])).toBe(1);
  });

  it('contains a false continuation after the correct first exchange', async () => {
    const session = await startSession(await createSampleProblem());
    const continuation = await playStudentMove(session, 346);
    const result = await playStudentMove(continuation, 345);
    expect(result.phase).toBe('failure');
    expect(result.path.map(step => step.by)).toEqual(['student', 'opponent', 'student', 'opponent']);
  });

  it('grades an unclassified legal move as an immediate mistake', async () => {
    const session = await startSession(await createSampleProblem());
    const result = await playStudentMove(session, 347);
    expect(result.phase).toBe('failure');
    expect(result.path).toEqual([{ node: session.nodeId, move: 347, by: 'student', verdict: 'wrong' }]);
    expect(result.rulesState.board.signMap).not.toEqual(session.rulesState.board.signMap);
    // The failed attempt restores from its checkpoint even though the move is off-tree.
    const restored = await restoreSession(result.problem, createCheckpoint(result));
    expect(restored.phase).toBe('failure');
    expect(restored.path).toEqual(result.path);
  });

  it('checks legality before classifying a missing edge', async () => {
    const session = await startSession(await createSampleProblem());
    const result = await playStudentMove(session, 304);
    expect(result.phase).toBe('illegal');
  });

  it('reveals a deterministic hint without playing a move', async () => {
    const session = await startSession(await createSampleProblem());
    const result = revealHint(session);
    expect(result.hintCount).toBe(1);
    expect(result.message).toContain('E1');
    expect(result.path).toEqual([]);
  });

  it('restores a verified attempt from its exact revision and path', async () => {
    const problem = await createSampleProblem();
    const started = await startSession(problem);
    const played = await playStudentMove(started, 325);
    const restored = await restoreSession(problem, createCheckpoint(played));
    expect(restored.attemptId).toBe(started.attemptId);
    expect(restored.phase).toBe('failure');
    expect(restored.path).toEqual(played.path);
    expect(restored.rulesState.board.signMap).toEqual(played.rulesState.board.signMap);
  });
});
