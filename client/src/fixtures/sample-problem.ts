import {
  applyMove,
  createRulesState,
  hashProblemSemantics,
  hashRulesState,
  validateProblem,
  type ProblemV1,
  type RulesState,
} from '@goba/problem-contract';

export const SAMPLE_COLLECTION_ID = 'cho-chikun-elementary-prototype';
export const SAMPLE_COLLECTION_TITLE = 'Чо Чикун · Начальный уровень';

/** A sourced external problem for local interaction testing, not release catalog content. */
export async function createSampleCatalog(): Promise<ProblemV1[]> {
  return Promise.all([choChikun408()].map(finalizeProblem));
}

export async function createSampleProblem(): Promise<ProblemV1> {
  return (await createSampleCatalog())[0]!;
}

/**
 * Tsumego Hero problem 408, from Life & Death — Elementary #3 (7k).
 * The source UI presents White to live, so colors are swapped from the downloaded SGF.
 * Coordinates stay unchanged.
 * SGF source tree:
 * (;...AB[...]AW[...](;B[es];W[cs](;B[cr];W[as];B[bs])(;B[ds];W[fs]))
 *   (;B[cr];W[es])(;B[cs];W[es])(;B[ds];W[cr]))
 */
function choChikun408(): ProblemV1 {
  return {
    schemaVersion: 1,
    problemId: 'tsumego-hero-408',
    revision: 1,
    learningVersion: 1,
    semanticHash: emptyHash(),
    boardSize: 19,
    setup: {
      black: [285, 286, 287, 288, 289, 308, 310, 323, 324, 328],
      white: [304, 305, 306, 307, 326, 327, 343],
    },
    toPlay: 'W',
    studentColor: 'W',
    history: { policy: 'fresh-position', moves: [] },
    rules: {
      profile: 'ld-v1', suicide: 'forbidden', repetition: 'situational-superko',
      externalKo: 'none', pass: 'allowed',
    },
    goal: {
      kind: 'live', targetColor: 'W', anchors: [304, 305, 306, 307, 326, 327],
      quantifier: 'any-unconditionally-alive', seki: 'unsupported', ko: 'unsupported',
    },
    viewport: { x0: 0, y0: 15, x1: 6, y1: 18 },
    nodes: [
      node('W', [
        edge(346, 1, 'correct', 'solution'),
        edge(325, 6, 'wrong', 'refutation'),
        edge(344, 8, 'wrong', 'refutation'),
        edge(345, 10, 'wrong', 'refutation'),
      ]),
      node('B', [edge(344, 2, 'correct', 'opponent')], 0),
      node('W', [
        edge(325, 3, 'correct', 'solution'),
        edge(345, 12, 'wrong', 'refutation'),
      ]),
      node('B', [edge(342, 4, 'correct', 'opponent')], 0),
      node('W', [edge(343, 5, 'correct', 'solution')]),
      terminal('B', 'success', 'unconditional-life', 'Решено.'),
      node('B', [edge(346, 7, 'wrong', 'opponent')], 0),
      terminal('W', 'failure', 'target-captured', 'Группа не живёт.'),
      node('B', [edge(346, 9, 'wrong', 'opponent')], 0),
      terminal('W', 'failure', 'target-captured', 'Группа не живёт.'),
      node('B', [edge(325, 11, 'wrong', 'opponent')], 0),
      terminal('W', 'failure', 'target-captured', 'Группа не живёт.'),
      node('B', [edge(347, 13, 'wrong', 'opponent')], 0),
      terminal('W', 'failure', 'target-captured', 'Группа не живёт.'),
    ],
    root: 0,
    verification: {
      level: 'solver-checked', auditId: 'external-source-replay-only',
      adapterVersion: 'rules-v1-dev', scope: 'declared-position-and-rules',
    },
    source: {
      collection: 'Tsumego Hero — Life & Death: Elementary #3',
      sourceUrl: 'https://tsumego.com/1860',
      attribution: 'Encyclopedia of Life and Death by Cho Chikun; solution tree by the Tsumego Hero community',
      licenseId: 'LicenseRef-Source-Rights-Unclear',
    },
    difficulty: { band: '7k', status: 'estimated' },
    tags: ['life-and-death', 'snapback', '7k', 'external-demo'],
  };
}

async function finalizeProblem(problem: ProblemV1): Promise<ProblemV1> {
  problem.semanticHash = await hashProblemSemantics(problem);
  const visited = new Set<number>();

  const visit = async (nodeId: number, state: RulesState): Promise<void> => {
    const hash = await hashRulesState(state);
    if (visited.has(nodeId)) {
      if (problem.nodes[nodeId]!.stateHash !== hash) throw new Error('Fixture merges incompatible histories');
      return;
    }
    visited.add(nodeId);
    const current = problem.nodes[nodeId]!;
    current.stateHash = hash;
    for (const branch of current.edges) {
      const applied = applyMove(state, current.toPlay, branch.move, problem.boardSize);
      if (!applied.ok) throw new Error(`Broken fixture edge at node ${nodeId}: ${applied.reason}`);
      await visit(branch.next, applied.state);
    }
  };

  await visit(problem.root, createRulesState(problem));
  const validation = validateProblem(problem);
  if (!validation.ok) throw new Error(validation.errors.map(error => error.message).join('; '));
  return validation.problem;
}

function node(
  toPlay: 'B' | 'W',
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
  toPlay: 'B' | 'W',
  result: 'success' | 'failure',
  outcome: 'target-captured' | 'unconditional-life',
  explanation: string,
): ProblemV1['nodes'][number] {
  return { ...node(toPlay, []), terminal: { result, outcome, explanation } };
}

function edge(
  move: number,
  next: number,
  verdict: 'correct' | 'wrong',
  role: 'solution' | 'opponent' | 'refutation',
): ProblemV1['nodes'][number]['edges'][number] {
  return { move, next, verdict, role };
}

function emptyHash(): string {
  return `sha256:${'0'.repeat(64)}`;
}
