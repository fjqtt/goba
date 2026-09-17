import { describe, expect, it } from 'vitest';
import type { ProblemV1 } from './schema';
import { validateProblem } from './schema';

function minimalProblem(): ProblemV1 {
  return {
    schemaVersion: 1,
    problemId: 'fixture-capture-01',
    revision: 1,
    learningVersion: 1,
    semanticHash: `sha256:${'0'.repeat(64)}`,
    boardSize: 9,
    setup: { black: [10], white: [19] },
    toPlay: 'B',
    studentColor: 'B',
    history: { policy: 'fresh-position', moves: [] },
    rules: {
      profile: 'ld-v1', suicide: 'forbidden', repetition: 'situational-superko',
      externalKo: 'none', pass: 'allowed',
    },
    goal: {
      kind: 'capture', targetColor: 'W', anchors: [19], quantifier: 'all-captured',
      seki: 'unsupported', ko: 'unsupported',
    },
    viewport: { x0: 0, y0: 0, x1: 4, y1: 4 },
    nodes: [{
      toPlay: 'B', stateHash: `sha256:${'1'.repeat(64)}`,
      edges: [{ move: 18, next: 1, verdict: 'correct', role: 'solution' }],
      coverage: { kind: 'listed-only', defaultVerdict: 'unclassified' },
    }, {
      toPlay: 'W', stateHash: `sha256:${'2'.repeat(64)}`, edges: [],
      coverage: { kind: 'listed-only', defaultVerdict: 'unclassified' },
      terminal: { result: 'success', outcome: 'target-captured', explanation: 'Captured.' },
    }],
    root: 0,
    verification: {
      level: 'solver-checked', auditId: 'fixture', adapterVersion: 'test',
      scope: 'declared-position-and-rules',
    },
    source: { collection: 'technical fixtures', attribution: '', licenseId: 'CC0-1.0' },
    difficulty: { band: 'fixture', status: 'estimated' },
    tags: ['fixture'],
  };
}

describe('ProblemV1 validation', () => {
  it('accepts a bounded acyclic problem with an explicit terminal', () => {
    expect(validateProblem(minimalProblem())).toEqual({ ok: true, problem: minimalProblem() });
  });

  it('keeps the required unclassified fallback', () => {
    const problem = minimalProblem() as unknown as Record<string, unknown>;
    const nodes = (problem.nodes as ProblemV1['nodes']);
    nodes[0]!.coverage.defaultVerdict = 'wrong' as 'unclassified';
    const result = validateProblem(problem);
    expect(result.ok).toBe(false);
  });

  it('rejects a missing terminal instead of treating a leaf as success', () => {
    const problem = minimalProblem();
    problem.nodes[1]!.terminal = undefined;
    const result = validateProblem(problem);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some(error => error.code === 'missing-terminal')).toBe(true);
  });

  it('rejects cycles in the teaching graph', () => {
    const problem = minimalProblem();
    problem.nodes[1]!.terminal = undefined;
    problem.nodes[1]!.edges.push({ move: 'pass', next: 0, verdict: 'wrong', role: 'opponent' });
    const result = validateProblem(problem);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some(error => error.code === 'cycle')).toBe(true);
  });
});
