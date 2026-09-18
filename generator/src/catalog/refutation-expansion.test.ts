import { describe, expect, it } from 'vitest';
import type { Position } from '../domain';
import {
  emptyViewportPoints,
  nearPoints,
  rankByPolicy,
  replayPrefix,
  studentPlies,
} from './refutation-expansion';

const position: Position = {
  boardSize: 19,
  setup: { black: [19], white: [0] },
  history: { policy: 'fresh-position', moves: [] },
  toPlay: 'B',
};

describe('refutation expansion helpers', () => {
  it('finds the student decision plies of a line', () => {
    expect(studentPlies([['B', 1], ['W', 2], ['B', 20]], 'B')).toEqual([0, 2]);
    expect(studentPlies([], 'B')).toEqual([]);
  });

  it('replays prefixes with captures and rejects illegal plies', () => {
    // B1 (B19) captures the lone white stone at A19, so point 0 becomes empty again.
    const state = replayPrefix(position, [['B', 1]]);
    expect(state).toBeDefined();
    expect(emptyViewportPoints(state!, { x0: 0, y0: 0, x1: 2, y1: 1 }, 19)).toEqual([0, 2, 20, 21]);
    expect(replayPrefix(position, [['B', 0]])).toBeUndefined(); // occupied point
  });

  it('keeps only plausible points near the fight', () => {
    // References: the white target stone at A19 (0). Radius 1 covers B19/A18/B18 only.
    expect(nearPoints([1, 20, 39, 60], [0], 1, 19)).toEqual([1, 20]);
    expect(nearPoints([39], [0], 2, 19)).toEqual([39]);
  });

  it('ranks candidates by policy with missing values last', () => {
    const policy = new Array(362).fill(0);
    policy[5] = 0.5;
    policy[7] = 0.9;
    expect(rankByPolicy([5, 6, 7], policy)).toEqual([7, 5, 6]);
    expect(rankByPolicy([9, 4], undefined)).toEqual([4, 9]);
  });
});
