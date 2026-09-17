import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { importSgfCollection } from '../sgf/importer';
import { executeTsumegoJob } from '../solver/tsumego-adapter';
import { MemoryGeneratorStore } from '../store';

const file = process.argv[2];
if (!file) {
  process.stderr.write('Usage: npm run probe --workspace @goba/generator -- <file.sgf> [draft-limit] [candidate-limit]\n');
  process.exitCode = 2;
} else {
  await main(file, positiveInt(process.argv[3], 1), positiveInt(process.argv[4], 4));
}

async function main(fileName: string, draftLimit: number, candidateLimit: number): Promise<void> {
  const absolute = resolve(fileName);
  const content = await readFile(absolute, 'utf8');
  const imported = await importSgfCollection(content, {
    sourceUri: `file://${absolute}`,
    collection: fileName,
    attribution: 'Local research import',
    licenseId: 'LicenseRef-Restricted-Research',
    distribution: 'restricted',
  });

  process.stdout.write(`${JSON.stringify({
    event: 'imported', assetSha256: imported.assetSha256, draftCount: imported.drafts.length,
  })}\n`);

  for (const draft of imported.drafts.slice(0, draftLimit)) {
    const hypotheses = draft.targetCandidates.slice(0, candidateLimit);
    for (const candidate of hypotheses) {
      const goalKind = candidate.color === draft.position.toPlay ? 'live' : 'capture';
      const store = new MemoryGeneratorStore();
      store.putImportedDrafts([draft]);
      const annotated = await store.annotateDraft(draft.draftId, draft.revision, {
        goalKind,
        targetColor: candidate.color,
        anchor: candidate.anchors[0]!,
        studentColor: draft.position.toPlay,
        boundary: { kind: 'full-board', assumptions: [] },
        confirmedBy: 'automated-hypothesis-only',
      });
      const task = annotated.canonicalTask!;
      const result = await executeTsumegoJob({
        jobId: `probe-${draft.draftId}-${candidate.color}-${candidate.anchors[0]}`,
        task,
        forcedPath: [],
        limits: { wallMs: 3_000, maxNodes: 10_000, memoryMiB: 256 },
        seed: 0,
        configurationId: 'tsumego-js@1.1.0/adapter-v1/ld-v1/probe',
        wrongMoveDepth: 1,
      });
      process.stdout.write(`${JSON.stringify({
        event: 'hypothesis',
        draftId: draft.draftId,
        sourceLabel: draft.sourceLabel,
        goalKind,
        targetColor: candidate.color,
        anchors: candidate.anchors,
        liberties: candidate.liberties,
        rank: candidate.rank,
        status: result.status,
        outcome: result.outcome,
        reason: result.reason,
        rawResult: safeJson(result.artifacts.rawResult),
        logs: result.artifacts.logs,
        wallMs: result.statistics.wallMs,
      })}\n`);
    }
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
