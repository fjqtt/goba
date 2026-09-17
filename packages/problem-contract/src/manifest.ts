import { z } from 'zod';

export const Sha256Schema = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const PackManifestV1Schema = z.object({
  packId: z.string().min(1),
  revision: z.number().int().positive(),
  schemaVersion: z.literal(1),
  minClientVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
  shards: z.array(z.object({
    path: z.string().min(1).refine(path => !path.startsWith('/') && !path.includes('..'), 'Shard path must be relative and cannot traverse'),
    sha256: Sha256Schema,
    bytes: z.number().int().positive(),
    expandedBytes: z.number().int().positive().max(5 * 1024 * 1024),
    problemCount: z.number().int().positive(),
  })).min(1),
  attribution: z.string(),
  publishedAt: z.string().datetime({ offset: true }),
  revoked: z.array(z.object({
    problemId: z.string().min(1),
    revision: z.number().int().positive(),
  })).default([]),
});

export type PackManifestV1 = z.infer<typeof PackManifestV1Schema>;

export function supportsClientVersion(clientVersion: string, minimum: string): boolean {
  const parse = (value: string) => value.split('.').map(part => Number.parseInt(part, 10));
  const client = parse(clientVersion);
  const required = parse(minimum);
  for (let index = 0; index < 3; index += 1) {
    if (client[index]! > required[index]!) return true;
    if (client[index]! < required[index]!) return false;
  }
  return true;
}
