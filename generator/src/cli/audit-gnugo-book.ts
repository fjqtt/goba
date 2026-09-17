import { spawn } from 'node:child_process';
import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, delimiter, isAbsolute, join, resolve } from 'node:path';
import { pointToVertex, vertexToPoint, type Color } from '@goba/problem-contract';
import type { DraftRecord, TargetCandidate } from '../domain';
import { importSgfCollection } from '../sgf/importer';
import { parseGtpResponses } from '../solver/gnugo-adapter';
import { auditGnuGoTree, auditMoveLine, type TreeAudit } from '../solver/gnugo-tree-audit';

const [collectionFile, linkManifestFile, artifactDirectoryArg] = process.argv.slice(2);
if (!collectionFile || !linkManifestFile || !artifactDirectoryArg) {
  process.stderr.write(
    'Usage: npm run audit:gnugo-book --workspace @goba/generator -- '
      + '<collection.sgf> <link-manifest.json> <artifact-dir> [start=1] [count=900] [concurrency=4]\n',
  );
  process.exitCode = 2;
} else {
  await main({
    collectionFile,
    linkManifestFile,
    artifactDirectory: artifactDirectoryArg,
    start: positiveInt(process.argv[5], 1),
    count: positiveInt(process.argv[6], 900),
    concurrency: Math.min(8, positiveInt(process.argv[7], 4)),
  });
}

type LinkRecord = {
  problemNumber: number;
  linkedDraftId?: string;
  rootMoves: Array<[number, number]>;
  line: Array<[Color, [number, number]]>;
};

type LinkManifest = {
  collection: { sha256: string };
  answerKey: { sha256: string };
  links: LinkRecord[];
};

type TargetAudit = {
  goalKind: 'live' | 'capture';
  targetColor: Color;
  anchor: number;
  rank: number;
  primaryCode: number;
  primaryMove?: string;
  acceptedExpectedRoots: number[];
  treePath?: string;
  tree?: TreeAudit;
  treeError?: string;
};

type ProblemAudit = {
  problemNumber: number;
  draftId: string;
  status: 'full-line-match' | 'all-root-moves-covered' | 'partial-line-match' | 'root-only-match'
    | 'no-matching-target' | 'source-line-illegal' | 'error';
  expectedRootMoves: number[];
  sourceLine: Array<[Color, number]>;
  sourceLineReplay: ReturnType<typeof auditMoveLine>;
  selectedTarget?: number;
  candidates: TargetAudit[];
  wallMs: number;
  error?: string;
};

type AuditReport = {
  schemaVersion: 1;
  verification: 'heuristic-candidate-only';
  collectionSha256: string;
  answerKeySha256: string;
  configuration: { solver: string; start: number; count: number; concurrency: number };
  summary: Record<string, number>;
  results: ProblemAudit[];
};

async function main(options: {
  collectionFile: string;
  linkManifestFile: string;
  artifactDirectory: string;
  start: number;
  count: number;
  concurrency: number;
}): Promise<void> {
  const started = performance.now();
  const collectionPath = resolve(options.collectionFile);
  const manifestPath = resolve(options.linkManifestFile);
  const artifactDirectory = resolve(options.artifactDirectory);
  const treeDirectory = join(artifactDirectory, 'trees');
  const reportPath = join(artifactDirectory, 'audit-report.json');
  await mkdir(treeDirectory, { recursive: true });

  const [collection, manifest, binary] = await Promise.all([
    importSgfCollection(await readFile(collectionPath, 'utf8'), {
      sourceUri: `file://${collectionPath}`,
      collection: basename(collectionPath),
      attribution: 'Local research import',
      licenseId: 'LicenseRef-Restricted-Research',
      distribution: 'restricted',
    }),
    readFile(manifestPath, 'utf8').then(value => JSON.parse(value) as LinkManifest),
    resolveExecutable(process.env.GNUGO_BIN ?? 'gnugo'),
  ]);
  if (!binary) throw new Error('GNU Go executable was not found; install with `brew install gnu-go`');
  if (collection.assetSha256 !== manifest.collection.sha256) {
    throw new Error('Collection hash does not match the link manifest');
  }

  const rangeEnd = options.start + options.count;
  const selectedLinks = manifest.links.filter(link => (
    link.linkedDraftId
    && link.problemNumber >= options.start
    && link.problemNumber < rangeEnd
  ));
  const drafts = new Map(collection.drafts.map(draft => [draft.draftId, draft]));
  const prior = await readReport(reportPath);
  const completed = new Map((prior?.results ?? []).map(result => [result.problemNumber, result]));
  const pending = selectedLinks.filter(link => !completed.has(link.problemNumber));
  let completedThisRun = 0;

  process.stderr.write(
    `GNU Go book audit: ${selectedLinks.length} linked problems, ${pending.length} pending, concurrency ${options.concurrency}\n`,
  );

  let cursor = 0;
  const workers = Array.from({ length: options.concurrency }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      const link = pending[index];
      if (!link) return;
      const draft = drafts.get(link.linkedDraftId!);
      const result = draft
        ? await auditProblem(binary, draft, link, treeDirectory)
        : missingDraft(link);
      completed.set(link.problemNumber, result);
      completedThisRun += 1;
      if (completedThisRun % 10 === 0 || completedThisRun === pending.length) {
        const report = makeReport(manifest, options, [...completed.values()]);
        await writeReport(reportPath, report);
      }
      if (completedThisRun % 25 === 0 || completedThisRun === pending.length) {
        process.stderr.write(
          `GNU Go book audit: ${completedThisRun}/${pending.length} processed this run, problem ${link.problemNumber}\n`,
        );
      }
    }
  });
  await Promise.all(workers);

  const report = makeReport(manifest, options, [...completed.values()]);
  await writeReport(reportPath, report);
  const csvPath = join(artifactDirectory, 'audit-summary.csv');
  await writeCsv(csvPath, report.results);
  process.stdout.write(`${JSON.stringify({
    reportPath,
    csvPath,
    selected: selectedLinks.length,
    processedThisRun: completedThisRun,
    summary: report.summary,
    wallMs: performance.now() - started,
  })}\n`);
}

