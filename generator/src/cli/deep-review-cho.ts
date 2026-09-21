import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { Color } from '@goba/problem-contract';
import type { Position } from '../domain';
import { importSgfCollection } from '../sgf/importer';
import { pointToGtp } from '../solver/katago-crosscheck';
import type { ChoAuditResult } from '../catalog/cho-client-pack';
import type { RefutationReport } from '../catalog/refutation-expansion';
import { buildFrame, chainFromAnchor } from '../catalog/tsumego-frame';

/**
 * Deep KataGo review of quarantined problems, book-move-rejected problems, and
 * unclear alternative candidates, using a tsumego frame: the board outside the
 * problem box is filled with two unconditionally alive walls (interior grid eyes)
 * and komi neutralizes the frame balance, so the game is decided by the corner and
 * the student winrate becomes a sharp goal signal alongside target ownership.
 *
 * prepare: builds framed queries. report: joins results and produces triage.
 * The analysis run must pin KATAGO_EXTRA_OVERRIDES=reportAnalysisWinratesAs=BLACK.
 */

const [mode, ...rest] = process.argv.slice(2);
if (mode === 'prepare' && rest.length >= 6) {
  await prepare(rest[0]!, rest[1]!, rest[2]!, rest[3]!, rest[4]!, rest[5]!);
} else if (mode === 'report' && rest.length >= 1) {
  await report(rest[0]!);
} else if (mode === 'retarget' && rest.length >= 4) {
  await retarget(rest[0]!, rest[1]!, rest[2]!, rest[3]!);
} else {
  process.stderr.write(
    'Usage: npm run deep-review:cho --workspace @goba/generator -- prepare '
      + '<cho.sgf> <audit-report.json> <refutations-report.json> <verification-report.json> '
      + '<katago-adjustments.json> <out-dir>\n'
      + '   or: ... report <out-dir>\n',
  );
  process.exitCode = 2;
}

type ReviewKind = 'leaf' | 'pass' | 'alt' | 'root-bench';

type ReviewMetadata = {
  id: string;
  kind: ReviewKind;
  problemNumber: number;
  group: 'katago-quarantine' | 'pass-quarantine' | 'book-rejected' | 'alternative' | 'bench';
  goalKind: 'live' | 'capture';
  targetColor: Color;
  studentColor: Color;
  targetStones: number[];
  nodeId?: number;
  move?: number;
  expectedRootMoves?: number[];
};

