# Collection content

Client traverses a catalog independently of how it was obtained. Every problem needs a `ProblemV1` with an initial position, correct line, opponent replies, and prepared refutations. A bare position or only the first correct coordinate is insufficient.

## Local candidate pack revision 3 — 2026-09-18

`client/public/packs/cho-elementary/3/` contains a local restricted pack:

- **835/900** problems (revision 3);
- 823 exact-linked positions and 12 reconstructed positions with a legal printable line and a selected target group;
- **641 problems carry prepared wrong branches**: 14,941 wrong student edges, each with a GNU Go refutation reply (or an immediate failure) and a failure terminal (plausibility radius 2, up to 12 branches per student node, all shipped audit statuses eligible);
- **26 problems are quarantined** (`quarantined-explicit-pass`, including problem 30) because GNU Go's primary result for the selected target was `PASS`; they need human review before re-publication;
- every problem is labeled `verification.level: candidate` — heuristic GNU Go/KataGo evidence is never serialized as `solver-checked`;
- 9 JSON shards, about 10 MiB total;
- the manifest records SHA-256, byte size, and problem count for every shard;
- Client verifies the manifest, hash, size, and ProblemV1 data before atomically activating the pack in IndexedDB;
- the service worker precaches the pack JSON.

**65** problems are excluded: 26 quarantined explicit-PASS records, 21 without a selected target group, 10 with an illegal printable line, and 8 with a real version/setup difference. The full list is in `client/public/packs/cho-elementary/3/exclusions.json`.

The pack remains `LicenseRef-Restricted-Research` and must not be described as an authorized public catalog. Solution lines come from a community printable key. Missing branches remain `unclassified` in the data; since 2026-09-18 the Client grades any legal off-tree move as an immediate mistake by product decision, so unreviewed correct alternatives are misgraded until they are added as explicit correct edges.

Wrong branches come from the refutation-expansion pipeline (`generator/src/cli/expand-cho-refutations.ts`): plausible mistakes near the target group and solution line are screened with `owl_does_defend`/`owl_does_attack`, refuted with `owl_attack`/`owl_defend` after the forced wrong move, and admitted only when the follow-up verification query confirms no recovery. KataGo policy at the audited state ranks plausibility. This is candidate-grade heuristic evidence, not proof; the 2026-09-18 audit gates for independent terminal verification and expert review remain open. See [CHO_PACK_PRODUCT_AUDIT.md](CHO_PACK_PRODUCT_AUDIT.md).

Reproduction commands (research artifacts preserved in `~/Documents/goba-research-artifacts/`):

```bash
npm run expand:cho-refutations --workspace @goba/generator -- \
  ~/Documents/goba-research-artifacts/cho-1.sgf \
  ~/Documents/goba-research-artifacts/goba-cho-gnugo-audit/audit-report.json \
  ~/Documents/goba-research-artifacts/goba-cho-katago-crosscheck/results.jsonl \
  ~/Documents/goba-research-artifacts/goba-cho-refutations

npm run build:cho-client-pack --workspace @goba/generator -- \
  ~/Documents/goba-research-artifacts/cho-1.sgf \
  ~/Documents/goba-research-artifacts/goba-cho-gnugo-audit/audit-report.json \
  ~/Documents/goba-research-artifacts/goba-cho-reconciliation/corrected-positions.sgf \
  ~/Documents/goba-research-artifacts/goba-cho-reconciliation/gnugo-audit/audit-report.json \
  ~/Documents/goba-research-artifacts/goba-cho-reconciliation/reconciliation-report.json \
  "$(pwd)/client/public/packs/cho-elementary/3" \
  ~/Documents/goba-research-artifacts/goba-cho-refutations/refutations-report.json
```

## Cho Chikun sources found

- Complete positions without solutions: [`cho-1.sgf`](https://github.com/akitaonrails/frank_go/blob/main/data/tsumego/collections/cho-1.sgf) has 900 elementary problems; adjacent files contain `cho-2.sgf` (861) and `cho-3.sgf` (792).
- [`data/SOURCES.md`](https://github.com/akitaonrails/frank_go/blob/main/data/SOURCES.md) describes provenance and restrictions. The files intentionally omit solutions; no permission to distribute solutions to this modern work is stated.
- [`travisgk/tsumego-pdf`](https://github.com/travisgk/tsumego-pdf) contains all 900 elementary positions and a printable answer key with correct first points. It does not contain interactive SGF trees with replies and false variations.
- Tsumego Hero publishes interactive trees one problem at a time, such as [problem 408](https://tsumego.com/1860), and attributes solutions to its community. No single authorized, republishable file for the full volume was found.
- The old `cho2sgf` tool converts data from the official Kiseido disk to SGF, but requires the original disk/data.

## Supported future import

1. One SGF collection or a directory of `.sgf` files.
2. Each problem root includes `SZ`, `AB`, `AW`, `PL`, problem number, and source.
3. Variations include the main correct line and replies to plausible wrong moves.
4. Successful leaves have an explicit marker (`TE`, `C[+]`, or an agreed source property); wrong branches have an explicit negative marker or verified ending.
5. Import never infers the result from the first variation. Ambiguous problems go to manual review.

If a full SGF is found, preserve the source separately with its URL and attribution. Generator must convert it to `ProblemV1`, replay every edge through `RulesAdapter`, and report invalid or incomplete branches.
