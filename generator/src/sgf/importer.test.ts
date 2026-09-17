import { describe, expect, it } from 'vitest';
import { importSgfCollection } from './importer';

const source = {
  sourceUri: 'https://example.test/cho-1.sgf',
  collection: 'Fixture collection',
  attribution: 'Fixture author',
  licenseId: 'LicenseRef-Test',
  distribution: 'restricted' as const,
};

describe('SGF collection importer', () => {
  it('splits collection variations into deterministic position drafts', async () => {
    const sgf = `(;FF[4]GM[1]SZ[9]CA[UTF-8]C[collection]
      (;C[problem 1]PL[B]AB[aa][ba]AW[ab][bb])
      (;C[problem 2]PL[W]AB[gg]AW[gh];W[hh]))`;
    const first = await importSgfCollection(sgf, source);
    const second = await importSgfCollection(sgf, source);

    expect(first.assetSha256).toBe(second.assetSha256);
    expect(first.drafts.map(draft => draft.draftId)).toEqual(second.drafts.map(draft => draft.draftId));
    expect(first.drafts).toHaveLength(2);
    expect(first.drafts[0]).toMatchObject({
      sourceLabel: 'problem 1',
      status: 'needs-annotation',
      position: {
        boardSize: 9,
        setup: { black: [0, 1], white: [9, 10] },
        toPlay: 'B',
      },
      hasSourceTree: false,
    });
    expect(first.drafts[1]).toMatchObject({ sourceLabel: 'problem 2', hasSourceTree: true });
    expect(first.drafts[0]!.targetCandidates.some(candidate => (
      candidate.color === 'W' && candidate.anchors.join(',') === '9,10'
    ))).toBe(true);
  });

  it('expands compressed setup points', async () => {
    const result = await importSgfCollection(
      '(;FF[4]GM[1]SZ[9]PL[B]AB[aa:ba]AW[ab:bb])',
      source,
    );
    expect(result.drafts[0]!.position.setup).toEqual({ black: [0, 1], white: [9, 10] });
  });

  it('rejects collections without problem positions', async () => {
    await expect(importSgfCollection('(;FF[4]GM[1]SZ[19])', source))
      .rejects.toHaveProperty('code', 'no-positions');
  });
});
