# Generator implementation checklist

Requirements source: [PLAN.md](PLAN.md), roadmap §16.

- [x] G0.0 Create the separate project directory and preserve its plan and Client relationship.
- [ ] G0.1 Pin repositories, inventory licenses, test rzone feasibility and rule mapping, and prepare 20 known fixtures. **Partial:** dependencies and rzone source/image digests are pinned; GPL and the build blocker are in `RZS_FEASIBILITY.md`. OrbStack emulates amd64 but has no NVIDIA/CUDA runtime. GNU Go is the Mac CPU candidate lane and KataGo Metal is the ranking lane. GNU Go matched the author first move in 27/37 Cho fixtures and accepted it in 33/37. Still needed: 20 accepted cross-engine fixtures and a Linux/amd64 CUDA worker for RZS.
- [ ] G1.1 SGF import, draft metadata, editor, common schema, and replay. **Partial:** collections import to deterministic drafts with setup/PL/viewport/provenance/target candidates. Goal confirmation uses optimistic revision. The restricted printable key links only on exact setup. The 55 mismatches are classified as 46 flattened numbered overlays, 1 repaired malformed row, and 8 real setup differences. Editor, persistence, and proof-tree normalization to ProblemV1 are missing.
- [ ] G2.1 CPU/RZS adapters, job leases, artifacts, and gold corpus. **Partial:** `tsumego.js` has hard timeout/memory/output limits. GNU Go Owl has wall/output/tree limits, binary/config/input hashes, alternative checks, raw SGF export, and API dispatch. Its output remains `unknown/heuristic-candidate-only`. The queue is in memory without leases; RZS proof and an independent terminal verifier are absent.
- [ ] G3.1 Branch expansion, alternatives, wrong branches/refutations, and measured coverage. **Partial:** all 845 exact-linked Cho positions completed the GNU Go batch audit. It saved 3,327 trees; the full source line exists for 374/723 records, but only 305 selected trees are fully legal. Every available solver branch was replayed during research and extra/missing moves remain `unclassified`. However, the Client pack builder serializes only printable success lines: all 2,670 published edges are `correct`, with zero wrong edges, failure terminals, or refutations. KataGo checked 2,642 states at every available key move with 0 API errors. A terminal verifier, normalized solver trees, refutation expansion, and measured wrong-move coverage are still missing.
- [ ] G4.1 OpenCV ingestion, correction UI, and provenance.
- [ ] G5.1 Immutable publication/revocation, cost controls, and 100–300 curated problems.

## Latest checkpoint — 2026-09-17 Europe/Lisbon

- Imported all of `/private/tmp/cho-1.sgf`: **900 drafts**, SHA-256 `2667ddc1f73d9256820a598427ae212be78874c33932c5baf99d97793d8df432`, no source trees, all Black to play.
- Every target hypothesis for problem 1 exceeds the `tsumego.js` bounded empty-region limit (347–350 points versus ≤15), so it correctly returns `unsupported`. No synthetic boundary may be added silently.
- The documented `tsumego.js` fixture works and emits a partial tree.
- Rzone source is pinned at `325e0ecd...`; its official `linux/amd64` image `sha256:1d1b6bab...` is 2.21 GiB compressed and uses Caffe2/CUDA. Apple Silicon Docker can emulate amd64 but exposes no NVIDIA runtime/device. A real CPU port requires an inference backend, not just removing `USE_CAFFE2`.
- Of 50 upstream `chao_vol1` records, only 3 match the current 900 positions under all symmetries.
- Native GNU Go 3.8 probe for Cho problem 8 proposed the known `A18`, exported 10 attack and 8 defense variations, and also proposed unverified `H19`.
- The restricted printable-key linker matched 845/900 exact setups. Fifty-five differ; problem 201 also has a malformed row. Linking by problem number alone is forbidden.
- Full GNU Go audit processed 845/845 in 83.35 s. Full source paths: 374/723; 69 have illegal neighboring branches, leaving 305 strict clean candidates. Partial continuation: 73; root-only/incomplete roots: 392; clean full alternative-root coverage: 1; no matching target: 5.
- Saved 3,327 raw SGF trees (123 MiB), with no export failure. At least one candidate tree is illegal for 189 problems due to `wrong-turn` or `superko`; 459 problems have additional unclassified root candidates.
- Audit report: `/private/tmp/goba-cho-gnugo-audit/audit-report.json`, SHA-256 `c283aed19995101909d3122e293be00dab308e8aff00931735398aad3439ac2d`; summary: `CHO_BOOK_AUDIT.md`.
- Reconciliation classified 46 numbered overlays, repaired problem 201, and retained true setup differences for 4, 8, 40, 93, 216, 420, 533, and 617.
- GNU Go on 47 recovered base candidates: 1 full line, 1 partial, 19 root only, 16 no target, and 10 illegal source lines.
- KataGo 1.16.2 Metal completed 2,642/2,642 AGA states at 32 visits with 0 errors in 603 s: 2,393 exact-linked, 197 reconciled, and 26 each for key/SGF variants of the eight true differences.
- Exact-linked key moves are top-5 local policy in 2,366/2,393 states. GNU Go continues 1,540 prefixes and contains the next key move in 1,366. In 174 direct disagreements, KataGo policy favors the key 126 times and GNU Go 48.
- Setup triage: SGF is stronger for 40/420; key is legal/stronger for 533/617; both lines fail for 216; 4/8/93 are inconclusive. This remains a ranking signal, not proof.
- KataGo review queue has 254 rows: 133 generator-diverges/key-higher, 49 generator-higher, 58 key-outside-top-5, and 14 illegal source-line states.
- At that checkpoint, `npm run check`, 16 test files / 50 tests, and both production builds passed. A later Client-only localization change brings the repository total to 21 files / 58 passing tests.

## Content incident checkpoint — 2026-09-18 Europe/Lisbon

- Real-use testing confirmed that unlisted legal moves can be retried indefinitely. This is expected Client behavior for `unclassified` data, but it violates the intended one-attempt product flow because the published Cho pack has no explicit wrong paths.
- `cho-client-pack.ts` builds only the printable success line, marks every generated edge `correct`, and derives a success terminal directly from `goalKind`; it does not import GNU Go refutations or verify the terminal predicate.
- The publication gate accepts any selected target with a legal printable line and a nonempty expected-root list, including `root-only-match` candidates. It also hard-codes `solver-checked` metadata.
- Published problem 30 demonstrates the failure: the selected GNU Go candidate's primary move is `PASS`, its tree has zero nodes and zero matched source plies, and A17 was accepted only through `owl_does_defend`. KataGo ranks A17 22nd at the root. This evidence cannot establish that the move is necessary or the terminal is true.
- The published pack contains 411 root-only records, 26 selected candidates with explicit GNU Go `PASS`, 32 empty selected trees, and 246 selected trees with zero matched source plies. These are review signals, not automatic proof that each position is wrong.
- Full analysis and required publication gates: `../client/content/CHO_PACK_PRODUCT_AUDIT.md`. No generator or pack fix was applied in this checkpoint.
