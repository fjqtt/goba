import type { ProblemV1 } from '@goba/problem-contract';
import { db } from '../storage/database';
import { installPack } from '../storage/pack-installer';

export const CHO_COLLECTION_ID = 'cho-chikun-elementary-local-candidates-v1';
export const CHO_PACK_ID = 'cho-chikun-elementary-local-candidates';
export const CHO_PACK_REVISION = 1;
export const CHO_PROBLEM_COUNT = 861;
const CLIENT_VERSION = '0.1.0';
const MANIFEST_PATH = `${import.meta.env.BASE_URL}packs/cho-elementary/1/manifest.json`;

let loading: Promise<ProblemV1[]> | undefined;

export function loadBundledChoCatalog(): Promise<ProblemV1[]> {
  loading ??= loadPackCatalog({
    packId: CHO_PACK_ID,
    revision: CHO_PACK_REVISION,
    manifestUrl: new URL(MANIFEST_PATH, window.location.origin).toString(),
    expectedProblemCount: CHO_PROBLEM_COUNT,
  }).catch(error => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export async function loadPackCatalog(options: {
  packId: string;
  revision: number;
  manifestUrl: string;
  expectedProblemCount: number;
  fetch?: typeof globalThis.fetch;
}): Promise<ProblemV1[]> {
  const packKey = `${options.packId}:${options.revision}`;
  const ready = await db.packs.get(packKey);
  let records = ready?.state === 'ready'
    ? await db.problems.where('packKey').equals(packKey).toArray()
    : [];
  if (ready?.state !== 'ready' || records.length !== options.expectedProblemCount) {
    const installed = await installPack(options.manifestUrl, {
      clientVersion: CLIENT_VERSION,
      ...(options.fetch ? { fetch: options.fetch } : {}),
    });
    if (
      installed.packId !== options.packId
      || installed.revision !== options.revision
      || installed.problemCount !== options.expectedProblemCount
    ) {
      throw new Error('Bundled collection metadata does not match the expected revision');
    }
    records = await db.problems.where('packKey').equals(packKey).toArray();
  }
  if (records.length !== options.expectedProblemCount) {
    throw new Error(`Bundled collection has ${records.length}/${options.expectedProblemCount} problems`);
  }
  return records
    .sort((left, right) => left.problemId.localeCompare(right.problemId))
    .map(record => record.problem);
}
