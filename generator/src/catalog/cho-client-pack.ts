import {
  applyMove,
  createRulesState,
  hashProblemSemantics,
  hashRulesState,
  validateProblem,
  type Color,
  type ProblemV1,
  type RulesState,
} from '@goba/problem-contract';
import type { Position } from '../domain';
import type { WrongBranch } from './refutation-expansion';

export type ChoAuditCandidate = {
  goalKind: 'live' | 'capture';
  targetColor: Color;
  anchor: number;
  primaryMove?: string;
};

export type ChoAuditResult = {
  problemNumber: number;
  status: string;
  expectedRootMoves: number[];
  sourceLine: Array<[Color, number]>;
  sourceLineReplay: { legal: boolean };
  selectedTarget?: number;
  candidates: ChoAuditCandidate[];
};

export async function buildChoClientProblem(input: {
  audit: ChoAuditResult;
  position: Position;
  corpus: 'exact' | 'reconciled';
  refutations?: WrongBranch[];
}): Promise<ProblemV1 | undefined> {
  const selected = input.audit.candidates.find(candidate => candidate.anchor === input.audit.selectedTarget);
  if (!selected || !input.audit.sourceLineReplay.legal || input.audit.expectedRootMoves.length === 0) {
    return undefined;
  }
  const wrongBranches = input.refutations ?? [];
  const nodes = buildLineNodes(
    input.position, input.audit.sourceLine, input.audit.expectedRootMoves, selected.goalKind, wrongBranches,
  );
  const problem: ProblemV1 = {
    schemaVersion: 1,
    problemId: `cho-elementary-${String(input.audit.problemNumber).padStart(4, '0')}`,
    revision: 3,
    learningVersion: 1,
    semanticHash: emptyHash(),
    boardSize: input.position.boardSize,
    setup: input.position.setup,
    toPlay: input.position.toPlay,
    studentColor: input.position.toPlay,
    history: input.position.history,
    rules: {
      profile: 'ld-v1', suicide: 'forbidden', repetition: 'situational-superko',
      externalKo: 'none', pass: 'allowed',
    },
    goal: {
      kind: selected.goalKind,
      targetColor: selected.targetColor,
      anchors: [selected.anchor],
      quantifier: selected.goalKind === 'capture' ? 'all-captured' : 'any-unconditionally-alive',
      seki: 'unsupported', ko: 'unsupported',
    },
    // Wrong branches and their refutation replies must stay visible on the cropped board.
    viewport: choViewport(input.position, [
      ...input.audit.expectedRootMoves,
      ...input.audit.sourceLine.map(([, point]) => point),
      ...wrongBranches.flatMap(branch => (
        branch.refutation === undefined ? [branch.move] : [branch.move, branch.refutation]
      )),
    ]),
    nodes,
    root: 0,
    verification: {
      // Heuristic GNU Go/KataGo evidence is candidate material, never solver proof.
      level: 'candidate',
      auditId: `cho-2026-09-16-${input.corpus}-${input.audit.status}`
        + (wrongBranches.length > 0 ? '+refutations-2026-09-18' : ''),
      adapterVersion: 'printable-key+gnugo-3.8+katago-1.16.2-candidate-v1',
      scope: 'declared-position-and-rules',
    },
    source: {
      collection: 'Cho Chikun — Encyclopedia of Life and Death, Elementary',
      attribution: 'Restricted local research corpus; printable line cross-checked with GNU Go and KataGo',
      licenseId: 'LicenseRef-Restricted-Research',
    },
    difficulty: { band: 'elementary', status: 'estimated' },
    tags: [
      'life-and-death', 'cho-elementary', 'restricted-local', 'candidate', input.corpus, input.audit.status,
      ...(wrongBranches.length > 0 ? ['has-refutations'] : []),
    ],
  };
  problem.semanticHash = await hashProblemSemantics(problem);
  await assignStateHashes(problem);
  const validation = validateProblem(problem);
  if (!validation.ok) {
    throw new Error(
      `Problem ${input.audit.problemNumber} is invalid: ${validation.errors.map(error => error.message).join('; ')}`,
    );
  }
  return validation.problem;
}

function buildLineNodes(
  position: Position,
  line: Array<[Color, number]>,
  expectedRoots: number[],
  goalKind: 'live' | 'capture',
  wrongBranches: WrongBranch[] = [],
): ProblemV1['nodes'] {
  const terminalOutcome = goalKind === 'capture' ? 'target-captured' : 'unconditional-life';
  if (line.length === 0) {
    const root = node(position.toPlay, []);
    const nodes: ProblemV1['nodes'] = [root];
    for (const move of unique(expectedRoots)) {
      const next = nodes.length;
      root.edges.push(edge(move, next, 'solution'));
      nodes.push(terminal(opposite(position.toPlay), terminalOutcome));
    }
    return nodes;
  }

  const nodes: ProblemV1['nodes'] = line.map(([color], index) => {
    const [, move] = line[index]!;
    const next = index + 1;
    return node(color, [edge(move, next, color === position.toPlay ? 'solution' : 'opponent')],
      color === position.toPlay ? undefined : 0);
  });
  nodes.push(terminal(opposite(line.at(-1)![0]), terminalOutcome));
  appendWrongBranches(nodes, position, line, goalKind, wrongBranches);
  return nodes;
}

