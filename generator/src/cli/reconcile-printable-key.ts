import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashBytes, pointToVertex } from '@goba/problem-contract';
import type { DraftRecord, Position } from '../domain';
import { parsePrintableAnswer, recoverMalformedAnswer, sameSetup } from '../corpus/printable-answer-key';
import { importSgfCollection } from '../sgf/importer';

const [collectionFile, answerKeyFile, outputDirectoryArg] = process.argv.slice(2);
if (!collectionFile || !answerKeyFile || !outputDirectoryArg) {
  process.stderr.write(
    'Usage: npm run reconcile:printable-key --workspace @goba/generator -- '
      + '<collection.sgf> <go-problems.json> <output-directory>\n',
  );
  process.exitCode = 2;
} else {
  await main(collectionFile, answerKeyFile, outputDirectoryArg);
}

async function main(collectionName: string, answerKeyName: string, outputDirectoryName: string): Promise<void> {
  const collectionPath = resolve(collectionName);
  const answerKeyPath = resolve(answerKeyName);
  const outputDirectory = resolve(outputDirectoryName);
  await mkdir(outputDirectory, { recursive: true });
  const [collectionBytes, answerKeyBytes] = await Promise.all([
    readFile(collectionPath),
    readFile(answerKeyPath),
  ]);
  const collection = await importSgfCollection(collectionBytes.toString('utf8'), source(collectionPath));
  const records = (JSON.parse(answerKeyBytes.toString('utf8')) as Record<string, Record<string, string>>)
    ['cho-elementary'];
  if (!records) throw new Error('Answer key has no cho-elementary collection');

  const resolved: Array<{
    problemNumber: number;
    category: 'numbered-overlay-flattened' | 'malformed-recovered';
    answer: ReturnType<typeof parsePrintableAnswer>;
    repair?: { row: number; column: number };
  }> = [];
  const unresolved: Array<Record<string, unknown>> = [];

  for (let problemNumber = 1; problemNumber <= collection.drafts.length; problemNumber += 1) {
    const draft = collection.drafts[problemNumber - 1]!;
    const encoded = records[String(problemNumber)];
    if (!encoded) continue;
    try {
      const answer = parsePrintableAnswer(problemNumber, encoded);
      if (sameSetup(answer.position, draft.position)) continue;
      if (sameSetup(answer.displayPosition, draft.position)) {
        resolved.push({ problemNumber, category: 'numbered-overlay-flattened', answer });
      } else {
        unresolved.push({
          problemNumber,
          category: 'genuine-setup-difference',
          rootMoves: answer.rootMoves.map(point => pointToVertex(point, 19)),
          line: answer.line.map(([color, point]) => [color, pointToVertex(point, 19)]),
          difference: setupDifference(answer.position, draft.position),
          keyPosition: answer.position,
          sgfPosition: draft.position,
        });
      }
    } catch (error) {
      const recovered = recoverMalformedAnswer(problemNumber, encoded, draft.position);
      if (recovered) {
        resolved.push({
          problemNumber,
          category: 'malformed-recovered',
          answer: recovered.answer,
          repair: recovered.insertedAt,
        });
      } else {
        unresolved.push({
          problemNumber,
          category: 'malformed-unresolved',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  const correctedSgf = resolved.map(item => positionToSgf(item.problemNumber, item.answer.position)).join('');
  const correctedSgfPath = resolve(outputDirectory, 'corrected-positions.sgf');
  await writeFile(correctedSgfPath, correctedSgf, 'utf8');
  const correctedCollection = await importSgfCollection(correctedSgf, source(correctedSgfPath));
  const answerKeySha256 = await hashBytes(new Uint8Array(answerKeyBytes));
  const correctedLinks = resolved.map((item, index) => ({
    problemNumber: item.problemNumber,
    candidateDraftId: correctedCollection.drafts[index]!.draftId,
    linkedDraftId: correctedCollection.drafts[index]!.draftId,
    status: 'reconciled',
    setupMatches: true,
    rootMoves: item.answer.rootMoves.map(point => pointToVertex(point, 19)),
    line: item.answer.line.map(([color, point]) => [color, pointToVertex(point, 19)]),
    issues: [],
    reconciliation: item.category,
    ...(item.repair ? { repair: item.repair } : {}),
  }));
  const correctedManifest = {
    schemaVersion: 1,
    verification: 'community-key-reconciled-unverified',
    distribution: 'restricted',
    collection: {
      path: correctedSgfPath,
      sha256: correctedCollection.assetSha256,
      draftCount: correctedCollection.drafts.length,
    },
    answerKey: {
      path: answerKeyPath,
      sha256: answerKeySha256,
      source: 'https://github.com/travisgk/tsumego-pdf',
      recordCount: Object.keys(records).length,
    },
    summary: {
      linked: correctedLinks.length,
      setupMismatches: 0,
      recordsWithIssues: 0,
      parseErrors: 0,
    },
    links: correctedLinks,
  };
  const correctedLinksPath = resolve(outputDirectory, 'corrected-links.json');
  await writeFile(correctedLinksPath, `${JSON.stringify(correctedManifest, null, 2)}\n`, 'utf8');

  const report = {
    schemaVersion: 1,
    verification: 'content-reconciliation-candidate',
    distribution: 'restricted',
    sources: {
      collection: { path: collectionPath, sha256: collection.assetSha256 },
      answerKey: { path: answerKeyPath, sha256: answerKeySha256 },
    },
    summary: {
      numberedOverlayFlattened: resolved.filter(item => item.category === 'numbered-overlay-flattened').length,
      malformedRecovered: resolved.filter(item => item.category === 'malformed-recovered').length,
      genuineSetupDifferences: unresolved.filter(item => item.category === 'genuine-setup-difference').length,
      malformedUnresolved: unresolved.filter(item => item.category === 'malformed-unresolved').length,
    },
    resolved: resolved.map(item => ({
      problemNumber: item.problemNumber,
      category: item.category,
      ...(item.repair ? { repair: item.repair } : {}),
    })),
    unresolved,
    artifacts: { correctedSgfPath, correctedLinksPath },
  };
  const reportPath = resolve(outputDirectory, 'reconciliation-report.json');
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ reportPath, ...report.summary, correctedSgfPath, correctedLinksPath })}\n`);
}

function setupDifference(key: Position, sgf: Position): Record<string, number[]> {
  const difference = (left: number[], right: number[]) => left.filter(point => !right.includes(point));
  return {
    keyOnlyBlack: difference(key.setup.black, sgf.setup.black),
    sgfOnlyBlack: difference(sgf.setup.black, key.setup.black),
    keyOnlyWhite: difference(key.setup.white, sgf.setup.white),
    sgfOnlyWhite: difference(sgf.setup.white, key.setup.white),
  };
}

function positionToSgf(problemNumber: number, position: Position): string {
  const encode = (property: string, points: number[]) => points.length === 0
    ? ''
    : `${property}${points.map(point => `[${pointToSgf(point, position.boardSize)}]`).join('')}`;
  return `(;FF[4]GM[1]SZ[${position.boardSize}]C[problem ${problemNumber}]`
    + `${encode('AB', position.setup.black)}${encode('AW', position.setup.white)}PL[${position.toPlay}])`;
}

function pointToSgf(point: number, size: number): string {
  const [x, y] = pointToVertex(point, size);
  return `${'abcdefghijklmnopqrstuvwxyz'[x]}${'abcdefghijklmnopqrstuvwxyz'[y]}`;
}

function source(path: string) {
  return {
    sourceUri: `file://${path}`,
    collection: 'Cho printable-key reconciliation',
    attribution: 'Local restricted research artifact',
    licenseId: 'LicenseRef-Restricted-Research',
    distribution: 'restricted' as const,
  };
}
