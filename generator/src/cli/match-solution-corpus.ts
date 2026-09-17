import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { importSgfCollection } from '../sgf/importer';
import type { Position } from '../domain';

const [collectionFile, jsonDirectory] = process.argv.slice(2);
if (!collectionFile || !jsonDirectory) {
  process.stderr.write('Usage: npm run match-corpus --workspace @goba/generator -- <collection.sgf> <json-directory>\n');
  process.exitCode = 2;
} else {
  await main(collectionFile, jsonDirectory);
}

async function main(collectionName: string, directoryName: string): Promise<void> {
  const collectionPath = resolve(collectionName);
  const directoryPath = resolve(directoryName);
  const collection = await importSgfCollection(await readFile(collectionPath, 'utf8'), source(collectionPath));
  const byPosition = new Map(collection.drafts.map(draft => [signature(draft.position), draft]));
  const files = (await readdir(directoryPath)).filter(file => file.endsWith('.json')).sort();
  const matches: Array<{ corpusFile: string; sourceFile: string; draftId: string; sourceLabel: string }> = [];
  const unmatched: Array<{ corpusFile: string; sourceFile?: string; error?: string }> = [];

  for (const file of files) {
    try {
      const record = JSON.parse(await readFile(join(directoryPath, file), 'utf8')) as {
        filename?: string;
        rawsgf?: string;
        turn_color?: string;
      };
      if (!record.rawsgf) continue;
      const candidate = await importSgfCollection(record.rawsgf, source(join(directoryPath, file)));
      const draft = candidate.drafts[0];
      if (draft && (record.turn_color === 'b' || record.turn_color === 'w')) {
        draft.position.toPlay = record.turn_color.toUpperCase() as 'B' | 'W';
      }
      const match = draft && byPosition.get(signature(draft.position));
      if (match) {
        matches.push({
          corpusFile: file,
          sourceFile: record.filename ?? '',
          draftId: match.draftId,
          sourceLabel: match.sourceLabel,
        });
      } else {
        unmatched.push({ corpusFile: file, sourceFile: record.filename });
      }
    } catch (error) {
      unmatched.push({
        corpusFile: file,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  process.stdout.write(`${JSON.stringify({
    collectionDrafts: collection.drafts.length,
    solutionRecords: files.length,
    exactPositionMatches: matches.length,
    matches,
    unmatched,
  }, null, 2)}\n`);
}

function signature(position: Position): string {
  const size = position.boardSize;
  const variants: string[] = [];
  for (let transform = 0; transform < 8; transform += 1) {
    const map = (point: number): number => {
      let x = point % size;
      let y = Math.floor(point / size);
      if (transform >= 4) x = size - 1 - x;
      for (let turn = 0; turn < transform % 4; turn += 1) [x, y] = [size - 1 - y, x];
      return y * size + x;
    };
    variants.push(JSON.stringify({
      boardSize: size,
      black: position.setup.black.map(map).sort(numeric),
      white: position.setup.white.map(map).sort(numeric),
      toPlay: position.toPlay,
    }));
  }
  return variants.sort()[0]!;
}

function numeric(left: number, right: number): number {
  return left - right;
}

function source(path: string) {
  return {
    sourceUri: `file://${path}`,
    collection: 'Local corpus comparison',
    attribution: 'Local research import',
    licenseId: 'LicenseRef-Restricted-Research',
    distribution: 'restricted' as const,
  };
}
