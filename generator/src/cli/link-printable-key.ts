import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { hashBytes, pointToVertex } from '@goba/problem-contract';
import { parsePrintableAnswer, sameSetup } from '../corpus/printable-answer-key';
import { importSgfCollection } from '../sgf/importer';

const [collectionFile, answerKeyFile, outputFile] = process.argv.slice(2);
if (!collectionFile || !answerKeyFile) {
  process.stderr.write(
    'Usage: npm run link:printable-key --workspace @goba/generator -- '
      + '<collection.sgf> <go-problems.json> [output.json]\n',
  );
  process.exitCode = 2;
} else {
  await main(collectionFile, answerKeyFile, outputFile);
}

async function main(collectionName: string, answerKeyName: string, outputName?: string): Promise<void> {
  const collectionPath = resolve(collectionName);
  const answerKeyPath = resolve(answerKeyName);
  const collectionBytes = await readFile(collectionPath);
  const answerKeyBytes = await readFile(answerKeyPath);
  const collection = await importSgfCollection(collectionBytes.toString('utf8'), {
    sourceUri: `file://${collectionPath}`,
    collection: collectionName,
    attribution: 'Local research import',
    licenseId: 'LicenseRef-Restricted-Research',
    distribution: 'restricted',
  });
  const parsed = JSON.parse(answerKeyBytes.toString('utf8')) as Record<string, Record<string, string>>;
  const records = parsed['cho-elementary'];
  if (!records || typeof records !== 'object') throw new Error('Answer key has no cho-elementary collection');

  const links = Object.entries(records).sort(([left], [right]) => Number(left) - Number(right)).map(([key, value]) => {
    const problemNumber = Number.parseInt(key, 10);
    const draft = collection.drafts[problemNumber - 1];
    try {
      const answer = parsePrintableAnswer(problemNumber, value);
      const setupMatches = Boolean(draft && sameSetup(draft.position, answer.position));
      const linkable = setupMatches && answer.issues.length === 0;
      return {
        problemNumber,
        candidateDraftId: draft?.draftId,
        linkedDraftId: linkable ? draft?.draftId : undefined,
        status: linkable ? 'linked' : setupMatches ? 'key-issue' : 'setup-mismatch',
        setupMatches,
        rootMoves: answer.rootMoves.map(point => pointToVertex(point, 19)),
        line: answer.line.map(([color, point]) => [color, pointToVertex(point, 19)]),
        issues: answer.issues,
      };
    } catch (error) {
      return {
        problemNumber,
        candidateDraftId: draft?.draftId,
        linkedDraftId: undefined,
        status: 'parse-error',
        setupMatches: false,
        rootMoves: [],
        line: [],
        issues: [`parse-error: ${error instanceof Error ? error.message : String(error)}`],
      };
    }
  });
  const manifest = {
    schemaVersion: 1,
    verification: 'community-key-unverified',
    distribution: 'restricted',
    collection: {
      path: collectionPath,
      sha256: await hashBytes(new Uint8Array(collectionBytes)),
      draftCount: collection.drafts.length,
    },
    answerKey: {
      path: answerKeyPath,
      sha256: await hashBytes(new Uint8Array(answerKeyBytes)),
      source: 'https://github.com/travisgk/tsumego-pdf',
      recordCount: Object.keys(records).length,
    },
    summary: {
      linked: links.filter(link => link.setupMatches && link.issues.length === 0).length,
      setupMismatches: links.filter(link => !link.setupMatches).length,
      recordsWithIssues: links.filter(link => link.issues.length > 0).length,
      parseErrors: links.filter(link => link.issues.some(issue => issue.startsWith('parse-error:'))).length,
    },
    links,
  };

  if (outputName) await writeFile(resolve(outputName), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ...manifest.summary, output: outputName ? resolve(outputName) : undefined })}\n`);
  for (const link of links.filter(item => !item.setupMatches || item.issues.length > 0)) {
    process.stdout.write(`${JSON.stringify({ event: 'unlinked', ...link })}\n`);
  }
}