function appendWrongBranches(
  nodes: ProblemV1['nodes'],
  position: Position,
  line: Array<[Color, number]>,
  goalKind: 'live' | 'capture',
  wrongBranches: WrongBranch[],
): void {
  // The goal fails from the student's perspective: a live target dies, a capture target survives.
  const failureOutcome = goalKind === 'live' ? 'target-captured' : 'unconditional-life';
  const failureExplanation = goalKind === 'live' ? 'Группа не живёт.' : 'Группа соперника выжила.';
  for (const branch of wrongBranches) {
    const lineNode = nodes[branch.ply];
    if (branch.ply >= line.length || line[branch.ply]![0] !== position.toPlay || !lineNode) {
      throw new Error(`Wrong branch at ply ${branch.ply} does not match a student node of the line`);
    }
    if (lineNode.edges.some(existing => existing.move === branch.move)) {
      throw new Error(`Wrong branch move ${branch.move} duplicates an existing edge at ply ${branch.ply}`);
    }
    const student = position.toPlay;
    const wrongEdge: ProblemV1['nodes'][number]['edges'][number] = {
      move: branch.move, next: nodes.length, verdict: 'wrong', role: 'refutation',
    };
    lineNode.edges.push(wrongEdge);
    if (branch.refutation === undefined) {
      nodes.push({
        ...node(opposite(student), []),
        terminal: { result: 'failure', outcome: failureOutcome, explanation: failureExplanation },
      });
      continue;
    }
    nodes.push(node(opposite(student), [{
      move: branch.refutation, next: nodes.length + 1, verdict: 'wrong', role: 'opponent',
    }], 0));
    nodes.push({
      ...node(student, []),
      terminal: { result: 'failure', outcome: failureOutcome, explanation: failureExplanation },
    });
  }
}

async function assignStateHashes(problem: ProblemV1): Promise<void> {
  const seen = new Map<number, string>();
  const visit = async (nodeId: number, state: RulesState): Promise<void> => {
    const stateHash = await hashRulesState(state);
    const prior = seen.get(nodeId);
    if (prior && prior !== stateHash) throw new Error(`Node ${nodeId} merges incompatible histories`);
    if (prior) return;
    seen.set(nodeId, stateHash);
    problem.nodes[nodeId]!.stateHash = stateHash;
    for (const branch of problem.nodes[nodeId]!.edges) {
      const result = applyMove(state, problem.nodes[nodeId]!.toPlay, branch.move, problem.boardSize);
      if (!result.ok) throw new Error(`Illegal generated edge at node ${nodeId}: ${result.reason}`);
      await visit(branch.next, result.state);
    }
  };
  await visit(problem.root, createRulesState(problem));
}

function node(
  toPlay: Color,
  edges: ProblemV1['nodes'][number]['edges'],
  defaultReply?: number,
): ProblemV1['nodes'][number] {
  return {
    toPlay,
    stateHash: emptyHash(),
    edges,
    coverage: { kind: 'listed-only', defaultVerdict: 'unclassified' },
    ...(defaultReply === undefined ? {} : { defaultReply }),
  };
}

function terminal(
  toPlay: Color,
  outcome: 'target-captured' | 'unconditional-life',
): ProblemV1['nodes'][number] {
  return {
    ...node(toPlay, []),
    terminal: { result: 'success', outcome, explanation: 'Решено.' },
  };
}

function edge(
  move: number,
  next: number,
  role: 'solution' | 'opponent',
): ProblemV1['nodes'][number]['edges'][number] {
  return { move, next, verdict: 'correct', role };
}

export function choViewport(position: Position, linePoints: number[]): ProblemV1['viewport'] {
  const points = [...position.setup.black, ...position.setup.white, ...linePoints];
  const xs = points.map(point => point % position.boardSize);
  const ys = points.map(point => Math.floor(point / position.boardSize));
  return {
    x0: Math.max(0, Math.min(...xs) - 1),
    y0: Math.max(0, Math.min(...ys) - 1),
    x1: Math.min(position.boardSize - 1, Math.max(...xs) + 1),
    y1: Math.min(position.boardSize - 1, Math.max(...ys) + 1),
  };
}

function opposite(color: Color): Color { return color === 'B' ? 'W' : 'B'; }
function unique(values: number[]): number[] { return [...new Set(values)].sort((a, b) => a - b); }
function emptyHash(): string { return `sha256:${'0'.repeat(64)}`; }
