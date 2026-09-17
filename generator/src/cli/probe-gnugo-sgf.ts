import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { importSgfCollection } from '../sgf/importer';
import { executeGnuGoJob } from '../solver/gnugo-adapter';
import { MemoryGeneratorStore } from '../store';

const file = process.argv[2];
if (!file) {
  process.stderr.write(
    'Usage: npm run probe:gnugo --workspace @goba/generator -- '
      + '<file.sgf> [start=1] [count=1] [candidate-limit=4] [artifact-dir]\n',
  );
  process.exitCode = 2;
} else {
  await main(
    file,
    positiveInt(process.argv[3], 1),
    positiveInt(process.argv[4], 1),
    positiveInt(process.argv[5], 4),
    process.argv[6],
  );
}

async function main(
  fileName: string,
  start: number,
  count: number,
  candidateLimit: number,
  requestedArtifactDirectory?: string,
): Promise<void> {
  const absolute = resolve(fileName);
  const artifactDirectory = resolve(
    requestedArtifactDirectory ?? join(tmpdir(), 'goba-gnugo-probe', `${basename(fileName)}-${Date.now()}`),
  );
  await mkdir(artifactDirectory, { recursive: true });
  const imported = await importSgfCollection(await readFile(absolute, 'utf8'), {
    sourceUri: `file://${absolute}`,
    collection: fileName,
    attribution: 'Local research import',
    licenseId: 'LicenseRef-Restricted-Research',
    distribution: 'restricted',
  });

  process.stdout.write(`${JSON.stringify({
    event: 'imported',
    assetSha256: imported.assetSha256,
    draftCount: imported.drafts.length,
    selection: { start, count, candidateLimit },
    artifactDirectory,
  })}\n`);

  const selected = imported.drafts.slice(start - 1, start - 1 + count);
  for (const [draftOffset, draft] of selected.entries()) {
    for (const candidate of draft.targetCandidates.slice(0, candidateLimit)) {
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
      const result = await executeGnuGoJob({
        jobId: `gnugo-probe-${draft.draftId}-${candidate.color}-${candidate.anchors[0]}`,
        task,
        forcedPath: [],
        limits: { wallMs: 10_000, maxNodes: 100_000, memoryMiB: 256 },
        seed: 0,
        configurationId: 'gnu-go@3.8/owl/adapter-v1/ld-v1/probe',
        wrongMoveDepth: 1,
      });
      const problemNumber = start + draftOffset;
      const artifactStem = `problem-${problemNumber}-candidate-${candidate.rank}-${candidate.color.toLowerCase()}`;
      const rawTree = result.artifacts.rawTree;
      const treePath = rawTree
        ? join(artifactDirectory, `${artifactStem}.sgf`)
        : undefined;
      if (treePath && rawTree) await writeFile(treePath, rawTree, 'utf8');

      process.stdout.write(`${JSON.stringify({
        event: 'hypothesis',
        problemNumber,
        draftId: draft.draftId,
        sourceLabel: draft.sourceLabel,
        annotation: 'automated-hypothesis-only',
        goalKind,
        targetColor: candidate.color,
        anchors: candidate.anchors,
        liberties: candidate.liberties,
        rank: candidate.rank,
        status: result.status,
        outcome: result.outcome,
        reason: result.reason,
        rawResult: safeJson(result.artifacts.rawResult),
        treePath,
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
