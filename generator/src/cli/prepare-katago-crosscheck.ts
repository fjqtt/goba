import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import {
  applyMove,
  createRulesState,
  pointToVertex,
  type Color,
  type ProblemV1,
} from '@goba/problem-contract';
import type { Position } from '../domain';
import { importSgfCollection } from '../sgf/importer';
import {
  makeKataGoQuery,
  prefixKey,
  readGeneratedMovesByPrefix,
  type CrosscheckMetadata,
} from '../solver/katago-crosscheck';

const args = process.argv.slice(2);
if (args.length < 7) {
  process.stderr.write(
    'Usage: npm run prepare:katago-crosscheck --workspace @goba/generator -- '
      + '<cho.sgf> <exact-audit.json> <corrected.sgf> <corrected-audit.json> '
      + '<reconciliation-report.json> <output-directory> <max-visits>\n',
  );
  process.exitCode = 2;
} else {
  await main({
    collectionFile: args[0]!,
    exactAuditFile: args[1]!,
    correctedCollectionFile: args[2]!,
    correctedAuditFile: args[3]!,
    reconciliationReportFile: args[4]!,
    outputDirectory: args[5]!,
    maxVisits: positiveInt(args[6], 32),
  });
}

type AuditCandidate = {
  anchor: number;
  treePath?: string;
  tree?: { rootMoves: number[] };
};

type AuditResult = {
  problemNumber: number;
  status: string;
  expectedRootMoves: number[];
  sourceLine: Array<[Color, number]>;
  selectedTarget?: number;
  candidates: AuditCandidate[];
};

type AuditReport = { results: AuditResult[] };

type GenuineDifference = {
  problemNumber: number;
  category: 'genuine-setup-difference';
  rootMoves: Array<[number, number]>;
  line: Array<[Color, [number, number]]>;
  keyPosition: Position;
  sgfPosition: Position;
};

async function main(options: {
  collectionFile: string;
  exactAuditFile: string;
  correctedCollectionFile: string;
  correctedAuditFile: string;
  reconciliationReportFile: string;
  outputDirectory: string;
  maxVisits: number;
}): Promise<void> {
  const outputDirectory = resolve(options.outputDirectory);
  await mkdir(outputDirectory, { recursive: true });
  const [collection, exactAudit, correctedCollection, correctedAudit, reconciliation] = await Promise.all([
    loadCollection(options.collectionFile),
    loadJson<AuditReport>(options.exactAuditFile),
    loadCollection(options.correctedCollectionFile),
    loadJson<AuditReport>(options.correctedAuditFile),
    loadJson<{ unresolved: GenuineDifference[] }>(options.reconciliationReportFile),
  ]);
  const metadata: CrosscheckMetadata[] = [];
  addAuditQueries(metadata, 'exact', exactAudit, new Map(
    collection.drafts.map((draft, index) => [index + 1, draft.position]),
  ));
  addAuditQueries(metadata, 'reconciled', correctedAudit, new Map(
    correctedCollection.drafts.map(draft => {
      const problemNumber = Number.parseInt(draft.sourceLabel.match(/\d+/)?.[0] ?? '', 10);
      if (!Number.isInteger(problemNumber)) throw new Error(`Missing problem number in ${draft.sourceLabel}`);
      return [problemNumber, draft.position];
    }),
  ));
  for (const difference of reconciliation.unresolved.filter(item => item.category === 'genuine-setup-difference')) {
    const line = difference.line.map(([color, vertex]) => (
      [color, vertex[1] * 19 + vertex[0]] as [Color, number]
    ));
    const roots = difference.rootMoves.map(vertex => vertex[1] * 19 + vertex[0]);
    addLineQueries(metadata, {
      corpus: 'genuine-key',
      problemNumber: difference.problemNumber,
      auditStatus: 'genuine-setup-difference',
      position: difference.keyPosition,
      line,
      roots,
      generated: new Map(),
    });
    addLineQueries(metadata, {
      corpus: 'genuine-sgf',
      problemNumber: difference.problemNumber,
      auditStatus: 'genuine-setup-difference',
      position: difference.sgfPosition,
      line,
      roots,
      generated: new Map(),
    });
  }

  const queryPath = resolve(outputDirectory, 'queries.jsonl');
  const metadataPath = resolve(outputDirectory, 'metadata.json');
  const queries = metadata.map(item => JSON.stringify(makeKataGoQuery(item, options.maxVisits))).join('\n');
  await Promise.all([
    writeFile(queryPath, `${queries}\n`, 'utf8'),
    writeFile(metadataPath, `${JSON.stringify({
      schemaVersion: 1,
      maxVisits: options.maxVisits,
      queryCount: metadata.length,
      queries: metadata,
    }, null, 2)}\n`, 'utf8'),
  ]);
  const byCorpus = Object.fromEntries(
    ['exact', 'reconciled', 'genuine-key', 'genuine-sgf'].map(corpus => (
      [corpus, metadata.filter(item => item.corpus === corpus).length]
    )),
  );
  process.stdout.write(`${JSON.stringify({ queryPath, metadataPath, queryCount: metadata.length, byCorpus })}\n`);
}

