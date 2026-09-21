import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { hashBytes, type PackManifestV1, type ProblemV1 } from '@goba/problem-contract';
import { buildChoClientProblem, type ChoAuditResult } from '../catalog/cho-client-pack';
import type { RefutationReport } from '../catalog/refutation-expansion';
import { importSgfCollection } from '../sgf/importer';

const [
  collectionFile, auditFile, correctedCollectionFile, correctedAuditFile, reconciliationFile, outputDirectoryArg,
  refutationsFile, adjustmentsFile,
] = process.argv.slice(2);
if (!collectionFile || !auditFile || !correctedCollectionFile || !correctedAuditFile || !reconciliationFile || !outputDirectoryArg) {
  process.stderr.write(
    'Usage: npm run build:cho-client-pack --workspace @goba/generator -- '
      + '<cho.sgf> <audit.json> <corrected.sgf> <corrected-audit.json> '
      + '<reconciliation.json> <output-directory> [refutations-report.json] [katago-adjustments.json]\n',
  );
  process.exitCode = 2;
} else {
  await main(
    collectionFile, auditFile, correctedCollectionFile, correctedAuditFile, reconciliationFile, outputDirectoryArg,
    refutationsFile, adjustmentsFile,
  );
}

type AuditReport = { results: ChoAuditResult[] };
type KataGoAdjustments = {
  quarantineProblemNumbers: number[];
  correctAdditions: Array<{ problemNumber: number; nodeId: number; move: number }>;
  /** Framed-KataGo re-selected target anchors that override the audit selection. */
  retargets?: Array<{ problemNumber: number; anchor: number }>;
};