async function prepare(
  collectionName: string,
  auditName: string,
  refutationsName: string,
  verificationName: string,
  adjustmentsName: string,
  outDirName: string,
): Promise<void> {
  const outDir = resolve(outDirName);
  await mkdir(outDir, { recursive: true });
  const collectionPath = resolve(collectionName);
  const [collection, audit, refutations, verification] = await Promise.all([
    importSgfCollection(await readFile(collectionPath, 'utf8'), {
      sourceUri: `file://${collectionPath}`,
      collection: basename(collectionPath),
      attribution: 'Local research import',
      licenseId: 'LicenseRef-Restricted-Research',
      distribution: 'restricted',
    }),
    readFile(resolve(auditName), 'utf8').then(text => JSON.parse(text) as { results: ChoAuditResult[] }),
    readFile(resolve(refutationsName), 'utf8').then(text => JSON.parse(text) as RefutationReport),
    readFile(resolve(verificationName), 'utf8').then(text => JSON.parse(text) as {
      flagged: Array<{ id: string; flag?: string; problemId: string; nodeId: number; move?: number }>;
    }),
  ]);
  const adjustments = JSON.parse(await readFile(resolve(adjustmentsName), 'utf8')) as {
    quarantineProblemNumbers: number[];
  };

  const positions = new Map(collection.drafts.map((draft, index) => [index + 1, draft.position]));
  const auditByNumber = new Map(audit.results.map(result => [result.problemNumber, result]));
  const katagoQuarantine = new Set(adjustments.quarantineProblemNumbers);
  const passQuarantine = new Set(audit.results
    .filter(result => result.candidates.find(c => c.anchor === result.selectedTarget)?.primaryMove === 'PASS')
    .map(result => result.problemNumber));
  const bookRejected = new Set(refutations.results
    .filter(result => result.status === 'book-move-rejected')
    .map(result => result.problemNumber));
  const unclearAlternatives = verification.flagged
    .filter(item => item.flag === 'alternative-unclear' && item.move !== undefined)
    .map(item => ({
      problemNumber: Number.parseInt(item.problemId.slice(-4), 10),
      nodeId: item.nodeId,
      move: item.move!,
    }));

  const queries: string[] = [];
  const metadata: ReviewMetadata[] = [];
  const framedFor = new Map<number, ReturnType<typeof buildFrame>>();

  const frameFor = (problemNumber: number, extraPoints: number[]): ReturnType<typeof buildFrame> | undefined => {
    if (framedFor.has(problemNumber)) return framedFor.get(problemNumber);
    const position = positions.get(problemNumber);
    const record = auditByNumber.get(problemNumber);
    if (!position || !record) return undefined;
    const frame = buildFrame(position, [
      ...record.expectedRootMoves,
      ...record.sourceLine.map(([, point]) => point),
      ...extraPoints,
    ]);
    framedFor.set(problemNumber, frame);
    return frame;
  };

  const add = (
    meta: ReviewMetadata,
    position: Position,
    frame: NonNullable<ReturnType<typeof buildFrame>>,
    moves: Array<[Color, number | 'pass']>,
    maxVisits: number,
  ) => {
    metadata.push(meta);
    const size = position.boardSize;
    queries.push(JSON.stringify({
      id: meta.id,
      initialStones: [
        ...position.setup.black.map(point => ['B', pointToGtp(point, size)]),
        ...position.setup.white.map(point => ['W', pointToGtp(point, size)]),
        ...frame.black.map(point => ['B', pointToGtp(point, size)]),
        ...frame.white.map(point => ['W', pointToGtp(point, size)]),
      ],
      initialPlayer: position.toPlay,
      moves: moves.map(([color, point]) => [color, point === 'pass' ? 'pass' : pointToGtp(point, size)]),
      rules: 'aga',
      komi: frame.komi(position.toPlay),
      boardXSize: size,
      boardYSize: size,
      analyzeTurns: [moves.length],
      maxVisits,
      analysisPVLen: 8,
      includePolicy: false,
      includeOwnership: true,
      rootPolicyTemperature: 1.0,
      rootFpuReductionMax: 0,
    }));
  };

  const reviewNumbers: Array<[number, ReviewMetadata['group']]> = [
    ...[...katagoQuarantine].map(n => [n, 'katago-quarantine'] as [number, ReviewMetadata['group']]),
    ...[...passQuarantine].map(n => [n, 'pass-quarantine'] as [number, ReviewMetadata['group']]),
    ...[...bookRejected].filter(n => !katagoQuarantine.has(n) && !passQuarantine.has(n))
      .map(n => [n, 'book-rejected'] as [number, ReviewMetadata['group']]),
  ];

  for (const [problemNumber, group] of reviewNumbers) {
    const record = auditByNumber.get(problemNumber);
    const position = positions.get(problemNumber);
    const frame = frameFor(problemNumber, []);
    if (!record || !position || !frame || !record.sourceLineReplay.legal) continue;
    const selected = record.candidates.find(c => c.anchor === record.selectedTarget);
    if (!selected) continue;
    const base = {
      problemNumber,
      group,
      goalKind: selected.goalKind,
      targetColor: selected.targetColor,
      studentColor: position.toPlay,
      targetStones: chainFromAnchor(position, selected.targetColor, selected.anchor),
    };
    add({ ...base, id: `leaf-${problemNumber}`, kind: 'leaf' }, position, frame,
      record.sourceLine.map(([c, p]) => [c, p] as [Color, number]), 800);
    add({ ...base, id: `pass-${problemNumber}`, kind: 'pass' }, position, frame,
      [[position.toPlay, 'pass']], 800);
  }

  for (const alt of unclearAlternatives) {
    const record = auditByNumber.get(alt.problemNumber);
    const position = positions.get(alt.problemNumber);
    if (!record || !position || katagoQuarantine.has(alt.problemNumber)) continue;
    const frame = frameFor(alt.problemNumber, [alt.move]);
    const selected = record.candidates.find(c => c.anchor === record.selectedTarget);
    if (!frame || !selected) continue;
    const prefix = record.sourceLine.slice(0, alt.nodeId).map(([c, p]) => [c, p] as [Color, number]);
    add({
      problemNumber: alt.problemNumber, group: 'alternative', kind: 'alt',
      id: `alt-${alt.problemNumber}-n${alt.nodeId}-m${alt.move}`,
      goalKind: selected.goalKind, targetColor: selected.targetColor, studentColor: position.toPlay,
      targetStones: chainFromAnchor(position, selected.targetColor, selected.anchor),
      nodeId: alt.nodeId, move: alt.move,
    }, position, frame, [...prefix, [position.toPlay, alt.move]], 500);
  }

  // Benchmark: framed roots of 100 clean full-line problems; the top search move
  // should match an expected root (new-net + frame quality measure).
  const benchPool = audit.results.filter(result => (
    result.status === 'full-line-match' && result.sourceLineReplay.legal
    && !katagoQuarantine.has(result.problemNumber) && !passQuarantine.has(result.problemNumber)
  ));
  for (let index = 0; index < benchPool.length && index < 100; index += 1) {
    const record = benchPool[index]!;
    const position = positions.get(record.problemNumber);
    const frame = frameFor(record.problemNumber, []);
    const selected = record.candidates.find(c => c.anchor === record.selectedTarget);
    if (!position || !frame || !selected) continue;
    add({
      problemNumber: record.problemNumber, group: 'bench', kind: 'root-bench',
      id: `bench-${record.problemNumber}`,
      goalKind: selected.goalKind, targetColor: selected.targetColor, studentColor: position.toPlay,
      targetStones: chainFromAnchor(position, selected.targetColor, selected.anchor),
      expectedRootMoves: record.expectedRootMoves,
    }, position, frame, [], 128);
  }

  await Promise.all([
    writeFile(join(outDir, 'queries.jsonl'), `${queries.join('\n')}\n`, 'utf8'),
    writeFile(join(outDir, 'metadata.json'), `${JSON.stringify({ schemaVersion: 1, queries: metadata })}\n`, 'utf8'),
  ]);
  const counts: Record<string, number> = {};
  for (const item of metadata) counts[item.group] = (counts[item.group] ?? 0) + 1;
  process.stdout.write(`${JSON.stringify({ outDir, queryCount: queries.length, counts })}\n`);
}

