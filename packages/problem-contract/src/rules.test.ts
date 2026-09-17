import GoBoard from '@sabaki/go-board';
import { describe, expect, it } from 'vitest';
import { applyMove, situationKey, type RulesState } from './rules';

function state(rows: number[][], toPlay: 'B' | 'W' = 'B'): RulesState {
  const board = new GoBoard(rows as Array<Array<0 | 1 | -1>>);
  return {
    board,
    toPlay,
    seenSituations: new Set([situationKey(board.signMap, toPlay)]),
    aliveAnchors: new Set(),
    ply: 0,
  };
}

describe('ld-v1 RulesAdapter', () => {
  it('captures a surrounded chain', () => {
    const before = state([
      [0, 1, 0],
      [1, -1, 0],
      [0, 1, 0],
    ]);
    const result = applyMove(before, 'B', 5, 3);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.captured).toEqual([4]);
      expect(result.state.board.get([1, 1])).toBe(0);
    }
  });

  it('rejects suicide and occupied points', () => {
    const before = state([
      [0, -1, 0],
      [-1, 0, -1],
      [0, -1, 0],
    ]);
    expect(applyMove(before, 'B', 4, 3)).toEqual({ ok: false, reason: 'suicide' });
    expect(applyMove(before, 'B', 1, 3)).toEqual({ ok: false, reason: 'occupied' });
  });

  it('checks situational superko but permits pass independently', () => {
    const before = state([
      [0, 0],
      [0, 0],
    ]);
    const candidate = before.board.makeMove(1, [0, 0]);
    before.seenSituations = new Set([
      ...before.seenSituations,
      situationKey(candidate.signMap, 'W'),
    ]);
    expect(applyMove(before, 'B', 0, 2)).toEqual({ ok: false, reason: 'superko' });
    expect(applyMove(before, 'B', 'pass', 2).ok).toBe(true);
  });

  it('does not restore target identity when a point is occupied later', () => {
    const before = state([
      [0, 1, 0],
      [1, -1, 0],
      [0, 1, 0],
    ]);
    before.aliveAnchors = new Set([4]);
    const capture = applyMove(before, 'B', 5, 3);
    expect(capture.ok).toBe(true);
    if (!capture.ok) return;
    expect(capture.state.aliveAnchors.has(4)).toBe(false);
    const pass = applyMove(capture.state, 'W', 'pass', 3);
    expect(pass.ok).toBe(true);
    if (!pass.ok) return;
    const replace = applyMove(pass.state, 'B', 4, 3);
    expect(replace.ok).toBe(true);
    if (replace.ok) expect(replace.state.aliveAnchors.has(4)).toBe(false);
  });
});