async function main(
  collectionName: string,
  auditName: string,
  correctedCollectionName: string,
  correctedAuditName: string,
  reconciliationName: string,
  outputDirectoryName: string,
  refutationsName?: string,
  adjustmentsName?: string,
): Promise<void> {
  const auditBytes = await readFile(resolve(auditName));
  const [collection, correctedCollection, correctedAudit, reconciliation, refutationsReport, adjustments] = await Promise.all([
    loadCollection(collectionName),
    loadCollection(correctedCollectionName),
    loadJson<AuditReport>(correctedAuditName),
    loadJson<{ unresolved: Array<{ problemNumber: number; category: string }> }>(reconciliationName),
    refutationsName ? loadJson<RefutationReport>(refutationsName) : Promise.resolve(undefined),
    adjustmentsName ? loadJson<KataGoAdjustments>(adjustmentsName) : Promise.resolve(undefined),
  ]);
  const katagoQuarantine = new Set(adjustments?.quarantineProblemNumbers ?? []);
  const retargetByProblem = new Map((adjustments?.retargets ?? []).map(item => [item.problemNumber, item.anchor]));
  const additionsByProblem = new Map<number, Array<{ nodeId: number; move: number }>>();
  for (const addition of adjustments?.correctAdditions ?? []) {
    const list = additionsByProblem.get(addition.problemNumber) ?? [];
    list.push({ nodeId: addition.nodeId, move: addition.move });
    additionsByProblem.set(addition.problemNumber, list);
  }
  const audit = JSON.parse(auditBytes.toString('utf8')) as AuditReport;
  if (refutationsReport) {
    const auditSha256 = await hashBytes(new Uint8Array(auditBytes));
    if (refutationsReport.auditReportSha256 !== auditSha256) {
      throw new Error(
        'Refutations report was generated from a different audit report; rerun expand:cho-refutations first',
      );
    }
  }
  const refutationsByProblem = new Map(
    (refutationsReport?.results ?? [])
      .filter(result => result.status === 'expanded' && result.wrongBranches.length > 0)
      .map(result => [result.problemNumber, result.wrongBranches]),
  );
  const exactPositions = new Map(collection.drafts.map((draft, index) => [index + 1, draft.position]));
  const correctedPositions = new Map(correctedCollection.drafts.map(draft => {
    const problemNumber = Number.parseInt(draft.sourceLabel.match(/\d+/)?.[0] ?? '', 10);
    if (!Number.isInteger(problemNumber)) throw new Error(`Missing problem number in ${draft.sourceLabel}`);
    return [problemNumber, draft.position];
  }));
  const problems: ProblemV1[] = [];
  const exclusions: Array<{ problemNumber: number; corpus: string; reason: string }> = [];
  const refutationMergeWarnings: Array<{ problemNumber: number; reason: string }> = [];
  for (const [corpus, report, positions] of [
    ['exact', audit, exactPositions],
    ['reconciled', correctedAudit, correctedPositions],
  ] as const) {
    for (const rawResult of report.results) {
      const position = positions.get(rawResult.problemNumber);
      if (!position) throw new Error(`Missing ${corpus} position ${rawResult.problemNumber}`);
      // A framed-KataGo retarget re-encodes the problem with a different target group.
      const retargetAnchor = corpus === 'exact' ? retargetByProblem.get(rawResult.problemNumber) : undefined;
      const result = retargetAnchor === undefined ? rawResult : { ...rawResult, selectedTarget: retargetAnchor };
      const selected = result.candidates.find(candidate => candidate.anchor === result.selectedTarget);
      // GNU Go proposing PASS means the position may already be settled; quarantine until
      // human review. A framed-KataGo retarget already verified the goal and overrides this.
      if (retargetAnchor === undefined && selected?.primaryMove === 'PASS') {
        exclusions.push({ problemNumber: result.problemNumber, corpus, reason: 'quarantined-explicit-pass' });
        continue;
      }
      // KataGo escalation flagged the book line or found the position already settled.
      if (katagoQuarantine.has(result.problemNumber)) {
        exclusions.push({ problemNumber: result.problemNumber, corpus, reason: 'quarantined-katago-review' });
        continue;
      }
      const correctAdditions = corpus === 'exact' ? additionsByProblem.get(result.problemNumber) : undefined;
      // A KataGo-confirmed alternative supersedes a matching GNU Go wrong branch.
      const refutations = corpus === 'exact'
        ? refutationsByProblem.get(result.problemNumber)?.filter(branch => !correctAdditions?.some(
          addition => addition.nodeId === branch.ply && addition.move === branch.move,
        ))
        : undefined;
      let problem;
      try {
        problem = await buildChoClientProblem({
          audit: result, position, corpus,
          ...(refutations ? { refutations } : {}),
          ...(correctAdditions ? { correctAdditions } : {}),
        });
      } catch (error) {
        // A malformed refutation/addition record must not abort the whole build; the
        // problem ships without extra branches and the mismatch is reported for review.
        if (!refutations && !correctAdditions) throw error;
        refutationMergeWarnings.push({
          problemNumber: result.problemNumber,
          reason: error instanceof Error ? error.message : String(error),
        });
        problem = await buildChoClientProblem({ audit: result, position, corpus });
      }
      if (problem) problems.push(problem);
      else exclusions.push({
        problemNumber: result.problemNumber,
        corpus,
        reason: !result.sourceLineReplay.legal
          ? 'source-line-illegal'
          : result.selectedTarget === undefined ? 'no-selected-target' : 'missing-root-move',
      });
    }
  }
  for (const item of reconciliation.unresolved) {
    exclusions.push({
      problemNumber: item.problemNumber,
      corpus: 'genuine-difference',
      reason: item.problemNumber === 216 ? 'both-versions-illegal' : item.category,
    });
  }
  problems.sort((left, right) => left.problemId.localeCompare(right.problemId));
  const outputDirectory = resolve(outputDirectoryName);
  await mkdir(outputDirectory, { recursive: true });
  const shardSize = 100;
  const shards: PackManifestV1['shards'] = [];
  for (let offset = 0; offset < problems.length; offset += shardSize) {
    const shard = problems.slice(offset, offset + shardSize);
    const path = `problems-${String(offset / shardSize + 1).padStart(3, '0')}.json`;
    const bytes = new TextEncoder().encode(`${JSON.stringify(shard)}\n`);
    await writeFile(resolve(outputDirectory, path), bytes);
    shards.push({
      path,
      sha256: await hashBytes(bytes),
      bytes: bytes.byteLength,
      expandedBytes: bytes.byteLength,
      problemCount: shard.length,
    });
  }
  const manifest: PackManifestV1 = {
    packId: 'cho-chikun-elementary-local-candidates',
    revision: 6,
    schemaVersion: 1,
    minClientVersion: '0.1.0',
    shards,
    attribution: 'Restricted local research pack. Cho Chikun elementary positions and community printable lines.',
    publishedAt: '2026-09-21T19:00:00+01:00',
    revoked: [],
  };
  const manifestPath = resolve(outputDirectory, 'manifest.json');
  const exclusionsPath = resolve(outputDirectory, 'exclusions.json');
  await Promise.all([
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8'),
    writeFile(exclusionsPath, `${JSON.stringify(exclusions, null, 2)}\n`, 'utf8'),
  ]);
  process.stdout.write(`${JSON.stringify({
    manifestPath,
    exclusionsPath,
    problemCount: problems.length,
    exactCount: problems.filter(problem => problem.tags.includes('exact')).length,
    reconciledCount: problems.filter(problem => problem.tags.includes('reconciled')).length,
    excludedCount: exclusions.length,
    quarantinedPass: exclusions.filter(item => item.reason === 'quarantined-explicit-pass').length,
    quarantinedKatago: exclusions.filter(item => item.reason === 'quarantined-katago-review').length,
    withRefutations: problems.filter(problem => problem.tags.includes('has-refutations')).length,
    withAlternatives: problems.filter(problem => problem.tags.includes('has-alternatives')).length,
    alternativeEdges: problems.reduce((sum, problem) => sum + problem.nodes.reduce(
      (inner, node) => inner + Math.max(0, node.edges.filter(
        edge => edge.verdict === 'correct' && edge.role === 'solution',
      ).length - 1), 0,
    ), 0),
    studentWrongEdges: problems.reduce((sum, problem) => sum + problem.nodes.reduce(
      (inner, node) => inner + node.edges.filter(
        edge => edge.verdict === 'wrong' && edge.role === 'refutation',
      ).length, 0,
    ), 0),
    failureTerminals: problems.reduce((sum, problem) => sum + problem.nodes.filter(
      node => node.terminal?.result === 'failure',
    ).length, 0),
    refutationMergeWarnings,
    shardCount: shards.length,
  })}\n`);
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
