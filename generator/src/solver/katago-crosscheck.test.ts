import { describe, expect, it } from 'vitest';
import type { Position } from '../domain';
import {
  gtpToPoint,
  makeKataGoQuery,
  pointToGtp,
  policyRank,
  prefixKey,
  readGeneratedMovesByPrefix,
  type CrosscheckMetadata,
} from './katago-crosscheck';

const position: Position = {
  boardSize: 19,
  setup: { black: [0], white: [1] },
  history: { policy: 'fresh-position', moves: [] },
  toPlay: 'B',
};

describe('KataGo cross-check helpers', () => {
  it('round-trips SGF-oriented points through GTP coordinates', () => {
    expect(pointToGtp(0, 19)).toBe('A19');
    expect(pointToGtp(18, 19)).toBe('T19');
    expect(pointToGtp(360, 19)).toBe('T1');
    expect(gtpToPoint('A19', 19)).toBe(0);
    expect(gtpToPoint('T1', 19)).toBe(360);
  });

  it('restricts the requested turn to the declared local moves', () => {
    const metadata: CrosscheckMetadata = {
      id: 'test', corpus: 'exact', problemNumber: 1, auditStatus: 'root-only-match', ply: 1,
      position, prefix: [['B', 19]], player: 'W', expectedMoves: [20], generatorMoves: [38],
      expectedMoveLegality: 'legal', allowedMoves: [20, 38],
    };
    expect(makeKataGoQuery(metadata, 32)).toMatchObject({
      id: 'test', rules: 'aga', moves: [['B', 'A18']], analyzeTurns: [1], maxVisits: 32,
      allowMoves: [{ player: 'W', moves: ['B18', 'A17'], untilDepth: 2 }],
    });
  });

  it('ranks policy only among the locally allowed moves', () => {
    const policy = Array<number>(362).fill(-1);
    policy[20] = 0.2;
    policy[38] = 0.5;
    policy[39] = 0.1;
    expect(policyRank(policy, 20, [20, 38, 39])).toEqual({ rank: 2, value: 0.2 });
  });

  it('maps generated continuations to every matching prefix', () => {
    const tree = '(;SZ[19](;B[aa];W[ab](;B[ac])(;B[bc]))(;W[bb]))';
    const generated = readGeneratedMovesByPrefix(tree, position);
    expect(generated.get('')).toEqual([0]);
    expect(generated.get(prefixKey([['B', 0]]))).toEqual([19]);
    expect(generated.get(prefixKey([['B', 0], ['W', 19]]))).toEqual([38, 39]);
  });
});
