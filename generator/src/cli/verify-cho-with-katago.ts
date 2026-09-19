import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Color, ProblemV1 } from '@goba/problem-contract';
import { pointToGtp } from '../solver/katago-crosscheck';
import type { RefutationReport } from '../catalog/refutation-expansion';

/**
 * KataGo verification of the published Cho pack.
 *
 * prepare: enumerates verification states from the pack shards and the refutations
 * report, and writes KataGo analysis queries plus per-query metadata.
 * report: joins KataGo results with the metadata and produces verdicts.
 *
 * All winrate/ownership readings are normalized to the STUDENT: winrate is the
 * student's chance, target ownership is positive when the target color holds it.
 * The analysis run must pin KATAGO_EXTRA_OVERRIDES=reportAnalysisWinratesAs=BLACK
 * so KataGo reports winrate and ownership from Black's perspective.
 */

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'prepare' && rest.length >= 3) {
  await prepare(rest[0]!, rest[1]!, rest[2]!, positiveInt(rest[3], 32));
} else if (mode === 'report' && rest.length >= 1) {
  await report(rest[0]!);
} else {
  process.stderr.write(
    'Usage: npm run verify:cho-katago --workspace @goba/generator -- '
      + 'prepare <pack-dir> <refutations-report.json> <out-dir> [maxVisits=32]\n'
      + '   or: ... report <out-dir>\n',
  );
  process.exitCode = 2;
}

type QueryKind = 'root' | 'book' | 'wrong' | 'alternative';

type QueryMetadata = {
  id: string;
  kind: QueryKind;
  problemId: string;
  problemNumber: number;
  goalKind: 'live' | 'capture';
  targetColor: Color;
  studentColor: Color;
  nodeId: number;
  /** The classified move this query is about (absent for root queries). */
  move?: number;
  targetStones: number[];
};

type VerificationMetadata = {
  schemaVersion: 1;
  maxVisits: number;
  packDir: string;
  queries: QueryMetadata[];
};

async function prepare(
  packDirName: string,
  refutationsName: string,
  outDirName: string,
  maxVisits: number,
): Promise<void> {
  const packDir = resolve(packDirName);
  const outDir = resolve(outDirName);
  await mkdir(outDir, { recursive: true });
  const problems = await loadPack(packDir);
  const refutations = JSON.parse(await readFile(resolve(refutationsName), 'utf8')) as RefutationReport;
  const alternativesByProblem = new Map(refutations.results.map(result => [
    result.problemNumber,
    result.nodes.flatMap(node => node.alternativeCorrectCandidates.map(move => ({ ply: node.ply, move }))),
  ]));

  const queries: string[] = [];
  const metadata: QueryMetadata[] = [];
  const add = (meta: QueryMetadata, problem: ProblemV1, moves: Array<[Color, number]>) => {
    metadata.push(meta);
    queries.push(JSON.stringify({
      id: meta.id,
      initialStones: [
        ...problem.setup.black.map(point => ['B', pointToGtp(point, problem.boardSize)]),
        ...problem.setup.white.map(point => ['W', pointToGtp(point, problem.boardSize)]),
      ],
      initialPlayer: problem.toPlay,
      moves: moves.map(([color, point]) => [color, pointToGtp(point, problem.boardSize)]),
      rules: 'aga',
      komi: 0,
      boardXSize: problem.boardSize,
      boardYSize: problem.boardSize,
      analyzeTurns: [moves.length],
      maxVisits,
      analysisPVLen: 8,
      includePolicy: false,
      includeOwnership: true,
      rootPolicyTemperature: 1.0,
      rootFpuReductionMax: 0,
    }));
  };

  for (const problem of problems) {
    const problemNumber = Number.parseInt(problem.problemId.slice(-4), 10);
    const targetStones = targetChain(problem);
    const base = {
      problemId: problem.problemId,
      problemNumber,
      goalKind: problem.goal.kind,
      targetColor: problem.goal.targetColor,
      studentColor: problem.studentColor,
      targetStones,
    };
    add({ ...base, id: `root-${problem.problemId}`, kind: 'root', nodeId: problem.root }, problem, []);

    const paths = nodePaths(problem);
    problem.nodes.forEach((node, nodeId) => {
      if (node.toPlay !== problem.studentColor) return;
      const path = paths.get(nodeId);
      if (!path) return;
      for (const edge of node.edges) {
        if (typeof edge.move !== 'number') continue;
        const moves: Array<[Color, number]> = [...path, [node.toPlay, edge.move]];
        if (edge.verdict === 'correct' && edge.role === 'solution') {
          add({ ...base, id: `book-${problem.problemId}-n${nodeId}-m${edge.move}`, kind: 'book', nodeId, move: edge.move }, problem, moves);
        } else if (edge.verdict === 'wrong') {
          add({ ...base, id: `wrong-${problem.problemId}-n${nodeId}-m${edge.move}`, kind: 'wrong', nodeId, move: edge.move }, problem, moves);
        }
      }
    });

    for (const alternative of alternativesByProblem.get(problemNumber) ?? []) {
      const path = paths.get(alternative.ply);
      const node = problem.nodes[alternative.ply];
      if (!path || !node || node.toPlay !== problem.studentColor) continue;
      if (node.edges.some(edge => edge.move === alternative.move)) continue;
      add(
        { ...base, id: `alt-${problem.problemId}-n${alternative.ply}-m${alternative.move}`, kind: 'alternative', nodeId: alternative.ply, move: alternative.move },
        problem,
        [...path, [node.toPlay, alternative.move]],
      );
    }
  }

  const meta: VerificationMetadata = { schemaVersion: 1, maxVisits, packDir, queries: metadata };
  await Promise.all([
    writeFile(join(outDir, 'queries.jsonl'), `${queries.join('\n')}\n`, 'utf8'),
    writeFile(join(outDir, 'metadata.json'), `${JSON.stringify(meta)}\n`, 'utf8'),
  ]);
  const counts: Record<string, number> = {};
  for (const item of metadata) counts[item.kind] = (counts[item.kind] ?? 0) + 1;
  process.stdout.write(`${JSON.stringify({ outDir, queryCount: queries.length, counts, maxVisits })}\n`);
}

