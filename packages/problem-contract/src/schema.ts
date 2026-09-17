import { z } from 'zod';

export const ColorSchema = z.enum(['B', 'W']);
export type Color = z.infer<typeof ColorSchema>;

export const MoveSchema = z.union([z.number().int().nonnegative(), z.literal('pass')]);
export type Move = z.infer<typeof MoveSchema>;

export const EdgeSchema = z.object({
  move: MoveSchema,
  next: z.number().int().nonnegative(),
  verdict: z.enum(['correct', 'wrong', 'unclassified']),
  role: z.enum(['solution', 'opponent', 'refutation']),
  explanationId: z.string().min(1).optional(),
});

export const NodeV1Schema = z.object({
  toPlay: ColorSchema,
  stateHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  edges: z.array(EdgeSchema),
  coverage: z.object({
    kind: z.enum(['listed-only', 'all-legal']),
    defaultVerdict: z.literal('unclassified'),
  }),
  defaultReply: z.number().int().nonnegative().optional(),
  terminal: z.object({
    result: z.enum(['success', 'failure']),
    outcome: z.enum([
      'target-captured',
      'unconditional-life',
      'seki',
      'ko-dependent',
      'unknown',
    ]),
    explanation: z.string().min(1),
  }).optional(),
});
export type NodeV1 = z.infer<typeof NodeV1Schema>;

export const ProblemV1Schema = z.object({
  schemaVersion: z.literal(1),
  problemId: z.string().min(1),
  revision: z.number().int().positive(),
  learningVersion: z.number().int().positive(),
  semanticHash: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  boardSize: z.union([z.literal(9), z.literal(13), z.literal(19)]),
  setup: z.object({
    black: z.array(z.number().int().nonnegative()),
    white: z.array(z.number().int().nonnegative()),
  }),
  toPlay: ColorSchema,
  studentColor: ColorSchema,
  history: z.object({
    policy: z.enum(['fresh-position', 'provided']),
    moves: z.array(z.tuple([ColorSchema, MoveSchema])),
  }),
  rules: z.object({
    profile: z.literal('ld-v1'),
    suicide: z.literal('forbidden'),
    repetition: z.literal('situational-superko'),
    externalKo: z.literal('none'),
    pass: z.literal('allowed'),
  }),
  goal: z.object({
    kind: z.enum(['capture', 'live']),
    targetColor: ColorSchema,
    anchors: z.array(z.number().int().nonnegative()).min(1),
    quantifier: z.enum(['all-captured', 'any-unconditionally-alive']),
    seki: z.literal('unsupported'),
    ko: z.literal('unsupported'),
  }),
  viewport: z.object({
    x0: z.number().int().nonnegative(),
    y0: z.number().int().nonnegative(),
    x1: z.number().int().nonnegative(),
    y1: z.number().int().nonnegative(),
  }),
  nodes: z.array(NodeV1Schema).min(1).max(10_000),
  root: z.number().int().nonnegative(),
  verification: z.object({
    level: z.enum(['solver-checked', 'expert-reviewed']),
    auditId: z.string().min(1),
    adapterVersion: z.string().min(1),
    scope: z.literal('declared-position-and-rules'),
  }),
  source: z.object({
    collection: z.string().min(1),
    attribution: z.string(),
    licenseId: z.string().min(1),
    sourceUrl: z.string().url().optional(),
  }),
  difficulty: z.object({
    band: z.string().min(1),
    status: z.enum(['estimated', 'calibrated']),
  }),
  tags: z.array(z.string()),
});

export type ProblemV1 = z.infer<typeof ProblemV1Schema>;

export type ProblemValidationError = {
  code: string;
  message: string;
  path?: string;
};

export const PROBLEM_LIMITS = {
  maxExpandedBytes: 2 * 1024 * 1024,
  maxNodes: 10_000,
  maxEdges: 40_000,
  maxPlies: 200,
} as const;

export function validateProblem(input: unknown):
  | { ok: true; problem: ProblemV1 }
  | { ok: false; errors: ProblemValidationError[] } {
  const parsed = ProblemV1Schema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      errors: parsed.error.issues.map(issue => ({
        code: 'schema',
        message: issue.message,
        path: issue.path.join('.'),
      })),
    };
  }

  const problem = parsed.data;
  const errors = validateGraph(problem);
  const expandedBytes = new TextEncoder().encode(JSON.stringify(problem)).byteLength;
  if (expandedBytes > PROBLEM_LIMITS.maxExpandedBytes) {
    errors.push({
      code: 'expanded-size-limit',
      message: `Problem exceeds ${PROBLEM_LIMITS.maxExpandedBytes} expanded bytes`,
    });
  }
  return errors.length > 0 ? { ok: false, errors } : { ok: true, problem };
}

