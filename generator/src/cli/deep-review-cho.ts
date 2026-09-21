import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import type { Color } from '@goba/problem-contract';
import type { Position } from '../domain';
import { importSgfCollection } from '../sgf/importer';
import { pointToGtp } from '../solver/katago-crosscheck';
import type { ChoAuditResult } from '../catalog/cho-client-pack';
import type { RefutationReport } from '../catalog/refutation-expansion';

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

/**
 * Fills the board outside the problem box with two walls (one per color) that are
 * unconditionally alive via interior grid eyes, and computes the komi that makes
 * the corner outcome decide the game. Components too small to hold two eyes stay
 * empty. Returns undefined when the problem leaves no room for a frame.
 */
export function buildFrame(position: Position, relevantPoints: number[]) {
  const size = position.boardSize;
  const stones = [...position.setup.black, ...position.setup.white];
  const points = [...stones, ...relevantPoints.filter(point => point >= 0 && point < size * size)];
  const xs = points.map(point => point % size);
  const ys = points.map(point => Math.floor(point / size));
  const boxX1 = Math.min(size - 1, Math.max(...xs) + 2);
  const boxY1 = Math.min(size - 1, Math.max(...ys) + 2);
  if (boxX1 >= size - 4 && boxY1 >= size - 4) return undefined;

  // One empty gap line around the box; right strip is one color, the rest below is the other.
  const inFrame = (x: number, y: number) => x > boxX1 + 1 || y > boxY1 + 1;
  const colorAt = (x: number, y: number): Color => (x > boxX1 + 1 ? 'W' : 'B');
  const isHole = (x: number, y: number) => x % 5 === 2 && y % 5 === 2;

  const candidate = new Map<number, Color>();
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (inFrame(x, y) && !isHole(x, y)) candidate.set(y * size + x, colorAt(x, y));
    }
  }
  // Label connected components, then count each hole whose in-board 8-neighborhood
  // lies entirely inside one component (a true single-point eye).
  const componentOf = new Map<number, number>();
  const componentColor: Color[] = [];
  const componentPoints: number[][] = [];
  for (const [start, color] of candidate) {
    if (componentOf.has(start)) continue;
    const componentId = componentPoints.length;
    componentColor.push(color);
    const component: number[] = [];
    const stack = [start];
    componentOf.set(start, componentId);
    while (stack.length > 0) {
      const point = stack.pop()!;
      component.push(point);
      const x = point % size;
      const y = Math.floor(point / size);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const nx = x + dx;
        const ny = y + dy;
        const next = ny * size + nx;
        if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
        if (componentOf.has(next) || candidate.get(next) !== color) continue;
        componentOf.set(next, componentId);
        stack.push(next);
      }
    }
    componentPoints.push(component);
  }
  const eyesPerComponent = new Array<number>(componentPoints.length).fill(0);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (!isHole(x, y) || !inFrame(x, y)) continue;
      let owner: number | undefined;
      let surrounded = true;
      for (let ax = -1; ax <= 1 && surrounded; ax += 1) {
        for (let ay = -1; ay <= 1 && surrounded; ay += 1) {
          if (ax === 0 && ay === 0) continue;
          const sx = x + ax;
          const sy = y + ay;
          if (sx < 0 || sy < 0 || sx >= size || sy >= size) continue;
          const id = componentOf.get(sy * size + sx);
          if (id === undefined || (owner !== undefined && id !== owner)) surrounded = false;
          else owner = id;
        }
      }
      if (surrounded && owner !== undefined) eyesPerComponent[owner]! += 1;
    }
  }
  const black: number[] = [];
  const white: number[] = [];
  let holesBlack = 0;
  let holesWhite = 0;
  componentPoints.forEach((component, componentId) => {
    if (eyesPerComponent[componentId]! < 2) return;
    if (componentColor[componentId] === 'B') {
      black.push(...component);
      holesBlack += eyesPerComponent[componentId]!;
    } else {
      white.push(...component);
      holesWhite += eyesPerComponent[componentId]!;
    }
  });
  if (black.length === 0 && white.length === 0) return undefined;
  const blackArea = black.length + holesBlack;
  const whiteArea = white.length + holesWhite;
  return {
    black,
    white,
    komi: (student: Color) => blackArea - whiteArea + (student === 'B' ? 0.5 : -0.5),
  };
}

function chainFromAnchor(position: Position, color: Color, anchor: number): number[] {
  const size = position.boardSize;
  const own = new Set(color === 'B' ? position.setup.black : position.setup.white);
  const chain = new Set<number>();
  const queue = [anchor];
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
  return [...chain].sort((a, b) => a - b);
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
