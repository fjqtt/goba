import { describe, expect, it } from 'vitest';
import { PackManifestV1Schema, supportsClientVersion } from './manifest';

const validManifest = {
  packId: 'starter',
  revision: 1,
  schemaVersion: 1,
  minClientVersion: '0.1.0',
  shards: [{
    path: 'packs/starter/1/problems-001.json',
    sha256: `sha256:${'a'.repeat(64)}`,
    bytes: 120,
    expandedBytes: 240,
    problemCount: 1,
  }],
  attribution: 'Technical fixture',
  publishedAt: '2026-09-15T18:00:00+01:00',
  revoked: [],
};

describe('PackManifestV1', () => {
  it('accepts immutable relative shard paths', () => {
    expect(PackManifestV1Schema.safeParse(validManifest).success).toBe(true);
  });

  it('rejects path traversal', () => {
    const invalid = structuredClone(validManifest);
    invalid.shards[0]!.path = '../private.json';
    expect(PackManifestV1Schema.safeParse(invalid).success).toBe(false);
  });

  it('compares normalized client versions', () => {
    expect(supportsClientVersion('0.2.0', '0.1.9')).toBe(true);
    expect(supportsClientVersion('0.1.0', '0.1.0')).toBe(true);
    expect(supportsClientVersion('0.0.9', '0.1.0')).toBe(false);
  });
});