/** Move paths from the root to every reachable node (first path found wins). */
function nodePaths(problem: ProblemV1): Map<number, Array<[Color, number]>> {
  const paths = new Map<number, Array<[Color, number]>>();
  const visit = (nodeId: number, path: Array<[Color, number]>): void => {
    if (paths.has(nodeId)) return;
    paths.set(nodeId, path);
    const node = problem.nodes[nodeId]!;
    for (const edge of node.edges) {
      if (typeof edge.move !== 'number') continue;
      visit(edge.next, [...path, [node.toPlay, edge.move]]);
    }
  };
  visit(problem.root, []);
  return paths;
}

/** 4-connected chain of target-color setup stones containing the first anchor. */
function targetChain(problem: ProblemV1): number[] {
  const size = problem.boardSize;
  const own = new Set(problem.goal.targetColor === 'B' ? problem.setup.black : problem.setup.white);
  const chain = new Set<number>();
  const queue = [problem.goal.anchors[0]!];
  while (queue.length > 0) {
    const point = queue.pop()!;
    if (chain.has(point) || !own.has(point)) continue;
    chain.add(point);
    const x = point % size;
    const y = Math.floor(point / size);
    if (x > 0) queue.push(point - 1);
    if (x < size - 1) queue.push(point + 1);
    if (y > 0) queue.push(point - size);
    if (y < size - 1) queue.push(point + size);
  }
  return [...chain].sort((left, right) => left - right);
}

async function loadPack(packDir: string): Promise<ProblemV1[]> {
  const manifest = JSON.parse(await readFile(join(packDir, 'manifest.json'), 'utf8')) as {
    shards: Array<{ path: string }>;
  };
  const problems: ProblemV1[] = [];
  for (const shard of manifest.shards) {
    problems.push(...JSON.parse(await readFile(join(packDir, shard.path), 'utf8')) as ProblemV1[]);
  }
  return problems;
}

type KataGoAnalysis = {
  id: string;
  rootInfo?: { winrate: number; scoreLead: number };
  ownership?: number[];
  error?: string;
};

type Verdict = {
  id: string;
  kind: QueryKind;
  problemId: string;
  nodeId: number;
  move?: number;
  studentWinrate: number;
  targetOwnership: number;
  flag?: string;
};

