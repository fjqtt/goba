import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyMove, createRulesState, hashRulesState, type ProblemV1, type RulesState } from '@goba/problem-contract';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../storage/database';
import { playStudentMove, startSession, stepDemonstration } from '../engine/puzzle-session';
import {
  collectionStats,
  createCollectionRun,
  currentProblemId,
  recordCollectionResult,
  switchCollectionMode,
} from '../practice/collection-progress';
import { recordTerminalReview } from '../srs/review-events';
import { CHO_PACK_ID, CHO_PACK_REVISION, CHO_PROBLEM_COUNT, loadPackCatalog } from './bundled-catalog';

const packDirectory = resolve(`client/public/packs/cho-elementary/${CHO_PACK_REVISION}`);

describe('generated Cho client pack', () => {
  afterAll(async () => {
    await Promise.all([
      db.packs.clear(), db.problems.clear(), db.settings.clear(),
      db.reviewEvents.clear(), db.cards.clear(), db.outbox.clear(),
    ]);
  });

  it(`installs all hashed shards and validates all ${CHO_PROBLEM_COUNT} ProblemV1 records`, async () => {
    const problems = await loadCatalog();
    expect(problems).toHaveLength(CHO_PROBLEM_COUNT);
    expect(new Set(problems.map(problem => problem.problemId)).size).toBe(CHO_PROBLEM_COUNT);
    expect(problems[0]?.problemId).toBe('cho-elementary-0001');
    expect(problems.at(-1)?.problemId).toBe('cho-elementary-0900');
    for (const problem of problems) await expectReplay(problem);
  });

  it('quarantines explicit-PASS problems and labels evidence as candidate', async () => {
    const problems = await loadCatalog();
    const ids = new Set(problems.map(problem => problem.problemId));
    expect(ids.has('cho-elementary-0030')).toBe(false);
    expect(ids.has('cho-elementary-0018')).toBe(false);
    expect(problems.every(problem => problem.verification.level === 'candidate')).toBe(true);
    const withRefutations = problems.filter(problem => problem.tags.includes('has-refutations'));
    expect(withRefutations.length).toBeGreaterThanOrEqual(299);
  });

  it('grades a wrong move end to end: refutation, failure, wrong result, mistake rotation', async () => {
    const problems = await loadCatalog();
    const problem = problems.find(candidate => candidate.tags.includes('has-refutations'))!;
    const root = problem.nodes[problem.root]!;
    const wrongEdge = root.edges.find(edge => edge.verdict === 'wrong')!;
    expect(wrongEdge.role).toBe('refutation');

    // An unlisted legal move stays neutral and does not consume the attempt.
    let session = await startSession(problem);
    const listed = new Set(root.edges.map(edge => edge.move));
    const occupied = new Set([...problem.setup.black, ...problem.setup.white]);
    const unlisted = Array.from({ length: problem.boardSize ** 2 }, (_, point) => point)
      .find(point => !listed.has(point) && !occupied.has(point))!;
    session = await playStudentMove(session, unlisted);
    expect(session.phase).toBe('unknown');

    // The prepared wrong move is refuted by the opponent and reaches a failure terminal.
    session = await playStudentMove(session, wrongEdge.move);
    expect(session.phase).toBe('failure');
    expect(session.path.map(step => step.by)).toEqual(['student', 'opponent']);
    expect(session.path.every(step => step.verdict === 'wrong')).toBe(true);
    const demo = stepDemonstration(session, -1);
    expect(demo.demoIndex).toBe(session.path.length - 1);

    // The failure is recorded as a wrong result and rotates into the mistakes queue.
    const review = await recordTerminalReview(session);
    expect(review?.rating).toBe('Again');
    expect(review?.firstTryCorrect).toBe(false);

    let run = createCollectionRun('cho-e2e', [problem.problemId]);
    run = await recordCollectionResult(run, problem.problemId, session.attemptId, 'wrong');
    expect(collectionStats(run).wrong).toBe(1);
    run = await switchCollectionMode(run, 'mistakes');
    expect(currentProblemId(run)).toBe(problem.problemId);
  });
});

async function loadCatalog(): Promise<ProblemV1[]> {
  const fetcher: typeof fetch = async input => {
    const name = new URL(String(input)).pathname.split('/').at(-1)!;
    try {
      const bytes = await readFile(resolve(packDirectory, name));
      return new Response(Uint8Array.from(bytes).buffer);
    } catch {
      return new Response(null, { status: 404 });
    }
  };
  return loadPackCatalog({
    packId: CHO_PACK_ID,
    revision: CHO_PACK_REVISION,
    manifestUrl: `https://local.test/packs/cho-elementary/${CHO_PACK_REVISION}/manifest.json`,
    expectedProblemCount: CHO_PROBLEM_COUNT,
    fetch: fetcher,
  });
}

async function expectReplay(problem: ProblemV1): Promise<void> {
  const visit = async (nodeId: number, state: RulesState): Promise<void> => {
    expect(await hashRulesState(state), `${problem.problemId} node ${nodeId}`).toBe(problem.nodes[nodeId]?.stateHash);
    for (const edge of problem.nodes[nodeId]!.edges) {
      const moved = applyMove(state, problem.nodes[nodeId]!.toPlay, edge.move, problem.boardSize);
      expect(moved.ok, `${problem.problemId} node ${nodeId} move ${edge.move}`).toBe(true);
      if (moved.ok) await visit(edge.next, moved.state);
    }
  };
  await visit(problem.root, createRulesState(problem));
}
