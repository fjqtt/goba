import { describe, expect, it } from 'vitest';
import { validateProblem } from '@goba/problem-contract';
import { buildChoClientProblem } from './cho-client-pack';

describe('Cho client pack normalizer', () => {
  it('builds and hashes every ply of a printable line', async () => {
    const problem = await buildChoClientProblem({
      corpus: 'exact',
      position: {
        boardSize: 19,
        setup: { black: [19], white: [0] },
        history: { policy: 'fresh-position', moves: [] },
        toPlay: 'B',
      },
      audit: {
        problemNumber: 7,
        status: 'full-line-match',
        expectedRootMoves: [1],
        sourceLine: [['B', 1], ['W', 2], ['B', 20]],
        sourceLineReplay: { legal: true },
        selectedTarget: 0,
        candidates: [{ goalKind: 'capture', targetColor: 'W', anchor: 0 }],
      },
    });
    expect(problem).toBeDefined();
    expect(problem?.nodes).toHaveLength(4);
    expect(problem?.nodes[1]?.defaultReply).toBe(0);
    expect(problem?.nodes.at(-1)?.terminal?.result).toBe('success');
    expect(validateProblem(problem).ok).toBe(true);
  });

  it('keeps every listed root alternative and rejects unsafe records', async () => {
    const base = {
      problemNumber: 9,
      status: 'all-root-moves-covered',
      expectedRootMoves: [1, 2],
      sourceLine: [],
      sourceLineReplay: { legal: true },
      selectedTarget: 0,
      candidates: [{ goalKind: 'capture' as const, targetColor: 'W' as const, anchor: 0 }],
    };
    const position = {
      boardSize: 19 as const,
      setup: { black: [19], white: [0] },
      history: { policy: 'fresh-position' as const, moves: [] as [] },
      toPlay: 'B' as const,
    };
    const problem = await buildChoClientProblem({ corpus: 'exact', position, audit: base });
    expect(problem?.nodes[0]?.edges.map(edge => edge.move)).toEqual([1, 2]);
    expect(await buildChoClientProblem({
      corpus: 'exact', position, audit: { ...base, sourceLineReplay: { legal: false } },
    })).toBeUndefined();
  });
});
