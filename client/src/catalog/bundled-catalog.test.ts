import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { hashBytes } from '@goba/problem-contract';
import { createSampleProblem } from '../fixtures/sample-problem';
import { db } from '../storage/database';
import { loadPackCatalog } from './bundled-catalog';

describe('bundled catalog', () => {
  afterEach(async () => {
    await Promise.all([db.packs.clear(), db.problems.clear(), db.settings.clear()]);
  });

  it('installs once and then loads the ready IndexedDB copy', async () => {
    const problem = await createSampleProblem();
    const bytes = new TextEncoder().encode(JSON.stringify([problem]));
    const manifest = {
      packId: 'local-test', revision: 1, schemaVersion: 1, minClientVersion: '0.1.0',
      shards: [{
        path: 'problems.json', sha256: await hashBytes(bytes), bytes: bytes.byteLength,
        expandedBytes: bytes.byteLength, problemCount: 1,
      }],
      attribution: 'Test', publishedAt: '2026-09-17T09:00:00+01:00', revoked: [],
    };
    let fetchCount = 0;
    const fetcher: typeof fetch = async input => {
      fetchCount += 1;
      return String(input).endsWith('manifest.json')
        ? Response.json(manifest)
        : new Response(bytes.slice().buffer as ArrayBuffer);
    };
    const options = {
      packId: 'local-test', revision: 1,
      manifestUrl: 'https://local.test/packs/manifest.json', expectedProblemCount: 1, fetch: fetcher,
    };
    await expect(loadPackCatalog(options)).resolves.toHaveLength(1);
    await expect(loadPackCatalog(options)).resolves.toHaveLength(1);
    expect(fetchCount).toBe(2);
  });
});