async function auditProblem(
  binary: string,
  draft: DraftRecord,
  link: LinkRecord,
  treeDirectory: string,
): Promise<ProblemAudit> {
  const started = performance.now();
  const expectedRootMoves = link.rootMoves.map(vertex => vertexToPoint(vertex, draft.position.boardSize));
  const sourceLine = link.line.map(([color, vertex]) => (
    [color, vertexToPoint(vertex, draft.position.boardSize)] as [Color, number]
  ));
  const sourceLineReplay = auditMoveLine(draft.position, sourceLine);
  if (!sourceLineReplay.legal) {
    return {
      problemNumber: link.problemNumber,
      draftId: draft.draftId,
      status: 'source-line-illegal',
      expectedRootMoves,
      sourceLine,
      sourceLineReplay,
      candidates: [],
      wallMs: performance.now() - started,
    };
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), 'goba-gnugo-book-'));
  const inputPath = join(temporaryDirectory, 'input.sgf');
  try {
    await writeFile(inputPath, positionToSgf(draft), 'utf8');
    const plans: Array<{
      candidate: TargetCandidate;
      goalKind: 'live' | 'capture';
      primaryId: number;
      checks: Array<{ id: number; move: number }>;
    }> = [];
    const commands: string[] = [];
    let commandId = 1;
    for (const candidate of draft.targetCandidates) {
      const goalKind = candidate.color === draft.position.toPlay ? 'live' : 'capture';
      const command = goalKind === 'live' ? 'owl_defend' : 'owl_attack';
      const doesCommand = goalKind === 'live' ? 'owl_does_defend' : 'owl_does_attack';
      const target = pointToGtp(candidate.anchors[0]!, draft.position.boardSize);
      const primaryId = commandId;
      commands.push(`${commandId} ${command} ${target}`);
      commandId += 1;
      const checks = expectedRootMoves.map(move => {
        const id = commandId;
        commands.push(`${id} ${doesCommand} ${pointToGtp(move, draft.position.boardSize)} ${target}`);
        commandId += 1;
        return { id, move };
      });
      plans.push({ candidate, goalKind, primaryId, checks });
    }
    commands.push(`${commandId} quit`);
    const rootRun = await runProcess(binary, gtpArguments(inputPath), `${commands.join('\n')}\n`, 20_000);
    const responses = parseGtpResponses(rootRun.stdout);
    const candidates: TargetAudit[] = plans.map(plan => {
      const primary = responses.find(response => response.id === plan.primaryId);
      const [rawCode = '0', primaryMove] = primary?.body.split(/\s+/) ?? [];
      return {
        goalKind: plan.goalKind,
        targetColor: plan.candidate.color,
        anchor: plan.candidate.anchors[0]!,
        rank: plan.candidate.rank,
        primaryCode: Number.parseInt(rawCode, 10) || 0,
        ...(primaryMove ? { primaryMove } : {}),
        acceptedExpectedRoots: plan.checks.filter(check => {
          const response = responses.find(item => item.id === check.id);
          return response?.success && (Number.parseInt(response.body.split(/\s+/)[0] ?? '0', 10) || 0) > 0;
        }).map(check => check.move),
      };
    });

    const qualifying = candidates.filter(candidate => candidate.acceptedExpectedRoots.length > 0);
    for (const target of qualifying) {
      const treeTempPath = join(temporaryDirectory, `tree-${target.anchor}.sgf`);
      const targetVertex = pointToGtp(target.anchor, draft.position.boardSize);
      try {
        await runProcess(binary, [
          '--quiet', '--situational-superko', ...owlArguments(), '-l', inputPath,
          '--decide-owl', targetVertex, '-o', treeTempPath,
        ], undefined, 20_000);
        const rawTree = await readFile(treeTempPath, 'utf8');
        target.tree = auditGnuGoTree(rawTree, draft.position, expectedRootMoves, sourceLine);
        const artifactName = `problem-${String(link.problemNumber).padStart(4, '0')}`
          + `-target-${target.targetColor.toLowerCase()}-${target.anchor}.sgf`;
        target.treePath = join(treeDirectory, artifactName);
        await writeFile(target.treePath, rawTree, 'utf8');
      } catch (error) {
        target.treeError = error instanceof Error ? error.message : String(error);
      }
    }

    const selected = [...qualifying].sort((left, right) => score(right, expectedRootMoves, sourceLine)
      - score(left, expectedRootMoves, sourceLine))[0];
    return {
      problemNumber: link.problemNumber,
      draftId: draft.draftId,
      status: classify(selected, sourceLine),
      expectedRootMoves,
      sourceLine,
      sourceLineReplay,
      ...(selected ? { selectedTarget: selected.anchor } : {}),
      candidates,
      wallMs: performance.now() - started,
    };
  } catch (error) {
    return {
      problemNumber: link.problemNumber,
      draftId: draft.draftId,
      status: 'error',
      expectedRootMoves,
      sourceLine,
      sourceLineReplay,
      candidates: [],
      wallMs: performance.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    await rm(temporaryDirectory, { recursive: true, force: true });
  }
}