export function validateGraph(problem: ProblemV1): ProblemValidationError[] {
  const errors: ProblemValidationError[] = [];
  const pointLimit = problem.boardSize ** 2;
  const allSetup = [...problem.setup.black, ...problem.setup.white];
  const setupSet = new Set(allSetup);

  if (problem.root >= problem.nodes.length) {
    errors.push({ code: 'root-range', message: 'Root node does not exist', path: 'root' });
  }
  if (setupSet.size !== allSetup.length) {
    errors.push({ code: 'setup-overlap', message: 'Setup points must be unique', path: 'setup' });
  }
  for (const [path, points] of [
    ['setup', allSetup],
    ['goal.anchors', problem.goal.anchors],
  ] as const) {
    if (points.some(point => point >= pointLimit)) {
      errors.push({ code: 'point-range', message: 'Point is outside the board', path });
    }
  }
  if (problem.goal.anchors.some(point =>
    !(problem.goal.targetColor === 'B' ? problem.setup.black : problem.setup.white).includes(point),
  )) {
    errors.push({ code: 'anchor-missing', message: 'Every anchor must identify a target setup stone', path: 'goal.anchors' });
  }
  const expectedQuantifier = problem.goal.kind === 'capture'
    ? 'all-captured'
    : 'any-unconditionally-alive';
  if (problem.goal.quantifier !== expectedQuantifier) {
    errors.push({ code: 'goal-quantifier', message: `Goal ${problem.goal.kind} requires ${expectedQuantifier}`, path: 'goal.quantifier' });
  }
  const { x0, y0, x1, y1 } = problem.viewport;
  if (x0 > x1 || y0 > y1 || x1 >= problem.boardSize || y1 >= problem.boardSize) {
    errors.push({ code: 'viewport-range', message: 'Viewport is outside the board or inverted', path: 'viewport' });
  }
  if (problem.history.policy === 'fresh-position' && problem.history.moves.length > 0) {
    errors.push({ code: 'fresh-history', message: 'Fresh position cannot contain history moves', path: 'history.moves' });
  }

  let edgeCount = 0;
  problem.nodes.forEach((node, nodeIndex) => {
    edgeCount += node.edges.length;
    const moves = new Set<string>();
    node.edges.forEach((edge, edgeIndex) => {
      const key = String(edge.move);
      if (moves.has(key)) {
        errors.push({ code: 'duplicate-edge', message: 'A node cannot contain duplicate moves', path: `nodes.${nodeIndex}.edges.${edgeIndex}` });
      }
      moves.add(key);
      if (typeof edge.move === 'number' && edge.move >= pointLimit) {
        errors.push({ code: 'point-range', message: 'Edge move is outside the board', path: `nodes.${nodeIndex}.edges.${edgeIndex}.move` });
      }
      if (edge.next >= problem.nodes.length) {
        errors.push({ code: 'edge-range', message: 'Edge target does not exist', path: `nodes.${nodeIndex}.edges.${edgeIndex}.next` });
      }
    });
    if (node.defaultReply !== undefined) {
      if (node.toPlay === problem.studentColor || node.defaultReply >= node.edges.length) {
        errors.push({ code: 'default-reply', message: 'Default reply is only a valid edge index on the opponent turn', path: `nodes.${nodeIndex}.defaultReply` });
      }
    }
    if (!node.terminal && node.edges.length === 0) {
      errors.push({ code: 'missing-terminal', message: 'A leaf must contain terminal result', path: `nodes.${nodeIndex}` });
    }
    if (node.terminal && ['seki', 'ko-dependent', 'unknown'].includes(node.terminal.outcome)) {
      errors.push({ code: 'unsupported-terminal', message: 'ld-v1 cannot grade seki, ko-dependent, or unknown outcomes', path: `nodes.${nodeIndex}.terminal.outcome` });
    }
  });
  if (edgeCount > PROBLEM_LIMITS.maxEdges) {
    errors.push({ code: 'edge-limit', message: `Problem has more than ${PROBLEM_LIMITS.maxEdges} edges`, path: 'nodes' });
  }
  errors.push(...validateAcyclicAndDepth(problem));
  return errors;
}

function validateAcyclicAndDepth(problem: ProblemV1): ProblemValidationError[] {
  if (problem.root >= problem.nodes.length) return [];
  const visiting = new Set<number>();
  const visitedDepth = new Map<number, number>();
  const errors: ProblemValidationError[] = [];

  const visit = (nodeId: number, depth: number): void => {
    if (depth > PROBLEM_LIMITS.maxPlies) {
      errors.push({ code: 'ply-limit', message: `Path exceeds ${PROBLEM_LIMITS.maxPlies} plies`, path: `nodes.${nodeId}` });
      return;
    }
    if (visiting.has(nodeId)) {
      errors.push({ code: 'cycle', message: 'Problem graph must be acyclic in v1', path: `nodes.${nodeId}` });
      return;
    }
    if ((visitedDepth.get(nodeId) ?? -1) >= depth) return;
    visitedDepth.set(nodeId, depth);
    visiting.add(nodeId);
    for (const edge of problem.nodes[nodeId]!.edges) {
      if (edge.next < problem.nodes.length) visit(edge.next, depth + 1);
    }
    visiting.delete(nodeId);
  };
  visit(problem.root, 0);
  return errors;
}