type Analysis = {
  id: string;
  rootInfo?: { winrate: number; scoreLead?: number };
  moveInfos?: Array<{ move: string; order: number }>;
  ownership?: number[];
};

async function report(outDirName: string): Promise<void> {
  const outDir = resolve(outDirName);
  const meta = JSON.parse(await readFile(join(outDir, 'metadata.json'), 'utf8')) as {
    queries: ReviewMetadata[];
  };
  const results = new Map<string, Analysis>();
  for (const line of (await readFile(join(outDir, 'results.jsonl'), 'utf8')).split('\n')) {
    if (line.trim()) {
      const parsed = JSON.parse(line) as Analysis;
      results.set(parsed.id, parsed);
    }
  }

  type Reading = { winrate: number; scoreLead: number; ownership: number };
  const readingFor = (query: ReviewMetadata): Reading | undefined => {
    const analysis = results.get(query.id);
    if (!analysis?.rootInfo || !analysis.ownership) return undefined;
    const blackWinrate = analysis.rootInfo.winrate;
    const winrate = query.studentColor === 'B' ? blackWinrate : 1 - blackWinrate;
    const ownBlack = query.targetStones.reduce((sum, point) => sum + (analysis.ownership![point] ?? 0), 0)
      / query.targetStones.length;
    const ownership = query.targetColor === 'B' ? ownBlack : -ownBlack;
    return { winrate: round(winrate), scoreLead: round(analysis.rootInfo.scoreLead ?? 0), ownership: round(ownership) };
  };
  // Framed winrate saturates (the surrounding wall usually outweighs the corner
  // group even on failure), so target ownership is the gating signal; winrate and
  // scoreLead are recorded for inspection only.
  const goalClearlyMet = (reading: Reading, goal: 'live' | 'capture') => (
    goal === 'live' ? reading.ownership > 0.6 : reading.ownership < -0.6
  );

  const byProblem = new Map<number, Partial<Record<ReviewKind, { query: ReviewMetadata; reading: Reading }>>>();
  const altVerdicts: Array<{ problemNumber: number; nodeId: number; move: number; verdict: string; winrate: number; ownership: number }> = [];
  let benchHits = 0;
  let benchTotal = 0;

  for (const query of meta.queries) {
    const reading = readingFor(query);
    if (!reading) continue;
    if (query.kind === 'alt') {
      const confirmed = goalClearlyMet(reading, query.goalKind);
      const rejected = query.goalKind === 'live' ? reading.ownership < 0.2 : reading.ownership > -0.2;
      altVerdicts.push({
        problemNumber: query.problemNumber, nodeId: query.nodeId!, move: query.move!,
        verdict: confirmed ? 'confirmed' : rejected ? 'rejected' : 'unclear',
        winrate: reading.winrate, ownership: reading.ownership,
      });
    } else if (query.kind === 'root-bench') {
      benchTotal += 1;
      const analysis = results.get(query.id)!;
      const top = analysis.moveInfos?.find(info => info.order === 0)?.move;
      const size = 19;
      const expected = new Set((query.expectedRootMoves ?? []).map(point => pointToGtp(point, size)));
      if (top && expected.has(top)) benchHits += 1;
    } else {
      const bucket = byProblem.get(query.problemNumber) ?? {};
      bucket[query.kind] = { query, reading };
      byProblem.set(query.problemNumber, bucket);
    }
  }

  const triage: Array<{
    problemNumber: number; group: string; verdict: string;
    leaf?: Reading; pass?: Reading;
  }> = [];
  for (const [problemNumber, bucket] of [...byProblem].sort((a, b) => a[0] - b[0])) {
    const leaf = bucket.leaf;
    const pass = bucket.pass;
    if (!leaf) continue;
    const bookOk = goalClearlyMet(leaf.reading, leaf.query.goalKind);
    const settled = pass !== undefined && goalClearlyMet(pass.reading, pass.query.goalKind);
    const verdict = settled ? 'settled' : bookOk ? 'readmit' : 'keep-quarantined';
    triage.push({
      problemNumber, group: leaf.query.group, verdict,
      leaf: leaf.reading, ...(pass ? { pass: pass.reading } : {}),
    });
  }

  const summary: Record<string, number> = {};
  for (const item of triage) {
    summary[`${item.group}:${item.verdict}`] = (summary[`${item.group}:${item.verdict}`] ?? 0) + 1;
  }
  for (const alt of altVerdicts) {
    summary[`alt:${alt.verdict}`] = (summary[`alt:${alt.verdict}`] ?? 0) + 1;
  }
  summary['bench:top1'] = benchHits;
  summary['bench:total'] = benchTotal;

  const payload = {
    schemaVersion: 1,
    verification: 'katago-1.18.2-b18c384nbt-tsumego-frame',
    summary,
    triage,
    alternatives: altVerdicts,
  };
  await writeFile(join(outDir, 'deep-review-report.json'), `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ reportPath: join(outDir, 'deep-review-report.json'), summary })}\n`);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Target re-selection for quarantined problems using the existing framed leaf/pass
 * ownership arrays: a hypothesis (target chain + goal) is valid when the book line
 * clearly achieves it AND it fails when the student passes. Exactly one valid
 * hypothesis re-encodes the problem; zero or several stay quarantined for a human.
 */
async function retarget(
  collectionName: string,
  auditName: string,
  reviewDirName: string,
  adjustmentsName: string,
): Promise<void> {
  const collectionPath = resolve(collectionName);
  const [collection, audit] = await Promise.all([
    importSgfCollection(await readFile(collectionPath, 'utf8'), {
      sourceUri: `file://${collectionPath}`,
      collection: basename(collectionPath),
      attribution: 'Local research import',
      licenseId: 'LicenseRef-Restricted-Research',
      distribution: 'restricted',
    }),
    readFile(resolve(auditName), 'utf8').then(text => JSON.parse(text) as { results: ChoAuditResult[] }),
  ]);
  const adjustments = JSON.parse(await readFile(resolve(adjustmentsName), 'utf8')) as {
    quarantineProblemNumbers: number[];
    correctAdditions: Array<{ problemNumber: number; nodeId: number; move: number }>;
  };
  const reviewDir = resolve(reviewDirName);
  const results = new Map<string, Analysis>();
  for (const line of (await readFile(join(reviewDir, 'results.jsonl'), 'utf8')).split('\n')) {
    if (line.trim()) {
      const parsed = JSON.parse(line) as Analysis;
      results.set(parsed.id, parsed);
    }
  }

  const positions = new Map(collection.drafts.map((draft, index) => [index + 1, draft.position]));
  const auditByNumber = new Map(audit.results.map(result => [result.problemNumber, result]));
  const passQuarantine = audit.results
    .filter(result => result.candidates.find(c => c.anchor === result.selectedTarget)?.primaryMove === 'PASS')
    .map(result => result.problemNumber);
  const reviewNumbers = [...new Set([...adjustments.quarantineProblemNumbers, ...passQuarantine])].sort((a, b) => a - b);

  const retargets: Array<{ problemNumber: number; anchor: number; goalKind: string; leafOwn: number; passOwn: number }> = [];
  const manual: Array<{ problemNumber: number; reason: string; passingCount?: number }> = [];

  for (const problemNumber of reviewNumbers) {
    const record = auditByNumber.get(problemNumber);
    const position = positions.get(problemNumber);
    const leaf = results.get(`leaf-${problemNumber}`);
    const pass = results.get(`pass-${problemNumber}`);
    if (!record || !position || !leaf?.ownership || !pass?.ownership) {
      manual.push({ problemNumber, reason: 'no-framed-analysis' });
      continue;
    }
    const passing: Array<{ anchor: number; goalKind: 'live' | 'capture'; leafOwn: number; passOwn: number }> = [];
    for (const candidate of record.candidates) {
      const goalKind: 'live' | 'capture' = candidate.targetColor === position.toPlay ? 'live' : 'capture';
      const chain = chainFromAnchor(position, candidate.targetColor, candidate.anchor);
      if (chain.length === 0) continue;
      const ownAt = (ownership: number[]) => {
        const black = chain.reduce((sum, point) => sum + (ownership[point] ?? 0), 0) / chain.length;
        return candidate.targetColor === 'B' ? black : -black;
      };
      const leafOwn = ownAt(leaf.ownership);
      const passOwn = ownAt(pass.ownership);
      const leafMet = goalKind === 'live' ? leafOwn > 0.6 : leafOwn < -0.6;
      const passMet = goalKind === 'live' ? passOwn > 0.6 : passOwn < -0.6;
      if (leafMet && !passMet) {
        passing.push({ anchor: candidate.anchor, goalKind, leafOwn: round(leafOwn), passOwn: round(passOwn) });
      }
    }
    if (passing.length === 1) {
      retargets.push({ problemNumber, ...passing[0]! });
    } else {
      manual.push({ problemNumber, reason: passing.length === 0 ? 'no-valid-hypothesis' : 'ambiguous', passingCount: passing.length });
    }
  }

  const retargetNumbers = new Set(retargets.map(item => item.problemNumber));
  const v3 = {
    schemaVersion: 3,
    verification: 'katago-1.18.2-b18c384nbt-tsumego-frame',
    source: 'retarget sweep 2026-09-21 over deep-review framed leaf/pass ownership',
    quarantineProblemNumbers: adjustments.quarantineProblemNumbers.filter(n => !retargetNumbers.has(n)),
    correctAdditions: adjustments.correctAdditions.filter(a => !retargetNumbers.has(a.problemNumber)),
    retargets: retargets.map(({ problemNumber, anchor }) => ({ problemNumber, anchor })),
  };
  const patchedResults = audit.results
    .filter(result => retargetNumbers.has(result.problemNumber))
    .map(result => ({ ...result, selectedTarget: retargets.find(r => r.problemNumber === result.problemNumber)!.anchor }));

  await Promise.all([
    writeFile(join(reviewDir, 'katago-adjustments-v3.json'), `${JSON.stringify(v3, null, 1)}\n`, 'utf8'),
    writeFile(join(reviewDir, 'retargeted-audit-subset.json'), `${JSON.stringify({ results: patchedResults })}\n`, 'utf8'),
    writeFile(join(reviewDir, 'retarget-report.json'), `${JSON.stringify({ retargets, manual }, null, 1)}\n`, 'utf8'),
  ]);
  process.stdout.write(`${JSON.stringify({
    reviewed: reviewNumbers.length,
    retargeted: retargets.length,
    manual: manual.length,
    manualReasons: manual.reduce<Record<string, number>>((acc, item) => {
      acc[item.reason] = (acc[item.reason] ?? 0) + 1;
      return acc;
    }, {}),
  })}\n`);
}