function classify(selected: TargetAudit | undefined, sourceLine: Array<[Color, number]>): ProblemAudit['status'] {
  if (!selected) return 'no-matching-target';
  if (selected.tree?.illegalEdges.length) return selected.tree.matchedSourcePlies > 0
    ? 'partial-line-match'
    : 'root-only-match';
  if (sourceLine.length > 0 && selected.tree?.fullSourceLineMatch) return 'full-line-match';
  if (sourceLine.length === 0 && selected.tree?.missingExpectedRootMoves.length === 0) {
    return 'all-root-moves-covered';
  }
  if ((selected.tree?.matchedSourcePlies ?? 0) > 1) return 'partial-line-match';
  return 'root-only-match';
}

function score(candidate: TargetAudit, expectedRootMoves: number[], sourceLine: Array<[Color, number]>): number {
  const tree = candidate.tree;
  return (tree?.fullSourceLineMatch ? 100_000 : 0)
    + (sourceLine.length === 0 && tree?.missingExpectedRootMoves.length === 0 ? 100_000 : 0)
    + (tree?.matchedSourcePlies ?? 0) * 1_000
    + candidate.acceptedExpectedRoots.length * 100
    + (candidate.primaryMove && expectedRootMoves.includes(gtpToPoint(candidate.primaryMove, 19)) ? 50 : 0)
    - candidate.rank / 10_000;
}

function missingDraft(link: LinkRecord): ProblemAudit {
  return {
    problemNumber: link.problemNumber,
    draftId: link.linkedDraftId ?? '',
    status: 'error',
    expectedRootMoves: [],
    sourceLine: [],
    sourceLineReplay: { legal: false, legalPlies: 0, error: { ply: 0, reason: 'draft-not-found' } },
    candidates: [],
    wallMs: 0,
    error: 'Linked draft does not exist',
  };
}

function makeReport(
  manifest: LinkManifest,
  options: { start: number; count: number; concurrency: number },
  results: ProblemAudit[],
): AuditReport {
  const sorted = [...results].sort((left, right) => left.problemNumber - right.problemNumber);
  const summary: Record<string, number> = { total: sorted.length };
  for (const result of sorted) summary[result.status] = (summary[result.status] ?? 0) + 1;
  summary.withIllegalTreeEdges = sorted.filter(result => result.candidates.some(candidate => (
    (candidate.tree?.illegalEdges.length ?? 0) > 0
  ))).length;
  summary.withAdditionalRootMoves = sorted.filter(result => result.candidates.some(candidate => (
    (candidate.tree?.extraRootMoves.length ?? 0) > 0
  ))).length;
  return {
    schemaVersion: 1,
    verification: 'heuristic-candidate-only',
    collectionSha256: manifest.collection.sha256,
    answerKeySha256: manifest.answerKey.sha256,
    configuration: { solver: 'GNU Go 3.8 Owl', ...options },
    summary,
    results: sorted,
  };
}

