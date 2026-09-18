# Collection content

Client traverses a catalog independently of how it was obtained. Every problem needs a `ProblemV1` with an initial position, correct line, opponent replies, and prepared refutations. A bare position or only the first correct coordinate is insufficient.

## Local candidate pack — 2026-09-17

`client/public/packs/cho-elementary/1/` contains a local restricted pack:

- **861/900** problems;
- 840 exact-linked positions;
- 21 reconstructed positions with a legal printable line and a selected target group;
- 9 JSON shards, about 1.9 MiB total;
- the manifest records SHA-256, byte size, and problem count for every shard;
- Client verifies the manifest, hash, size, and ProblemV1 data before atomically activating the pack in IndexedDB;
- the service worker precaches the pack JSON.

**39** problems are excluded: 21 without a selected target group, 10 with an illegal printable line, and 8 with a real version/setup difference. The full list is in `client/public/packs/cho-elementary/1/exclusions.json`.

The pack remains `LicenseRef-Restricted-Research` and must not be described as an authorized public catalog. Solution lines come from a community printable key. Missing branches remain `unclassified` and never become `wrong` automatically.

**Product warning:** the current 861-problem pack has no explicit wrong edges, failure terminals, or prepared refutations. It cannot produce a wrong result and is not suitable for graded one-attempt practice. Problem 30 also exposed a publication-gate failure in which a heuristic candidate was labeled `solver-checked` without terminal proof. See [CHO_PACK_PRODUCT_AUDIT.md](CHO_PACK_PRODUCT_AUDIT.md) for the incident analysis, counts, and required gates. No remediation has been applied yet.

Reproduction command:

```bash
npm run build:cho-client-pack --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf \
  /private/tmp/goba-cho-gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/corrected-positions.sgf \
  /private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/reconciliation-report.json \
  client/public/packs/cho-elementary/1
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
