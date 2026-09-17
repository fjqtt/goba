import { describe, expect, it } from 'vitest';
import { hashProblemSemantics } from './hash';
import type { ProblemSemantics } from './hash';

const problem: ProblemSemantics = {
  boardSize: 9,
  setup: { black: [2, 1], white: [10] },
  toPlay: 'B',
  studentColor: 'B',
  history: { policy: 'fresh-position', moves: [] },
  rules: {
    profile: 'ld-v1', suicide: 'forbidden', repetition: 'situational-superko',
    externalKo: 'none', pass: 'allowed',
  },
  goal: {
    kind: 'capture', targetColor: 'W', anchors: [10], quantifier: 'all-captured',
    seki: 'unsupported', ko: 'unsupported',
  },
};

describe('semantic hash contract', () => {
  it('is stable across setup ordering', async () => {
    const changed = structuredClone(problem);
    changed.setup.black.reverse();
    expect(await hashProblemSemantics(changed)).toBe(await hashProblemSemantics(problem));
  });

  it('changes when task semantics change', async () => {
    const changed = structuredClone(problem);
    changed.studentColor = 'W';
    expect(await hashProblemSemantics(changed)).not.toBe(await hashProblemSemantics(problem));
  });
});