async function writeReport(path: string, report: AuditReport): Promise<void> {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await rename(temporary, path);
}

async function readReport(path: string): Promise<AuditReport | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as AuditReport;
  } catch {
    return undefined;
  }
}

async function writeCsv(path: string, results: ProblemAudit[]): Promise<void> {
  const header = [
    'problemNumber', 'draftId', 'status', 'sourceLinePlies', 'matchedSourcePlies',
    'expectedRootCount', 'treeRootCount', 'missingRootCount', 'extraRootCount',
    'selectedTarget', 'selectedGoal', 'selectedIllegalEdges', 'candidateTrees', 'treePath',
  ];
  const rows = results.map(result => {
    const selected = result.candidates.find(candidate => candidate.anchor === result.selectedTarget);
    return [
      result.problemNumber,
      result.draftId,
      result.status,
      result.sourceLine.length,
      selected?.tree?.matchedSourcePlies ?? 0,
      result.expectedRootMoves.length,
      selected?.tree?.rootMoves.length ?? 0,
      selected?.tree?.missingExpectedRootMoves.length ?? result.expectedRootMoves.length,
      selected?.tree?.extraRootMoves.length ?? 0,
      result.selectedTarget ?? '',
      selected?.goalKind ?? '',
      selected?.tree?.illegalEdges.length ?? 0,
      result.candidates.filter(candidate => candidate.tree).length,
      selected?.treePath ?? '',
    ].map(csvCell).join(',');
  });
  await writeFile(path, `${[header.join(','), ...rows].join('\n')}\n`, 'utf8');
}

function csvCell(value: string | number): string {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function positionToSgf(draft: DraftRecord): string {
  const size = draft.position.boardSize;
  const encode = (property: string, points: number[]) => points.length === 0
    ? ''
    : `${property}${points.map(point => `[${pointToSgf(point, size)}]`).join('')}`;
  return `(;FF[4]GM[1]SZ[${size}]${encode('AB', draft.position.setup.black)}`
    + `${encode('AW', draft.position.setup.white)}PL[${draft.position.toPlay}])`;
}

function gtpArguments(inputPath: string): string[] {
  return ['--quiet', '--mode', 'gtp', '--situational-superko', ...owlArguments(), '-l', inputPath];
}

function owlArguments(): string[] {
  return ['--level', '10', '--owl-node-limit', '100000', '--owl-branch', '20', '--owl-reading', '40', '-M', '128'];
}

async function resolveExecutable(command: string): Promise<string | undefined> {
  const candidates = isAbsolute(command)
    ? [command]
    : (process.env.PATH ?? '').split(delimiter).filter(Boolean).map(directory => join(directory, command));
  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return await realpath(candidate);
    } catch {
      // Continue searching PATH.
    }
  }
  return undefined;
}

function runProcess(executable: string, args: string[], input: string | undefined, timeoutMs: number): Promise<{ stdout: string }> {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let settled = false;
    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill('SIGKILL');
      reject(new Error(message));
    };
    const timer = setTimeout(() => fail(`GNU Go exceeded ${timeoutMs} ms`), timeoutMs);
    child.stdout.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > 8 * 1024 * 1024) fail('GNU Go output exceeded 8 MiB');
      else stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', chunk => {
      outputBytes += chunk.length;
      if (outputBytes > 8 * 1024 * 1024) fail('GNU Go output exceeded 8 MiB');
      else stderr.push(Buffer.from(chunk));
    });
    child.on('error', error => fail(error.message));
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code !== 0) reject(new Error(Buffer.concat(stderr).toString('utf8') || `GNU Go exited ${code}`));
      else resolvePromise({ stdout: Buffer.concat(stdout).toString('utf8') });
    });
    child.stdin.end(input);
  });
}

function pointToSgf(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${'abcdefghijklmnopqrstuvwxyz'[x]}${'abcdefghijklmnopqrstuvwxyz'[y]}`;
}

function pointToGtp(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${'ABCDEFGHJKLMNOPQRSTUVWXYZ'[x]}${size - y}`;
}

function gtpToPoint(value: string, size: number): number {
  if (value.toUpperCase() === 'PASS') return -1;
  const column = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'.indexOf(value[0]!.toUpperCase());
  const row = Number.parseInt(value.slice(1), 10);
  if (column < 0 || !Number.isInteger(row) || row < 1 || row > size) return -1;
  return (size - row) * size + column;
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