async function report(outDirName: string): Promise<void> {
  const outDir = resolve(outDirName);
  const meta = JSON.parse(await readFile(join(outDir, 'metadata.json'), 'utf8')) as VerificationMetadata;
  const results = new Map<string, KataGoAnalysis>();
  for (const line of (await readFile(join(outDir, 'results.jsonl'), 'utf8')).split('\n')) {
    if (!line.trim()) continue;
    const parsed = JSON.parse(line) as KataGoAnalysis;
    results.set(parsed.id, parsed);
  }

  const verdicts: Verdict[] = [];
  const missing: string[] = [];

  for (const query of meta.queries) {
    const analysis = results.get(query.id);
    if (!analysis?.rootInfo || !analysis.ownership) {
      missing.push(query.id);
      continue;
    }
    // The run pins reportAnalysisWinratesAs=BLACK: winrate and ownership are Black's.
    const blackWinrate = analysis.rootInfo.winrate;
    const studentWinrate = query.studentColor === 'B' ? blackWinrate : 1 - blackWinrate;
    const targetOwnershipBlack = query.targetStones.length === 0 ? 0
      : query.targetStones.reduce((sum, point) => sum + (analysis.ownership![point] ?? 0), 0)
        / query.targetStones.length;
    const targetOwnership = query.targetColor === 'B' ? targetOwnershipBlack : -targetOwnershipBlack;
    const verdict: Verdict = {
      id: query.id,
      kind: query.kind,
      problemId: query.problemId,
      nodeId: query.nodeId,
      ...(query.move === undefined ? {} : { move: query.move }),
      studentWinrate: round(studentWinrate),
      targetOwnership: round(targetOwnership),
    };
    verdicts.push(verdict);
  }

  const goalMet = (verdict: Verdict, query: QueryMetadata) => (
    query.goalKind === 'live' ? verdict.targetOwnership > 0.25 : verdict.targetOwnership < -0.25
  );
  const goalClearlyMet = (verdict: Verdict, query: QueryMetadata) => (
    query.goalKind === 'live' ? verdict.targetOwnership > 0.6 : verdict.targetOwnership < -0.6
  );
  const queriesById = new Map(meta.queries.map(query => [query.id, query]));

  for (const verdict of verdicts) {
    const query = queriesById.get(verdict.id)!;
    if (verdict.kind === 'root') {
      // The problem should be unsettled before the first move.
      if (goalClearlyMet(verdict, query)) verdict.flag = 'already-settled';
    } else if (verdict.kind === 'book') {
      if (!goalMet(verdict, query)) verdict.flag = 'book-move-doubtful';
    } else if (verdict.kind === 'wrong') {
      // A graded mistake must not still achieve the goal.
      if (goalClearlyMet(verdict, query)) verdict.flag = 'suspicious-wrong';
      else if (goalMet(verdict, query)) verdict.flag = 'wrong-unclear';
    } else if (verdict.kind === 'alternative') {
      // Winrate is uninformative at komi 0 on a mostly empty board; ownership only.
      if (goalClearlyMet(verdict, query)) {
        verdict.flag = 'confirmed-alternative';
      } else if (!goalMet(verdict, query)) {
        verdict.flag = 'alternative-rejected';
      } else {
        verdict.flag = 'alternative-unclear';
      }
    }
  }

  const summary: Record<string, number> = { total: verdicts.length, missingResults: missing.length };
  for (const verdict of verdicts) {
    if (verdict.flag) summary[verdict.flag] = (summary[verdict.flag] ?? 0) + 1;
  }
  for (const kind of ['root', 'book', 'wrong', 'alternative'] as const) {
    summary[`${kind}Queries`] = verdicts.filter(verdict => verdict.kind === kind).length;
  }
  const reportPayload = {
    schemaVersion: 1,
    verification: 'katago-ownership-candidate-signal',
    maxVisits: meta.maxVisits,
    packDir: meta.packDir,
    summary,
    flagged: verdicts.filter(verdict => verdict.flag && verdict.flag !== 'confirmed-alternative'),
    confirmedAlternatives: verdicts.filter(verdict => verdict.flag === 'confirmed-alternative')
      .map(verdict => ({ problemId: verdict.problemId, nodeId: verdict.nodeId, move: verdict.move })),
  };
  await writeFile(join(outDir, 'verification-report.json'), `${JSON.stringify(reportPayload, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ reportPath: join(outDir, 'verification-report.json'), summary })}\n`);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
