import { applyMove, createRulesState, type Color, type RulesState } from '@goba/problem-contract';
import type { Position } from '../domain';

export type WrongBranch = {
  /** Index of the student node along the printable line (0-based ply). */
  ply: number;
  /** The wrong student move being classified. */
  move: number;
  /** Prepared opponent refutation reply; absent when the failure is immediate. */
  refutation?: number;
  evidence: {
    refuteCode: number;
    refuteMove: string;
    verifyCode: number;
    policy?: number;
    localPolicyRank?: number;
  };
};

export type SkippedCandidate = {
  move: number;
  reason: 'unrefuted-inconsistent' | 'recovery-found' | 'illegal-refutation' | 'refute-error';
};

export type NodeExpansion = {
  ply: number;
  candidateCount: number;
  acceptedMoves: number[];
  bookMoveAccepted: boolean;
  /** Accepted moves that are not the printable-line move: possible alternative solutions, review only. */
  alternativeCorrectCandidates: number[];
  skipped: SkippedCandidate[];
};

export type ProblemRefutations = {
  problemNumber: number;
  status: 'expanded' | 'book-move-rejected' | 'error';
  goalKind: 'live' | 'capture';
  targetAnchor: number;
  wrongBranches: WrongBranch[];
  nodes: NodeExpansion[];
  wallMs: number;
  error?: string;
};

export type RefutationReport = {
  schemaVersion: 1;
  verification: 'heuristic-candidate-only';
  solver: string;
  auditReportSha256: string;
  configuration: {
    maxWrongPerNode: number;
    start: number;
    count: number;
    concurrency: number;
  };
  summary: Record<string, number>;
  results: ProblemRefutations[];
};

/** Plies of the printable line at which the student is to move. */
export function studentPlies(line: Array<[Color, number]>, studentColor: Color): number[] {
  return line.flatMap(([color], index) => (color === studentColor ? [index] : []));
}

/** Replays a line prefix on the setup position; undefined when a ply is illegal. */
export function replayPrefix(
  position: Position,
  prefix: Array<[Color, number]>,
): RulesState | undefined {
  let state = createRulesState(minimalReplayProblem(position));
  for (const [color, move] of prefix) {
    const replay = applyMove(state, color, move, position.boardSize);
    if (!replay.ok) return undefined;
    state = replay.state;
  }
  return state;
}

/** Empty points inside the viewport for the replayed state. */
export function emptyViewportPoints(
  state: RulesState,
  viewport: { x0: number; y0: number; x1: number; y1: number },
  boardSize: number,
): number[] {
  const points: number[] = [];
  for (let y = viewport.y0; y <= viewport.y1; y += 1) {
    for (let x = viewport.x0; x <= viewport.x1; x += 1) {
      if (state.board.signMap[y]![x] === 0) points.push(y * boardSize + x);
    }
  }
  return points;
}

/**
 * Ranks rejected candidates by KataGo policy at the node state, highest first.
 * Candidates without policy data sort last, in stable point order.
 */
export function rankByPolicy(moves: number[], policy: number[] | undefined): number[] {
  return [...moves]
    .map(move => ({ move, value: policy?.[move] ?? -1 }))
    .sort((left, right) => right.value - left.value || left.move - right.move)
    .map(entry => entry.move);
}

/**
 * Keeps only points within Chebyshev distance `radius` of a reference point: the target
 * group's stones and the solution-line points. Distant tenuki or outside-wall attachments
 * are implausible learner mistakes and stay unclassified instead of becoming wrong branches.
 */
export function nearPoints(moves: number[], references: number[], radius: number, boardSize: number): number[] {
  const coordinates = references.map(point => [point % boardSize, Math.floor(point / boardSize)] as const);
  return moves.filter(move => {
    const x = move % boardSize;
    const y = Math.floor(move / boardSize);
    return coordinates.some(([rx, ry]) => Math.abs(rx - x) <= radius && Math.abs(ry - y) <= radius);
  });
}

function minimalReplayProblem(position: Position) {
  const anchor = position.setup.black[0] ?? position.setup.white[0]!;
  return {
    schemaVersion: 1 as const,
    problemId: 'refutation-expansion-replay',
    revision: 1,
    learningVersion: 1,
    semanticHash: `sha256:${'0'.repeat(64)}`,
    boardSize: position.boardSize,
    setup: position.setup,
    toPlay: position.toPlay,
    studentColor: position.toPlay,
    history: position.history,
    rules: {
      profile: 'ld-v1' as const, suicide: 'forbidden' as const,
      repetition: 'situational-superko' as const, externalKo: 'none' as const, pass: 'allowed' as const,
    },
    goal: {
      kind: 'live' as const, targetColor: 'B' as const, anchors: [anchor],
      quantifier: 'any-unconditionally-alive' as const, seki: 'unsupported' as const, ko: 'unsupported' as const,
    },
    viewport: { x0: 0, y0: 0, x1: position.boardSize - 1, y1: position.boardSize - 1 },
    nodes: [{
      toPlay: position.toPlay,
      stateHash: `sha256:${'0'.repeat(64)}`,
      edges: [],
      coverage: { kind: 'listed-only' as const, defaultVerdict: 'unclassified' as const },
      terminal: {
        result: 'success' as const, outcome: 'unconditional-life' as const, explanation: 'replay placeholder',
      },
    }],
    root: 0,
    verification: {
      level: 'candidate' as const, auditId: 'refutation-expansion-replay',
      adapterVersion: 'replay-v1', scope: 'declared-position-and-rules' as const,
    },
    source: { collection: 'replay', attribution: '', licenseId: 'LicenseRef-Restricted-Research' },
    difficulty: { band: 'unknown', status: 'estimated' as const },
    tags: [],
  };
}
