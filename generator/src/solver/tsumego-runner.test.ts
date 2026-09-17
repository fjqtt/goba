import { describe, expect, it } from 'vitest';
import type { CanonicalTask, SolveRequest } from '../domain';
import { canonicalTaskToSolverSgf, runTsumegoJs } from './tsumego-runner';

const task: CanonicalTask = {
  taskVersion: 1,
  draftId: 'readme-fixture',
  draftRevision: 1,
  position: {
    boardSize: 9,
    setup: {
      black: [36, 37, 38, 39, 40, 49, 56, 58, 59, 68, 69, 70, 72, 76, 79],
      white: [57, 63, 64, 65, 67, 75],
    },
    history: { policy: 'fresh-position', moves: [] },
    toPlay: 'W',
  },
  goal: {
    kind: 'live', targetColor: 'W', anchors: [65],
    quantifier: 'any-unconditionally-alive', seki: 'unsupported', ko: 'unsupported',
  },
  studentColor: 'W',
  rules: {
    profile: 'ld-v1', suicide: 'forbidden', repetition: 'situational-superko',
    externalKo: 'none', pass: 'allowed',
  },
  boundary: { kind: 'full-board', assumptions: [] },
  viewport: { x0: 0, y0: 4, x1: 8, y1: 8 },
  transformations: [],
  source: {
    assetSha256: 'sha256:fixture', sourceUri: 'tsumego.js README', pageOrNodePath: 'fixture',
    licenseId: 'Apache-2.0', distribution: 'allowed',
  },
  confirmed: { boardBy: 'upstream-fixture', goalBy: 'upstream-fixture', at: '2026-09-16T00:00:00.000Z' },
  semanticHash: 'sha256:fixture',
};

function requestFor(overrides: Partial<CanonicalTask> = {}): SolveRequest {
  return {
    jobId: 'fixture-job',
    task: { ...task, ...overrides },
    forcedPath: [],
    limits: { wallMs: 5_000, maxNodes: 10_000, memoryMiB: 128 },
    seed: 0,
    configurationId: 'fixture',
    wrongMoveDepth: 1,
  };
}

describe('tsumego.js runner', () => {
  it('preserves the canonical position and finds both documented winning moves', async () => {
    expect(canonicalTaskToSolverSgf(task)).toContain('MA[ch]PL[W]');
    const result = await runTsumegoJs(requestFor());
    const raw = JSON.parse(result.artifacts.rawResult) as { rootMove: string; proofs: string[] };
    expect(result.status).toBe('proven-win');
    expect(result.outcome).toBe('unconditional-life');
    expect(raw.rootMove).toBe('W[bf]');
    expect(raw.proofs).toEqual(expect.arrayContaining(['W[bf]', 'W[bg]']));
  }, 10_000);

  it('rejects a target whose connected empty region is outside the restricted lane', async () => {
    const openTask: CanonicalTask = {
      ...task,
      position: {
        ...task.position,
        setup: { black: [0], white: [40] },
      },
      goal: { ...task.goal, anchors: [40] },
    };
    const result = await runTsumegoJs(requestFor(openTask));
    expect(result).toMatchObject({ status: 'unsupported', reason: 'scope' });
    expect(result.artifacts.rawResult).toContain('tsumego.js limit is 15');
  });
});
