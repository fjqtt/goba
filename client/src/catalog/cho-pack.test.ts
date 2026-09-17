import 'fake-indexeddb/auto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { applyMove, createRulesState, hashRulesState, type ProblemV1, type RulesState } from '@goba/problem-contract';
import { afterAll, describe, expect, it } from 'vitest';
import { db } from '../storage/database';
import { CHO_PACK_ID, CHO_PACK_REVISION, CHO_PROBLEM_COUNT, loadPackCatalog } from './bundled-catalog';

const packDirectory = resolve('client/public/packs/cho-elementary/1');

describe('generated Cho client pack', () => {
  afterAll(async () => {
    await Promise.all([db.packs.clear(), db.problems.clear(), db.settings.clear()]);
  });

  it('installs all hashed shards and validates all 861 ProblemV1 records', async () => {
    const fetcher: typeof fetch = async input => {
      const name = new URL(String(input)).pathname.split('/').at(-1)!;
      try {
        const bytes = await readFile(resolve(packDirectory, name));
        return new Response(Uint8Array.from(bytes).buffer);
      } catch {
        return new Response(null, { status: 404 });
      }
    };
    const problems = await loadPackCatalog({
      packId: CHO_PACK_ID,
      revision: CHO_PACK_REVISION,
      manifestUrl: 'https://local.test/packs/cho-elementary/1/manifest.json',
      expectedProblemCount: CHO_PROBLEM_COUNT,
      fetch: fetcher,
    });
    expect(problems).toHaveLength(861);
    expect(new Set(problems.map(problem => problem.problemId)).size).toBe(861);
    expect(problems[0]?.problemId).toBe('cho-elementary-0001');
    expect(problems.at(-1)?.problemId).toBe('cho-elementary-0900');
    for (const problem of problems) await expectReplay(problem);
  });
});

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
