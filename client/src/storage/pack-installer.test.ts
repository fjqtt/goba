import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import { hashBytes } from '@goba/problem-contract';
import { createSampleProblem } from '../fixtures/sample-problem';
import { db } from './database';
import { installPack, PackInstallError } from './pack-installer';

describe('staged pack install', () => {
  afterEach(async () => {
    await Promise.all([
      db.packs.clear(),
      db.problems.clear(),
      db.settings.clear(),
    ]);
  });

  it('verifies and atomically activates a complete shard', async () => {
    const problem = await createSampleProblem();
    const bytes = new TextEncoder().encode(JSON.stringify([problem]));
    const manifest = makeManifest(bytes, await hashBytes(bytes));
    const fetcher = mockFetch(manifest, bytes);

    await expect(installPack('https://cdn.example/packs/starter/1/manifest.json', {
      clientVersion: '0.1.0', fetch: fetcher,
    })).resolves.toEqual({ packId: 'starter', revision: 1, problemCount: 1 });

    expect((await db.packs.get('starter:1'))?.state).toBe('ready');
    expect(await db.problems.where('packKey').equals('starter:1').count()).toBe(1);
    expect((await db.settings.get('active-pack:starter'))?.value).toBe('starter:1');
  });

  it('deletes the superseded revision when a newer one activates', async () => {
    const problem = await createSampleProblem();
    const bytes = new TextEncoder().encode(JSON.stringify([problem]));
    const sha256 = await hashBytes(bytes);
    await installPack('https://cdn.example/packs/starter/1/manifest.json', {
      clientVersion: '0.1.0', fetch: mockFetch(makeManifest(bytes, sha256), bytes),
    });
    await installPack('https://cdn.example/packs/starter/2/manifest.json', {
      clientVersion: '0.1.0', fetch: mockFetch({ ...makeManifest(bytes, sha256), revision: 2 }, bytes),
    });

    expect(await db.packs.get('starter:1')).toBeUndefined();
    expect(await db.problems.where('packKey').equals('starter:1').count()).toBe(0);
    expect((await db.packs.get('starter:2'))?.state).toBe('ready');
    expect(await db.problems.where('packKey').equals('starter:2').count()).toBe(1);
    expect((await db.settings.get('active-pack:starter'))?.value).toBe('starter:2');
  });

  it('retains staged diagnostics and does not activate a corrupt shard', async () => {
    const problem = await createSampleProblem();
    const bytes = new TextEncoder().encode(JSON.stringify([problem]));
    const manifest = makeManifest(bytes, `sha256:${'f'.repeat(64)}`);

    await expect(installPack('https://cdn.example/packs/starter/1/manifest.json', {
      clientVersion: '0.1.0', fetch: mockFetch(manifest, bytes),
    })).rejects.toMatchObject({ code: 'shard-hash' } satisfies Partial<PackInstallError>);

    expect((await db.packs.get('starter:1'))?.state).toBe('staged');
    expect(await db.settings.get('active-pack:starter')).toBeUndefined();
    expect(await db.problems.count()).toBe(0);
  });
});

function makeManifest(bytes: Uint8Array, sha256: string) {
  return {
    packId: 'starter',
    revision: 1,
    schemaVersion: 1,
    minClientVersion: '0.1.0',
    shards: [{
      path: 'problems-001.json',
      sha256,
      bytes: bytes.byteLength,
      expandedBytes: bytes.byteLength,
      problemCount: 1,
    }],
    attribution: 'Technical fixture',
    publishedAt: '2026-09-15T18:00:00+01:00',
    revoked: [],
  };
}

function mockFetch(manifest: object, bytes: Uint8Array): typeof fetch {
  return async (input) => {
    const url = String(input);
    if (url.endsWith('manifest.json')) return Response.json(manifest);
    if (url.endsWith('problems-001.json')) return new Response(bytes.slice().buffer as ArrayBuffer);
    return new Response(null, { status: 404 });
  };
}
