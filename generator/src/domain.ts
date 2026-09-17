import { z } from 'zod';
import type { Color, ProblemV1 } from '@goba/problem-contract';

export const MAX_SGF_BYTES = 5 * 1024 * 1024;

export const ImportSourceSchema = z.object({
  sourceUri: z.string().min(1),
  collection: z.string().min(1),
  attribution: z.string().default(''),
  licenseId: z.string().min(1),
  distribution: z.enum(['allowed', 'restricted', 'unknown']),
});
export type ImportSource = z.infer<typeof ImportSourceSchema>;

export const SgfImportRequestSchema = z.object({
  content: z.string().min(1).refine(
    value => Buffer.byteLength(value, 'utf8') <= MAX_SGF_BYTES,
    `SGF must not exceed ${MAX_SGF_BYTES} bytes`,
  ),
  source: ImportSourceSchema,
});

export type Position = {
  boardSize: 9 | 13 | 19;
  setup: { black: number[]; white: number[] };
  history: { policy: 'fresh-position'; moves: [] };
  toPlay: Color;
};

export type TargetCandidate = {
  color: Color;
  anchors: number[];
  liberties: number;
  stoneCount: number;
  touchesBoardEdge: boolean;
  rank: number;
};

export type CanonicalTask = {
  taskVersion: 1;
  draftId: string;
  draftRevision: number;
  position: Position;
  goal: ProblemV1['goal'];
  studentColor: Color;
  rules: ProblemV1['rules'];
  boundary: {
    kind: 'full-board' | 'declared-local-assumptions';
    assumptions: string[];
  };
  viewport: ProblemV1['viewport'];
  transformations: [];
  source: {
    assetSha256: string;
    sourceUri: string;
    pageOrNodePath: string;
    author?: string;
    transcriber?: string;
    licenseId: string;
    distribution: 'allowed' | 'restricted' | 'unknown';
  };
  confirmed: { boardBy: string; goalBy: string; at: string };
  semanticHash: string;
};

export type DraftStatus = 'needs-annotation' | 'validated' | 'queued' | 'solving' | 'quality-review';

export type DraftRecord = {
  draftId: string;
  revision: number;
  status: DraftStatus;
  assetSha256: string;
  source: ImportSource & { pageOrNodePath: string };
  sourceLabel: string;
  position: Position;
  viewport: ProblemV1['viewport'];
  targetCandidates: TargetCandidate[];
  hasSourceTree: boolean;
  canonicalTask?: CanonicalTask;
  createdAt: string;
  updatedAt: string;
};

export const DraftAnnotationSchema = z.object({
  goalKind: z.enum(['capture', 'live']),
  targetColor: z.enum(['B', 'W']),
  anchor: z.number().int().nonnegative(),
  studentColor: z.enum(['B', 'W']).optional(),
  boundary: z.object({
    kind: z.enum(['full-board', 'declared-local-assumptions']),
    assumptions: z.array(z.string()),
  }).default({ kind: 'full-board', assumptions: [] }),
  confirmedBy: z.string().min(1),
});
export type DraftAnnotation = z.infer<typeof DraftAnnotationSchema>;

export const SolveJobRequestSchema = z.object({
  draftId: z.string().min(1),
  draftRevision: z.number().int().positive(),
  adapter: z.enum(['tsumego-js', 'gnugo-owl']),
  limits: z.object({
    wallMs: z.number().int().min(100).max(60_000).default(5_000),
    maxNodes: z.number().int().positive().max(100_000).default(10_000),
    memoryMiB: z.number().int().min(32).max(2_048).default(256),
  }).default({ wallMs: 5_000, maxNodes: 10_000, memoryMiB: 256 }),
  seed: z.number().int().nonnegative().default(0),
  wrongMoveDepth: z.number().int().min(0).max(5).default(1),
});
export type SolveJobRequestInput = z.infer<typeof SolveJobRequestSchema>;

export type SolveRequest = {
  jobId: string;
  task: CanonicalTask;
  forcedPath: Array<[Color, number | 'pass']>;
  limits: { wallMs: number; maxNodes: number; memoryMiB: number };
  seed: number;
  configurationId: string;
  wrongMoveDepth: number;
};

export type SolveResult = {
  jobId: string;
  status: 'proven-win' | 'proven-loss' | 'unknown' | 'unsupported' | 'error';
  perspective: 'student-goal';
  outcome: 'target-captured' | 'unconditional-life' | 'seki' | 'ko-dependent' | 'unknown';
  inputHash: string;
  effectivePositionHash: string;
  rulesProfile: string;
  solver: {
    name: string;
    sourceSha: string;
    binarySha256: string;
    configSha256: string;
    adapterVersion: string;
  };
  artifacts: { rawResult: string; rawTree?: string; logs: string };
  coverage: 'root-proof' | 'partial-expanded' | 'enumerated';
  statistics: { wallMs: number; nodes?: number; maxRssMiB?: number };
  reason?: 'timeout' | 'memory' | 'scope' | 'crash' | 'rule-mismatch' | 'incomplete-tree';
};

export type SolveJobRecord = {
  jobId: string;
  draftId: string;
  draftRevision: number;
  idempotencyKey: string;
  status: 'queued' | 'solving' | 'complete' | 'failed';
  request: SolveRequest;
  result?: SolveResult;
  createdAt: string;
  updatedAt: string;
};
