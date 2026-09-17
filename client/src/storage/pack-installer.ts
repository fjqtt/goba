import {
  hashBytes,
  PackManifestV1Schema,
  supportsClientVersion,
  validateProblem,
  type PackManifestV1,
  type ProblemV1,
} from '@goba/problem-contract';
import { db, type StoredProblem } from './database';

export type PackInstallResult = {
  packId: string;
  revision: number;
  problemCount: number;
};

export class PackInstallError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'PackInstallError';
  }
}

export async function installPack(
  manifestUrl: string,
  options: { clientVersion: string; fetch?: typeof globalThis.fetch },
): Promise<PackInstallResult> {
  const fetcher = options.fetch ?? globalThis.fetch;
  const manifestResponse = await fetcher(manifestUrl, { headers: { Accept: 'application/json' } });
  if (!manifestResponse.ok) throw new PackInstallError('manifest-http', `Manifest request failed: ${manifestResponse.status}`);
  const parsedManifest = PackManifestV1Schema.safeParse(await manifestResponse.json());
  if (!parsedManifest.success) throw new PackInstallError('manifest-schema', parsedManifest.error.message);
  const manifest = parsedManifest.data;
  if (!supportsClientVersion(options.clientVersion, manifest.minClientVersion)) {
    throw new PackInstallError('client-version', `Pack requires client ${manifest.minClientVersion}`);
  }

  const packKey = `${manifest.packId}:${manifest.revision}`;
  await db.packs.put({ key: packKey, packId: manifest.packId, revision: manifest.revision, state: 'staged', manifest });

  try {
    const records: StoredProblem[] = [];
    for (const shard of manifest.shards) {
      const shardUrl = new URL(shard.path, manifestUrl).toString();
      const response = await fetcher(shardUrl, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new PackInstallError('shard-http', `Shard request failed: ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength !== shard.expandedBytes) {
        throw new PackInstallError('shard-size', `${shard.path} expanded size mismatch`);
      }
      if (await hashBytes(bytes) !== shard.sha256) {
        throw new PackInstallError('shard-hash', `${shard.path} hash mismatch`);
      }
      const problems = decodeShard(bytes);
      if (problems.length !== shard.problemCount) {
        throw new PackInstallError('shard-count', `${shard.path} problem count mismatch`);
      }
      for (const input of problems) {
        const validated = validateProblem(input);
        if (!validated.ok) throw new PackInstallError('problem-invalid', validated.errors.map(error => error.message).join('; '));
        records.push(toStoredProblem(packKey, validated.problem));
      }
    }

    await db.transaction('rw', db.packs, db.problems, db.settings, async () => {
      await db.problems.bulkPut(records);
      await db.packs.put({ key: packKey, packId: manifest.packId, revision: manifest.revision, state: 'ready', manifest });
      await db.settings.put({ key: `active-pack:${manifest.packId}`, value: packKey });
    });
    return { packId: manifest.packId, revision: manifest.revision, problemCount: records.length };
  } catch (error) {
    // The previous ready revision and active pointer stay untouched. The staged
    // row is retained so cleanup/diagnostics can distinguish interrupted work.
    throw error;
  }
}

function decodeShard(bytes: Uint8Array): unknown[] {
  let decoded: unknown;
  try {
    decoded = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new PackInstallError('shard-json', 'Shard is not valid UTF-8 JSON');
  }
  if (!Array.isArray(decoded)) throw new PackInstallError('shard-shape', 'Shard root must be a problem array');
  return decoded;
}

function toStoredProblem(packKey: string, problem: ProblemV1): StoredProblem {
  return {
    key: `${packKey}:${problem.problemId}:${problem.revision}`,
    packKey,
    problemId: problem.problemId,
    revision: problem.revision,
    problem,
    tags: problem.tags,
    difficulty: problem.difficulty.band,
  };
}
