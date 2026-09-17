import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { CanonicalTask, SolveRequest } from '../domain';
import { canonicalTaskToGnuGoSgf, executeGnuGoJob, parseGtpResponses } from './gnugo-adapter';

const task: CanonicalTask = {
  taskVersion: 1,
  draftId: 'cho-volume-1-problem-8',
  draftRevision: 1,
  position: {
    boardSize: 19,
    setup: {
      black: [20, 21, 22, 23],
      white: [39, 40, 41, 42, 43, 44, 45, 77],
    },
    history: { policy: 'fresh-position', moves: [] },
    toPlay: 'B',
  },
  goal: {
    kind: 'live', targetColor: 'B', anchors: [20, 21, 22, 23],
    quantifier: 'any-unconditionally-alive', seki: 'unsupported', ko: 'unsupported',
  },
  studentColor: 'B',
  rules: {
    profile: 'ld-v1', suicide: 'forbidden', repetition: 'situational-superko',
    externalKo: 'none', pass: 'allowed',
  },
  boundary: { kind: 'full-board', assumptions: [] },
  viewport: { x0: 0, y0: 0, x1: 8, y1: 5 },
  transformations: [],
  source: {
    assetSha256: 'sha256:restricted-fixture', sourceUri: 'local-research-fixture', pageOrNodePath: '/8',
    licenseId: 'LicenseRef-Restricted-Research', distribution: 'restricted',
  },
  confirmed: { boardBy: 'known-corpus', goalBy: 'known-corpus', at: '2026-09-16T00:00:00.000Z' },
  semanticHash: 'sha256:fixture',
};

function request(): SolveRequest {
  return {
    jobId: 'gnugo-fixture-job', task, forcedPath: [],
    limits: { wallMs: 10_000, maxNodes: 100_000, memoryMiB: 128 },
    seed: 0, configurationId: 'gnu-go@3.8/owl/adapter-v1/ld-v1', wrongMoveDepth: 1,
  };
}

describe('GNU Go Owl adapter', () => {
  it('encodes the full position and parses numbered GTP responses', () => {
    expect(canonicalTaskToGnuGoSgf(task)).toContain('AB[bb][cb][db][eb]');
    expect(canonicalTaskToGnuGoSgf(task)).toContain('MA[bb]');
    expect(parseGtpResponses('=1 1 A18\n\n?2 invalid coordinate\n\n')).toEqual([
      { id: 1, success: true, body: '1 A18' },
      { id: 2, success: false, body: 'invalid coordinate' },
    ]);
  });

  const hasGnuGo = [process.env.GNUGO_BIN, '/opt/homebrew/bin/gnugo', '/usr/local/bin/gnugo']
    .some(path => Boolean(path && existsSync(path)));

  it.runIf(hasGnuGo)('matches the known first move but keeps the result unproven', async () => {
    const result = await executeGnuGoJob(request());
    const raw = JSON.parse(result.artifacts.rawResult) as {
      verification: string;
      rootMove?: string;
      acceptedAlternatives: string[];
    };
    expect(result.status).toBe('unknown');
    expect(result.outcome).toBe('unknown');
    expect(raw.verification).toBe('heuristic-candidate-only');
    expect(raw.rootMove).toBe('A18');
    expect(raw.acceptedAlternatives).toContain('A18');
    expect(result.artifacts.rawTree).toContain(';B[ab]');
  }, 15_000);
});
