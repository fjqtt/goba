import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { basename, join, resolve } from 'node:path';
import { hashBytes, type Color } from '@goba/problem-contract';
import type { Position } from '../domain';
import { importSgfCollection } from '../sgf/importer';
import { choViewport, type ChoAuditResult } from '../catalog/cho-client-pack';
import {
  emptyViewportPoints,
  nearPoints,
  rankByPolicy,
  replayPrefix,
  studentPlies,
  type NodeExpansion,
  type ProblemRefutations,
  type RefutationReport,
  type SkippedCandidate,
  type WrongBranch,
} from '../catalog/refutation-expansion';
import { parseGtpResponses } from '../solver/gnugo-adapter';
import {
  gtpVertexToPoint,
  owlArguments,
  pointToGtpVertex,
  pointToSgfCoordinate,
  resolveGnuGoExecutable,
  runGnuGoProcess,
} from '../solver/gnugo-gtp';

const RUN_TIMEOUT_MS = 20_000;
const PER_COMMAND_TIMEOUT_MS = 1_000;
const MAX_RUN_TIMEOUT_MS = 120_000;
/** Bump when screening/refutation semantics change; incompatible prior reports are discarded. */
const PIPELINE_VERSION = 2;

const [collectionFile, auditFile, katagoResultsFile, artifactDirectoryArg] = process.argv.slice(2);
if (!collectionFile || !auditFile || !katagoResultsFile || !artifactDirectoryArg) {
  process.stderr.write(
    'Usage: npm run expand:cho-refutations --workspace @goba/generator -- '
      + '<collection.sgf> <audit-report.json> <katago-results.jsonl> <artifact-dir> '
      + '[maxWrongPerNode=4] [start=1] [count=900] [concurrency=4]\n',
  );
  process.exitCode = 2;
} else {
  await main({
    collectionFile,
    auditFile,
    katagoResultsFile,
    artifactDirectory: artifactDirectoryArg,
    maxWrongPerNode: positiveInt(process.argv[6], 4),
    start: positiveInt(process.argv[7], 1),
    count: positiveInt(process.argv[8], 900),
    concurrency: Math.min(8, positiveInt(process.argv[9], 4)),
  });
}

type AuditReport = { results: ChoAuditResult[] };

async function main(options: {
  collectionFile: string;
  auditFile: string;
  katagoResultsFile: string;
  artifactDirectory: string;
  maxWrongPerNode: number;
  start: number;
  count: number;
  concurrency: number;
}): Promise<void> {
  const started = performance.now();
  const collectionPath = resolve(options.collectionFile);
  const auditPath = resolve(options.auditFile);
  const artifactDirectory = resolve(options.artifactDirectory);
  const reportPath = join(artifactDirectory, 'refutations-report.json');
  await mkdir(artifactDirectory, { recursive: true });

  const auditBytes = await readFile(auditPath);
  const [collection, binary, policies] = await Promise.all([
    importSgfCollection(await readFile(collectionPath, 'utf8'), {
      sourceUri: `file://${collectionPath}`,
      collection: basename(collectionPath),
      attribution: 'Local research import',
      licenseId: 'LicenseRef-Restricted-Research',
      distribution: 'restricted',
    }),
    resolveGnuGoExecutable(process.env.GNUGO_BIN ?? 'gnugo'),
    loadPolicies(resolve(options.katagoResultsFile)),
  ]);
  if (!binary) throw new Error('GNU Go executable was not found; install with `brew install gnu-go`');
  const audit = JSON.parse(auditBytes.toString('utf8')) as AuditReport;
  const auditReportSha256 = await hashBytes(new Uint8Array(auditBytes));

  const rangeEnd = options.start + options.count;
  const eligible = audit.results.filter(result => (
    result.status === 'full-line-match'
    && result.sourceLineReplay.legal
    && result.selectedTarget !== undefined
    && result.sourceLine.length > 0
    && result.problemNumber >= options.start
    && result.problemNumber < rangeEnd
  ));
  const positions = new Map(collection.drafts.map((draft, index) => [index + 1, draft.position]));
  const prior = await readReport(reportPath);
  const priorCompatible = prior !== undefined
    && prior.auditReportSha256 === auditReportSha256
    && prior.configuration.pipelineVersion === PIPELINE_VERSION
    && prior.configuration.maxWrongPerNode === options.maxWrongPerNode;
  if (prior && !priorCompatible) {
    process.stderr.write('Prior report has a different audit hash or configuration; starting fresh.\n');
  }
  // Prior error results (timeouts, crashes) are retried instead of being skipped forever.
  const completed = new Map((priorCompatible ? prior.results : [])
    .filter(result => result.status !== 'error')
    .map(result => [result.problemNumber, result]));
  const pending = eligible.filter(result => !completed.has(result.problemNumber));
  let completedThisRun = 0;

  process.stderr.write(
    `Refutation expansion: ${eligible.length} eligible full-line problems, ${pending.length} pending, `
      + `maxWrongPerNode ${options.maxWrongPerNode}, concurrency ${options.concurrency}\n`,
  );

  let cursor = 0;
  const workers = Array.from({ length: options.concurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const item = pending[index];
      if (!item) return;
      const position = positions.get(item.problemNumber);
      const result = position
        ? await expandProblem(binary, item, position, policies, options.maxWrongPerNode)
        : errorResult(item, 'position-not-found');
      completed.set(item.problemNumber, result);
      completedThisRun += 1;
      if (completedThisRun % 10 === 0 || completedThisRun === pending.length) {
        await writeReport(reportPath, makeReport(auditReportSha256, options, [...completed.values()]));
      }
      if (completedThisRun % 25 === 0 || completedThisRun === pending.length) {
        process.stderr.write(
          `Refutation expansion: ${completedThisRun}/${pending.length} processed this run, problem ${item.problemNumber}\n`,
        );
      }
    }
  });
  await Promise.all(workers);

  const report = makeReport(auditReportSha256, options, [...completed.values()]);
  await writeReport(reportPath, report);
  process.stdout.write(`${JSON.stringify({
    reportPath,
    eligible: eligible.length,
    processedThisRun: completedThisRun,
    summary: report.summary,
    wallMs: performance.now() - started,
  })}\n`);
}

