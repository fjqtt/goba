import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import { hashBytes, type PackManifestV1, type ProblemV1 } from '@goba/problem-contract';
import { buildChoClientProblem, type ChoAuditResult } from '../catalog/cho-client-pack';
import { importSgfCollection } from '../sgf/importer';

const [
  collectionFile, auditFile, correctedCollectionFile, correctedAuditFile, reconciliationFile, outputDirectoryArg,
] = process.argv.slice(2);
if (!collectionFile || !auditFile || !correctedCollectionFile || !correctedAuditFile || !reconciliationFile || !outputDirectoryArg) {
  process.stderr.write(
    'Usage: npm run build:cho-client-pack --workspace @goba/generator -- '
      + '<cho.sgf> <audit.json> <corrected.sgf> <corrected-audit.json> '
      + '<reconciliation.json> <output-directory>\n',
  );
  process.exitCode = 2;
} else {
  await main(
    collectionFile, auditFile, correctedCollectionFile, correctedAuditFile, reconciliationFile, outputDirectoryArg,
  );
}

type AuditReport = { results: ChoAuditResult[] };

async function main(
  collectionName: string,
  auditName: string,
  correctedCollectionName: string,
  correctedAuditName: string,
  reconciliationName: string,
  outputDirectoryName: string,
): Promise<void> {
  const [collection, audit, correctedCollection, correctedAudit, reconciliation] = await Promise.all([
    loadCollection(collectionName),
    loadJson<AuditReport>(auditName),
    loadCollection(correctedCollectionName),
    loadJson<AuditReport>(correctedAuditName),
    loadJson<{ unresolved: Array<{ problemNumber: number; category: string }> }>(reconciliationName),
  ]);
  const exactPositions = new Map(collection.drafts.map((draft, index) => [index + 1, draft.position]));
  const correctedPositions = new Map(correctedCollection.drafts.map(draft => {
    const problemNumber = Number.parseInt(draft.sourceLabel.match(/\d+/)?.[0] ?? '', 10);
    if (!Number.isInteger(problemNumber)) throw new Error(`Missing problem number in ${draft.sourceLabel}`);
    return [problemNumber, draft.position];
  }));
  const problems: ProblemV1[] = [];
  const exclusions: Array<{ problemNumber: number; corpus: string; reason: string }> = [];
  for (const [corpus, report, positions] of [
    ['exact', audit, exactPositions],
    ['reconciled', correctedAudit, correctedPositions],
  ] as const) {
    for (const result of report.results) {
      const position = positions.get(result.problemNumber);
      if (!position) throw new Error(`Missing ${corpus} position ${result.problemNumber}`);
      const problem = await buildChoClientProblem({ audit: result, position, corpus });
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
    revision: 1,
    schemaVersion: 1,
    minClientVersion: '0.1.0',
    shards,
    attribution: 'Restricted local research pack. Cho Chikun elementary positions and community printable lines.',
    publishedAt: '2026-09-17T09:00:00+01:00',
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
