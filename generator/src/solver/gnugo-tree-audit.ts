import sgf, { type SgfNode } from '@sabaki/sgf';
import { applyMove, createRulesState, vertexToPoint, type Color, type ProblemV1 } from '@goba/problem-contract';
import type { Position } from '../domain';

export type TreeAudit = {
  nodeCount: number;
  legalEdges: number;
  illegalEdges: Array<{ path: Array<[Color, number | 'pass']>; reason: string }>;
  leafCount: number;
  maxDepth: number;
  rootMoves: number[];
  missingExpectedRootMoves: number[];
  extraRootMoves: number[];
  matchedSourcePlies: number;
  fullSourceLineMatch: boolean;
};

export function auditMoveLine(
  position: Position,
  line: Array<[Color, number]>,
): { legal: boolean; legalPlies: number; error?: { ply: number; reason: string } } {
  let state = createRulesState(minimalProblem(position));
  for (const [index, [color, move]] of line.entries()) {
    const replay = applyMove(state, color, move, position.boardSize);
    if (!replay.ok) return { legal: false, legalPlies: index, error: { ply: index + 1, reason: replay.reason } };
    state = replay.state;
  }
  return { legal: true, legalPlies: line.length };
}

export function auditGnuGoTree(
  rawTree: string,
  position: Position,
  expectedRootMoves: number[],
  sourceLine: Array<[Color, number]>,
): TreeAudit {
  const roots = sgf.parse(rawTree);
  const initial = createRulesState(minimalProblem(position));
  let nodeCount = 0;
  let legalEdges = 0;
  let leafCount = 0;
  let maxDepth = 0;
  let matchedSourcePlies = 0;
  const illegalEdges: TreeAudit['illegalEdges'] = [];
  const rootMoves = new Set<number>();

  const visit = (
    node: SgfNode,
    state: ReturnType<typeof createRulesState>,
    path: Array<[Color, number | 'pass']>,
  ): void => {
    const move = readMove(node, position.boardSize);
    let nextState = state;
    let nextPath = path;
    if (move) {
      nodeCount += 1;
      const replay = applyMove(state, move[0], move[1], position.boardSize);
      nextPath = [...path, move];
      if (!replay.ok) {
        illegalEdges.push({ path: nextPath, reason: replay.reason });
        return;
      }
      legalEdges += 1;
      nextState = replay.state;
      maxDepth = Math.max(maxDepth, nextPath.length);
      if (nextPath.length === 1 && move[1] !== 'pass') rootMoves.add(move[1]);
      matchedSourcePlies = Math.max(matchedSourcePlies, commonPrefix(nextPath, sourceLine));
    }
    if (node.children.length === 0) leafCount += 1;
    for (const child of node.children) visit(child, nextState, nextPath);
  };

  for (const root of roots) {
    for (const child of root.children) {
      const move = readMove(child, position.boardSize);
      // --decide-owl emits both "attacker first" and "defender first" analyses.
      // Only the subtree matching the actual side to play belongs to this task.
      if (move?.[0] === position.toPlay) visit(child, initial, []);
    }
  }

  const actualRoots = [...rootMoves].sort(numeric);
  const expected = [...new Set(expectedRootMoves)].sort(numeric);
  return {
    nodeCount,
    legalEdges,
    illegalEdges,
    leafCount,
    maxDepth,
    rootMoves: actualRoots,
    missingExpectedRootMoves: expected.filter(point => !rootMoves.has(point)),
    extraRootMoves: actualRoots.filter(point => !expected.includes(point)),
    matchedSourcePlies,
    fullSourceLineMatch: sourceLine.length > 0 && matchedSourcePlies === sourceLine.length,
  };
}

function readMove(node: SgfNode, boardSize: number): [Color, number | 'pass'] | undefined {
  const color: Color | undefined = node.data.B ? 'B' : node.data.W ? 'W' : undefined;
  if (!color) return undefined;
  const value = (node.data[color] ?? [''])[0] ?? '';
  if (value === '') return [color, 'pass'];
  return [color, vertexToPoint(sgf.parseVertex(value), boardSize)];
}

function commonPrefix(
  actual: Array<[Color, number | 'pass']>,
  expected: Array<[Color, number]>,
): number {
  let index = 0;
  while (
    index < actual.length
    && index < expected.length
    && actual[index]![0] === expected[index]![0]
    && actual[index]![1] === expected[index]![1]
  ) index += 1;
  return index;
}

function minimalProblem(position: Position): ProblemV1 {
  const anchor = position.setup.black[0] ?? position.setup.white[0]!;
  return {
    schemaVersion: 1,
    problemId: 'gnugo-tree-audit',
    revision: 1,
    learningVersion: 1,
    semanticHash: `sha256:${'0'.repeat(64)}`,
    boardSize: position.boardSize,
    setup: position.setup,
    toPlay: position.toPlay,
    studentColor: position.toPlay,
    history: position.history,
    rules: {
      profile: 'ld-v1', suicide: 'forbidden', repetition: 'situational-superko',
      externalKo: 'none', pass: 'allowed',
    },
    goal: {
      kind: 'live', targetColor: 'B', anchors: [anchor], quantifier: 'any-unconditionally-alive',
      seki: 'unsupported', ko: 'unsupported',
    },
    viewport: { x0: 0, y0: 0, x1: position.boardSize - 1, y1: position.boardSize - 1 },
    nodes: [{
      toPlay: position.toPlay,
      stateHash: `sha256:${'0'.repeat(64)}`,
      edges: [],
      coverage: { kind: 'listed-only', defaultVerdict: 'unclassified' },
      terminal: { result: 'success', outcome: 'unconditional-life', explanation: 'audit placeholder' },
    }],
    root: 0,
    verification: {
      level: 'solver-checked', auditId: 'gnugo-tree-audit', adapterVersion: 'audit-v1',
      scope: 'declared-position-and-rules',
    },
    source: { collection: 'audit', attribution: '', licenseId: 'LicenseRef-Restricted-Research' },
    difficulty: { band: 'unknown', status: 'estimated' },
    tags: [],
  };
}

function numeric(left: number, right: number): number {
  return left - right;
}