async function expandProblem(
  binary: string,
  audit: ChoAuditResult,
  position: Position,
  policies: Map<string, number[]>,
  maxWrongPerNode: number,
): Promise<ProblemRefutations> {
  const started = performance.now();
  const selected = audit.candidates.find(candidate => candidate.anchor === audit.selectedTarget);
  if (!selected) return errorResult(audit, 'selected-target-not-found');
  const goalKind = selected.goalKind;
  const size = position.boardSize;
  const target = pointToGtpVertex(selected.anchor, size);
  const screenCommand = goalKind === 'live' ? 'owl_does_defend' : 'owl_does_attack';
  const refuteCommand = goalKind === 'live' ? 'owl_attack' : 'owl_defend';
  const verifyCommand = goalKind === 'live' ? 'owl_defend' : 'owl_attack';
  const viewport = choViewport(position, [
    ...audit.expectedRootMoves,
    ...audit.sourceLine.map(([, point]) => point),
  ]);
  const line = audit.sourceLine;
  const targetStones = selected.targetColor === 'B' ? position.setup.black : position.setup.white;
  const plausibilityReferences = [
    ...targetStones,
    ...audit.expectedRootMoves,
    ...line.map(([, point]) => point),
  ];
  const base: Omit<ProblemRefutations, 'status' | 'wallMs'> = {
    problemNumber: audit.problemNumber,
    goalKind,
    targetAnchor: selected.anchor,
    wrongBranches: [],
    nodes: [],
  };

  try {
    let bookMoveRejected = false;
    for (const ply of studentPlies(line, position.toPlay)) {
      const prefix = line.slice(0, ply);
      const bookMove = line[ply]![1];
      const state = replayPrefix(position, prefix);
      if (!state) throw new Error(`Line prefix of ${ply} plies does not replay`);
      const candidates = emptyViewportPoints(state, viewport, size);
      const screen = await runOwl(binary, position, prefix, candidates.map(point => (
        `${screenCommand} ${pointToGtpVertex(point, size)} ${target}`
      )));
      const accepted: number[] = [];
      const rejected: number[] = [];
      let bookMoveCode = 0;
      candidates.forEach((point, index) => {
        const code = responseCode(screen[index]);
        if (point === bookMove) bookMoveCode = code;
        // Any positive code (including ko-conditional 2/3) keeps a move out of the
        // wrong list; only an unconditional 1 qualifies the printable move itself.
        (code > 0 ? accepted : rejected).push(point);
      });
      const bookMoveAccepted = bookMoveCode === 1;
      const node: NodeExpansion = {
        ply,
        candidateCount: candidates.length,
        acceptedMoves: accepted,
        bookMoveAccepted,
        alternativeCorrectCandidates: accepted.filter(point => point !== bookMove),
        skipped: [],
      };
      base.nodes.push(node);
      if (!bookMoveAccepted) {
        bookMoveRejected = true;
        continue;
      }

      const policy = policies.get(policyKey(audit.problemNumber, ply));
      const ranked = rankByPolicy(nearPoints(rejected, plausibilityReferences, 1, size), policy);
      let published = 0;
      for (const [rankIndex, move] of ranked.entries()) {
        if (published >= maxWrongPerNode) break;
        const branch = await refuteCandidate(binary, {
          position, prefix, move, target, refuteCommand, verifyCommand, ply, policy,
          localPolicyRank: rankIndex + 1,
        });
        if ('reason' in branch) {
          node.skipped.push(branch);
        } else {
          base.wrongBranches.push(branch);
          published += 1;
        }
      }
    }
    return {
      ...base,
      status: bookMoveRejected ? 'book-move-rejected' : 'expanded',
      wallMs: performance.now() - started,
    };
  } catch (error) {
    return {
      ...base,
      status: 'error',
      wallMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function refuteCandidate(binary: string, input: {
  position: Position;
  prefix: Array<[Color, number]>;
  move: number;
  target: string;
  refuteCommand: string;
  verifyCommand: string;
  ply: number;
  policy: number[] | undefined;
  localPolicyRank: number;
}): Promise<WrongBranch | SkippedCandidate> {
  const { position, prefix, move, target } = input;
  const student = position.toPlay;
  const opponent: Color = student === 'B' ? 'W' : 'B';
  const wrongPath: Array<[Color, number]> = [...prefix, [student, move]];
  if (!replayPrefix(position, wrongPath)) return { move, reason: 'illegal-refutation' };

  let refute;
  try {
    [refute] = await runOwl(binary, position, wrongPath, [`${input.refuteCommand} ${target}`]);
  } catch {
    return { move, reason: 'refute-error' };
  }
  const refuteParts = refute?.split(/\s+/) ?? [];
  const refuteCode = Number.parseInt(refuteParts[0] ?? '0', 10) || 0;
  const refuteMove = refuteParts[1] ?? '';
  if (refuteCode <= 0) return { move, reason: 'unrefuted-inconsistent' };
  // Owl codes 2/3 succeed only through a ko, which ld-v1 declares unsupported;
  // such moves must not be graded wrong unconditionally.
  if (refuteCode !== 1) return { move, reason: 'ko-conditional' };

  // Only an explicit PASS means "failed as it stands"; an unparseable vertex is an
  // error, never an immediate-failure branch.
  const isPass = refuteMove.toUpperCase() === 'PASS';
  const replyPoint = !isPass && refuteMove ? gtpVertexToPoint(refuteMove, position.boardSize) : -1;
  if (!isPass && replyPoint < 0) return { move, reason: 'refute-error' };
  const verifyPath: Array<[Color, number]> = replyPoint >= 0
    ? [...wrongPath, [opponent, replyPoint]]
    : wrongPath;
  if (replyPoint >= 0 && !replayPrefix(position, verifyPath)) {
    return { move, reason: 'illegal-refutation' };
  }

  let verify;
  try {
    [verify] = await runOwl(binary, position, verifyPath, [`${input.verifyCommand} ${target}`]);
  } catch {
    return { move, reason: 'refute-error' };
  }
  const verifyCode = Number.parseInt(verify?.split(/\s+/)[0] ?? '0', 10) || 0;
  if (verifyCode > 0) return { move, reason: 'recovery-found' };

  return {
    ply: input.ply,
    move,
    ...(replyPoint >= 0 ? { refutation: replyPoint } : {}),
    evidence: {
      refuteCode,
      refuteMove,
      verifyCode,
      ...(input.policy?.[move] === undefined ? {} : { policy: input.policy[move]! }),
      localPolicyRank: input.localPolicyRank,
    },
  };
}

/** Runs one GNU Go GTP session on the position plus forced moves and returns each command's response body. */
async function runOwl(
  binary: string,
  position: Position,
  forced: Array<[Color, number]>,
  commands: string[],
): Promise<Array<string | undefined>> {
  const sgfPath = join(
    process.env.TMPDIR ?? '/tmp',
    `goba-refute-${process.pid}-${Math.random().toString(36).slice(2)}.sgf`,
  );
  await writeFile(sgfPath, positionToSgf(position, forced), 'utf8');
  try {
    const input = `${commands.map((command, index) => `${index + 1} ${command}`).join('\n')}\n${commands.length + 1} quit\n`;
    // A large screening batch needs more wall time than a single owl query.
    const timeout = Math.min(MAX_RUN_TIMEOUT_MS, RUN_TIMEOUT_MS + commands.length * PER_COMMAND_TIMEOUT_MS);
    const run = await runGnuGoProcess(binary, [
      '--quiet', '--mode', 'gtp', '--situational-superko', ...owlArguments(), '-l', sgfPath,
    ], input, timeout);
    const responses = parseGtpResponses(run.stdout);
    return commands.map((_, index) => {
      const response = responses.find(item => item.id === index + 1);
      return response?.success ? response.body : undefined;
    });
  } finally {
    await rm(sgfPath, { force: true });
  }
}

function responseCode(body: string | undefined): number {
  return Number.parseInt(body?.split(/\s+/)[0] ?? '0', 10) || 0;
}

function positionToSgf(position: Position, forced: Array<[Color, number]>): string {
  const size = position.boardSize;
  const encode = (property: string, points: number[]) => points.length === 0
    ? ''
    : `${property}${points.map(point => `[${pointToSgfCoordinate(point, size)}]`).join('')}`;
  const moves = forced.map(([color, point]) => `;${color}[${pointToSgfCoordinate(point, size)}]`).join('');
  return `(;FF[4]GM[1]SZ[${size}]${encode('AB', position.setup.black)}`
    + `${encode('AW', position.setup.white)}PL[${position.toPlay}]${moves})`;
}

function policyKey(problemNumber: number, ply: number): string {
  return `exact-${String(problemNumber).padStart(4, '0')}-ply-${String(ply).padStart(2, '0')}`;
}

async function loadPolicies(path: string): Promise<Map<string, number[]>> {
  const policies = new Map<string, number[]>();
  const lines = createInterface({ input: createReadStream(path, 'utf8'), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    const record = JSON.parse(line) as { id?: string; policy?: number[] };
    if (record.id?.startsWith('exact-') && Array.isArray(record.policy)) {
      policies.set(record.id, record.policy);
    }
  }
  return policies;
}

function errorResult(audit: ChoAuditResult, message: string): ProblemRefutations {
  const selected = audit.candidates.find(candidate => candidate.anchor === audit.selectedTarget);
  return {
    problemNumber: audit.problemNumber,
    status: 'error',
    goalKind: selected?.goalKind ?? 'live',
    targetAnchor: selected?.anchor ?? 0,
    wrongBranches: [],
    nodes: [],
    wallMs: 0,
    error: message,
  };
}

function makeReport(
  auditReportSha256: string,
  options: { maxWrongPerNode: number; start: number; count: number; concurrency: number },
  results: ProblemRefutations[],
): RefutationReport {
  const configuration = { pipelineVersion: PIPELINE_VERSION, ...options };
  const sorted = [...results].sort((left, right) => left.problemNumber - right.problemNumber);
  const summary: Record<string, number> = { total: sorted.length };
  for (const result of sorted) summary[result.status] = (summary[result.status] ?? 0) + 1;
  summary.wrongBranches = sorted.reduce((sum, result) => sum + result.wrongBranches.length, 0);
  summary.withWrongBranches = sorted.filter(result => result.wrongBranches.length > 0).length;
  summary.rootWrongBranches = sorted.reduce(
    (sum, result) => sum + result.wrongBranches.filter(branch => branch.ply === 0).length,
    0,
  );
  summary.alternativeCorrectCandidates = sorted.reduce(
    (sum, result) => sum + result.nodes.reduce((inner, node) => inner + node.alternativeCorrectCandidates.length, 0),
    0,
  );
  summary.skippedCandidates = sorted.reduce(
    (sum, result) => sum + result.nodes.reduce((inner, node) => inner + node.skipped.length, 0),
    0,
  );
  return {
    schemaVersion: 1,
    verification: 'heuristic-candidate-only',
    solver: 'GNU Go 3.8 Owl + KataGo policy ranking',
    auditReportSha256,
    configuration,
    summary,
    results: sorted,
  };
}

async function writeReport(path: string, report: RefutationReport): Promise<void> {
  // Unique temporary name: concurrent workers checkpoint independently, and a shared
  // .tmp path could interleave writes and publish a corrupt report.
  const temporary = `${path}.${process.pid}-${Math.random().toString(36).slice(2)}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function readReport(path: string): Promise<RefutationReport | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as RefutationReport;
  } catch {
    return undefined;
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