function addAuditQueries(
  destination: CrosscheckMetadata[],
  corpus: 'exact' | 'reconciled',
  audit: AuditReport,
  positions: Map<number, Position>,
): void {
  for (const result of audit.results) {
    const position = positions.get(result.problemNumber);
    if (!position) throw new Error(`${corpus} audit result ${result.problemNumber} has no corresponding position`);
    const selected = result.candidates.find(candidate => candidate.anchor === result.selectedTarget);
    let generated = new Map<string, number[]>();
    if (selected?.treePath) {
      try {
        generated = readGeneratedMovesByPrefix(readFileSync(selected.treePath, 'utf8'), position);
      } catch (error) {
        process.stderr.write(
          `Skipping unreadable tree for ${corpus} problem ${result.problemNumber}: ${String(error)}\n`,
        );
      }
    }
    addLineQueries(destination, {
      corpus,
      problemNumber: result.problemNumber,
      auditStatus: result.status,
      position,
      line: result.sourceLine,
      roots: result.expectedRootMoves,
      generated,
    });
  }
}

function addLineQueries(destination: CrosscheckMetadata[], input: {
  corpus: CrosscheckMetadata['corpus'];
  problemNumber: number;
  auditStatus: string;
  position: Position;
  line: Array<[Color, number]>;
  roots: number[];
  generated: Map<string, number[]>;
}): void {
  let state = createRulesState(minimalProblem(input.position));
  const prefix: Array<[Color, number]> = [];
  const steps = Math.max(1, input.line.length);
  for (let ply = 0; ply < steps; ply += 1) {
    const expectedMoves = ply === 0
      ? [...new Set(input.roots.length > 0 ? input.roots : input.line[0] ? [input.line[0][1]] : [])].sort(numeric)
      : input.line[ply] ? [input.line[ply][1]] : [];
    const expectedMove = input.line[ply];
    const replay = expectedMove ? applyMove(state, expectedMove[0], expectedMove[1], input.position.boardSize) : undefined;
    const allowedMoves = viewportEmptyPoints(input.position, state.board.signMap, [
      ...expectedMoves,
      ...(input.generated.get(prefixKey(prefix)) ?? []),
    ]);
    destination.push({
      id: `${input.corpus}-${String(input.problemNumber).padStart(4, '0')}-ply-${String(ply).padStart(2, '0')}`,
      corpus: input.corpus,
      problemNumber: input.problemNumber,
      auditStatus: input.auditStatus,
      ply,
      position: input.position,
      prefix: [...prefix],
      player: state.toPlay,
      expectedMoves,
      generatorMoves: input.generated.get(prefixKey(prefix)) ?? [],
      expectedMoveLegality: replay ? (replay.ok ? 'legal' : replay.reason) : 'unknown',
      allowedMoves,
    });
    if (!expectedMove || !replay?.ok) break;
    prefix.push(expectedMove);
    state = replay.state;
  }
}

function viewportEmptyPoints(
  position: Position,
  signMap: ReadonlyArray<ReadonlyArray<number>>,
  required: number[],
): number[] {
  const allSetup = [...position.setup.black, ...position.setup.white, ...required];
  const xs = allSetup.map(point => point % position.boardSize);
  const ys = allSetup.map(point => Math.floor(point / position.boardSize));
  const x0 = Math.max(0, Math.min(...xs) - 1);
  const y0 = Math.max(0, Math.min(...ys) - 1);
  const x1 = Math.min(position.boardSize - 1, Math.max(...xs) + 1);
  const y1 = Math.min(position.boardSize - 1, Math.max(...ys) + 1);
  const result: number[] = [];
  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      if (signMap[y]?.[x] === 0) result.push(y * position.boardSize + x);
    }
  }
  return result;
}

function minimalProblem(position: Position): ProblemV1 {
  const anchor = position.setup.black[0] ?? position.setup.white[0]!;
  return {
    schemaVersion: 1,
    problemId: 'katago-crosscheck', revision: 1, learningVersion: 1,
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
      edges: [], coverage: { kind: 'listed-only', defaultVerdict: 'unclassified' },
      terminal: { result: 'success', outcome: 'unconditional-life', explanation: 'crosscheck placeholder' },
    }],
    root: 0,
    verification: {
      level: 'solver-checked', auditId: 'katago-crosscheck', adapterVersion: 'crosscheck-v1',
      scope: 'declared-position-and-rules',
    },
    source: { collection: 'crosscheck', attribution: '', licenseId: 'LicenseRef-Restricted-Research' },
    difficulty: { band: 'unknown', status: 'estimated' }, tags: [],
  };
}

async function loadCollection(path: string) {
  const fullPath = resolve(path);
  return importSgfCollection(await readFile(fullPath, 'utf8'), {
    sourceUri: `file://${fullPath}`,
    collection: basename(fullPath),
    attribution: 'Local restricted research artifact',
    licenseId: 'LicenseRef-Restricted-Research',
    distribution: 'restricted',
  });
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(resolve(path), 'utf8')) as T;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function numeric(left: number, right: number): number { return left - right; }
