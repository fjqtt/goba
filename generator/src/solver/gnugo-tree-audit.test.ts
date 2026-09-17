import { describe, expect, it } from 'vitest';
import type { Position } from '../domain';
import { auditGnuGoTree, auditMoveLine } from './gnugo-tree-audit';

const position: Position = {
  boardSize: 9,
  setup: { black: [10], white: [11] },
  history: { policy: 'fresh-position', moves: [] },
  toPlay: 'B',
};

describe('GNU Go tree audit', () => {
  it('matches the complete source line and ignores the opposite-to-play diagnostic tree', () => {
    const tree = '(;SZ[9]AB[bb]AW[cb](;W[aa])(;B[cc];W[dd](;B[ee])(;B[ff])))';
    const audit = auditGnuGoTree(tree, position, [20], [['B', 20], ['W', 30], ['B', 40]]);
    expect(audit.fullSourceLineMatch).toBe(true);
    expect(audit.matchedSourcePlies).toBe(3);
    expect(audit.rootMoves).toEqual([20]);
    expect(audit.illegalEdges).toEqual([]);
    expect(audit.nodeCount).toBe(4);
  });

  it('reports missing roots and illegal tree edges', () => {
    const tree = '(;SZ[9]AB[bb]AW[cb](;B[bb])(;B[cc]))';
    const audit = auditGnuGoTree(tree, position, [20, 21], []);
    expect(audit.rootMoves).toEqual([20]);
    expect(audit.missingExpectedRootMoves).toEqual([21]);
    expect(audit.illegalEdges).toHaveLength(1);
    expect(audit.illegalEdges[0]!.reason).toBe('occupied');
  });

  it('replays the complete printable line with ld-v1 rules', () => {
    expect(auditMoveLine(position, [['B', 20], ['W', 30], ['B', 40]])).toEqual({
      legal: true,
      legalPlies: 3,
    });
    expect(auditMoveLine(position, [['B', 10]])).toEqual({
      legal: false,
      legalPlies: 0,
      error: { ply: 1, reason: 'occupied' },
    });
  });
});
