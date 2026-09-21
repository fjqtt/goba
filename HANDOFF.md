# Handoff

Last updated: 2026-09-18, Europe/Lisbon.

## Current state

The repository contains two independent projects and a shared contract:

- `client/`: React/TypeScript/Vite offline-first PWA.
- `generator/`: Fastify API plus isolated solver/research tooling.
- `packages/problem-contract/`: ProblemV1, rules, hashes, and replay validation.

Public repository: `https://github.com/fjqtt/goba`. `main` tracks `origin/main`; first pushed commit: `7a4df9d`.

Current GitHub Pages deployment:

- `https://fjqtt.github.io/goba/practice/today`
- `https://fjqtt.github.io/goba/statistics`
- `https://fjqtt.github.io/goba/settings`

Russian/English localization and `/settings` were committed as `2faddca` and deployed successfully by GitHub Actions run `35251645341`.

The mobile board-sizing correction was committed as `de4ed1c` and deployed successfully by GitHub Actions run `35253968588`. Real-phone feedback after that deployment said the layout looked acceptable.

The bundled Cho pack is public because this is a requested test deployment, but its status remains `LicenseRef-Restricted-Research`. Do not describe it as rights-cleared or expert verified.

## High-priority content incident — 2026-09-18

The first real practice test exposed that the current Cho pack does not implement the intended one-attempt learning experience.

- Across all 861 published problems, all 2,670 explicit edges are `correct`.
- The pack has zero wrong edges, zero failure terminals, and zero prepared refutations.
- Every node defaults a missing move to `unclassified`.
- The Client therefore correctly shows “This move has not been verified. Try another one.” and leaves the board unchanged. A learner can probe until finding a listed solution; no wrong result or mistake-review item can be created from this pack.
- Screenshot problem `cho-elementary-0030` is also a likely invalid or already-settled exercise. GNU Go's selected candidate proposed `PASS`, exported an empty tree, and matched zero source plies. A17 was admitted only through a positive `owl_does_defend` query. KataGo ranked A17 22nd at the root.
- The pack builder accepted this because its publication gate requires only a selected target, a legal printable line, and expected roots. It generates a success terminal from the goal type and hard-codes `solver-checked`; it does not verify the terminal or require refutations.

The complete evidence, counts, scope, and required gates are in `client/content/CHO_PACK_PRODUCT_AUDIT.md`.

**Remediation shipped later the same day (pack revision 2, not yet committed or deployed):**

- New `expand:cho-refutations` pipeline generated prepared wrong branches for the clean `full-line-match` subset: 302/305 problems expanded, 1,847 verified wrong branches, 528 alternative-correct candidates recorded for review, 110 candidates skipped by safety checks.
- Pack revision 2 at `client/public/packs/cho-elementary/2/`: 835 problems, 299 with refutations (1,835 wrong edges and failure terminals). Revision 1 was removed.
- The 26 explicit-`PASS` records, including problem 30, are quarantined (`quarantined-explicit-pass` in `exclusions.json`).
- Every problem now carries the honest `verification.level: candidate` (new contract enum value) instead of `solver-checked`.
- An end-to-end acceptance test covers: unknown probe stays neutral → prepared wrong move → refutation reply → failure terminal → `Again` rating → wrong collection result → mistake rotation.
- Remaining open gates: independent terminal verification, coverage for partial/root-only records, blocking review queue, human content review.

## One-book application model — 2026-09-18

The client is now a single-book application named after its book. `client/src/book.ts` holds the book configuration (pack id/revision/count/manifest path, localized title, short title, tagline, description); the catalog loader, i18n brand strings, document title/description, PWA manifest, and the statistics-page book description all derive from it. Launching another book means copying the client with a different `BOOK` value and deploying under its own base path; IndexedDB storage is already keyed by pack and collection ids, so multiple book apps on one origin do not collide. App name: "Cho Chikun Elementary" (Russian title in `BOOK.title.ru`; previously "Quiet Move").

## Earlier completed application work

### Russian/English interface

Implemented a small typed localization layer without a new dependency:

- `client/src/i18n.ts` contains Russian/English UI text and interpolation.
- Practice, statistics, settings, engine feedback, update prompts, document title/description, and accessibility labels switch immediately.
- Saved Russian engine/checkpoint messages are translated at render time, so changing language does not invalidate an unfinished attempt.
- Unknown source explanations fall back to their original text.
- Default language is English (changed 2026-09-18 after the coverage-expansion feedback); Russian remains selectable and persisted.

### Settings page and persistence

- Added direct route `/settings`.
- Added an explicit gear button in the top bar and Back navigation from settings.
- Added a two-option Russian/English segmented control.
- The preference uses the existing Dexie `settings` table under `interface-language`.
- Progress reset preserves the language, pack, and device identity.
- `document.documentElement.lang`, title, and description update with the selection.
- Vite emits direct HTML entries for practice, statistics, and settings, including under `VITE_BASE_PATH=/goba/`.

Changed/new modules:

- `client/src/App.tsx`
- `client/src/i18n.ts`
- `client/src/i18n.test.ts`
- `client/src/components/SettingsPage.tsx`
- `client/src/components/StatsPage.tsx`
- `client/src/components/BoardAdapter.tsx`
- `client/src/components/UpdateNotice.tsx`
- `client/src/storage/preferences.ts`
- `client/src/storage/preferences.test.ts`
- `client/src/styles.css`
- `client/index.html`
- `client/vite.config.ts`

Latest mobile-width fix:

- `client/src/components/BoardAdapter.tsx`
- `client/src/styles.css`
- `client/src/components/board-sizing.ts`
- `client/src/components/BoardAdapter.test.ts`

All repository Markdown documentation was rewritten in English. Architecture, gates, audit figures, commands, links, rights restrictions, and current checkpoint were preserved. `rg` reports no Cyrillic text in Markdown.

## Client behavior already present

- One-tap stone placement, 420 ms opponent delay, minimal side-to-play UI.
- Deterministic ProblemV1 interpreter with legality first, explicit replies, state-hash replay, and checkpoint restore.
- Off-tree product rule (owner decision, 2026-09-18): a legal move outside the verified tree is graded as an immediate mistake — the stone is placed, the attempt ends as `failure`, and the problem enters mistake rotation. There is no prepared refutation for such moves. This supersedes the earlier neutral-unknown behavior; the risk of grading an unverified-but-correct alternative as wrong is accepted (2,711 alternative-correct candidates remain in the review queue). Illegal moves still only prompt, and pre-rule checkpoints with the retired neutral phase restore as `ready`.
- Persisted shuffled collection run with one graded attempt when content reaches an explicit terminal; pack revision 3 makes wrong terminals reachable on 641 refuted problems.
- The practice top bar shows a problem counter (for example 2/835) that opens statistics; the brand title and its round mark were removed from the practice screen after real-phone feedback that the mark rendered squashed.
- Result handling supports correct/wrong, continuing to new problems, and rotating mistakes until corrected.
- Separate `/statistics` page with total/correct/wrong/unseen/accuracy and confirmed reset.
- Reset atomically clears collection results, active session, review events, FSRS cards, and outbox while preserving installed packs, device identity, and preferences.
- Best-effort `navigator.storage.persist()`.
- Service worker, safe update prompt, offline shell, staged/hash-checked pack install.

## Cho Client pack

Location: `client/public/packs/cho-elementary/5/` (revision 5; revisions 1-4 removed).

- 747/900 problems included (742 exact, 5 reconciled).
- 603 problems carry prepared wrong branches: 14,117 wrong edges with refutation replies (or immediate failure) and failure terminals (coverage v3: plausibility radius 2, up to 12 branches per student node, all shipped audit statuses).
- 181 problems carry KataGo-confirmed alternative solutions as correct edges to an immediate success terminal (owner decision, option A: no continuation line is prepared).
- Quarantine after the 2026-09-21 framed deep review: 88 problems (`quarantined-katago-review`; 44 of the original 128 were re-admitted at 800 framed visits, 4 book-move-rejected problems were added) plus the 26 explicit-`PASS` problems (all confirmed genuinely settled or unverifiable by the framed pass test).
- 8 shards, about 10 MiB.
- Every problem is labeled `verification.level: candidate`.
- 9 JSON shards, about 2.9 MiB.
- Manifest records SHA-256, expanded size, and count.
- Pack installer verifies manifest, size, hash, schema, and ProblemV1 before atomic activation.
- Integration tests install all shards, replay every edge/state hash, and run the wrong-move acceptance flow.
- Service worker precaches the shards.

Excluded: 65 problems in `exclusions.json`.

- 26 quarantined explicit-`PASS` selected candidates (including problem 30).
- 21 lack a selected target group.
- 10 have illegal printable lines.
- 8 have genuine setup-version differences.

Separate exclusion audit:

- 38/39 have a declared printable line; problem 804 does not.
- 27 lines replay legally on at least one consistent setup.
- 20 of those still need target confirmation.
- 7 need setup and target selection.
- 10 contain suicide.
- Problem 216 is illegal in both source versions.

Do not add any exclusion to the graded pack until setup, target, line, and terminal semantics are verified.

Rebuild commands (all research inputs are preserved in `~/Documents/goba-research-artifacts/`; the old `/private/tmp` copies are no longer required):

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
  "$(pwd)/client/public/packs/cho-elementary/5" \
  ~/Documents/goba-research-artifacts/goba-cho-refutations/refutations-report.json \
  ~/Documents/goba-research-artifacts/goba-cho-deep-review/katago-adjustments-v2.json
```

KataGo verification rerun (prepare queries, analyze at pinned BLACK perspective, report):

```bash
npm run verify:cho-katago --workspace @goba/generator -- prepare \
  "$(pwd)/client/public/packs/cho-elementary/5" \
  ~/Documents/goba-research-artifacts/goba-cho-refutations/refutations-report.json \
  ~/Documents/goba-research-artifacts/goba-cho-katago-verify 32

KATAGO_EXTRA_OVERRIDES=reportAnalysisWinratesAs=BLACK KATAGO_TIMEOUT_MINUTES=180 \
KATAGO_ANALYSIS_THREADS=24 npm run run:katago-analysis --workspace @goba/generator -- \
  ~/Documents/goba-research-artifacts/goba-cho-katago-verify/queries.jsonl \
  ~/Documents/goba-research-artifacts/goba-cho-katago-verify/results.jsonl \
  ~/Documents/goba-research-artifacts/goba-cho-katago-verify/katago.log

npm run verify:cho-katago --workspace @goba/generator -- report \
  ~/Documents/goba-research-artifacts/goba-cho-katago-verify
```

Note: `npm --workspace` resolves relative paths against `generator/`, so pass the output directory as an absolute path.

## Generator research state

- Imported 900 Cho drafts from `/private/tmp/cho-1.sgf`; source SHA-256 `2667ddc1f73d9256820a598427ae212be78874c33932c5baf99d97793d8df432`.
- `tsumego.js` is limited to small closed regions and returns `unsupported` for the first Cho example.
- GNU Go 3.8 Owl is the native Mac CPU candidate lane, always `unknown/heuristic-candidate-only`.
- On 37 labeled Cho fixtures, GNU Go matched the primary move in 27 and accepted the author move in 33.
- The printable key exact-linked 845/900 setups.
- Full GNU Go audit saved 3,327 trees. Full source path: 374/723; strict legal selected-tree set: 305.
- Setup reconciliation: 46 numbered overlays, one deterministic malformed-row repair, and eight real differences (4, 8, 40, 93, 216, 420, 533, 617).
- KataGo Metal checked 2,642/2,642 states with 0 errors at 32 visits. It is a ranking signal, not proof.
- RZS remains blocked on a reproducible Linux/amd64 CUDA worker. Apple Silicon Docker emulates amd64 but supplies no NVIDIA device.
- Review queue: 254 KataGo disagreement/invalid states.
- Refutation expansion (2026-09-18): 302/305 clean full-line problems expanded with 1,847 GNU Go-verified wrong branches ranked by KataGo policy; 3 `book-move-rejected` (problems 318, 417, 541) and 528 alternative-correct candidates await review. Report: `~/Documents/goba-research-artifacts/goba-cho-refutations/refutations-report.json`.
- KataGo pack verification (2026-09-19, `verify:cho-katago`): 20,274 after-states at 32 visits with `reportAnalysisWinratesAs=BLACK` and ownership of the target chain (winrate is uninformative at komi 0 on a mostly empty board), plus 1,115 escalations (280 flagged states at 300 visits, 835 pass-root probes at 128 visits — the student passes and the goal must NOT survive, which is the correct already-settled test; root ownership with the student to move reflects the solved outcome and must not be used). Results: 99.5% of wrong branches confirmed; 53 false wrongs converted to correct edges; 114 book-doubtful and 14 truly-settled problems quarantined (`quarantined-katago-review`); 742/2,711 alternatives confirmed (299 shipped, 496 fell with quarantined problems), 1,625 rejected, 344 unclear remain in review. Reports: `~/Documents/goba-research-artifacts/goba-cho-katago-verify/`.
- Modern-solver research (2026-09-19): see `generator/SOLVER_RESEARCH_2026-09.md` — study-LD-RZ (RZS-PT, Feb 2026) is the proof-lane candidate pending a license answer from the RLG lab.
- KataGo lane upgraded (2026-09-21): Homebrew KataGo 1.18.2 with the bundled kata1-b18c384nbt transformer net on Metal; runner defaults now use the version-agnostic `/opt/homebrew/opt/katago` paths. New `deep-review:cho` CLI implements the tsumego frame: the board outside the problem box is filled with two unconditionally alive walls (grid eyes; components without two eyes stay empty) and komi neutralizes the frame balance. Framed winrate still saturates (the surrounding wall usually outweighs the corner group even on failure), so target ownership remains the gating signal; the frame removes global tenuki noise. Framed root benchmark: the new net matches an expected book root as its top search move in 94/100 clean problems at 128 visits.
- Deep review (2026-09-21, 727 framed queries at 800/500/128 visits): 44/121 katago-quarantined problems re-admitted, 7 confirmed settled, 70 keep-quarantined for human review; all 26 explicit-PASS problems stay excluded (16 confirmed settled by the pass probe); 4 of 27 in-pack book-move-rejected problems newly quarantined; 155/297 unclear alternatives confirmed (now shipped), 124 rejected, 18 remain unclear. Reports: `~/Documents/goba-research-artifacts/goba-cho-deep-review/`.
- Generator queues/drafts remain in memory; no PostgreSQL leases, editor, terminal verifier, or publication pipeline exists.

Key research documents:

- `generator/CHO_BOOK_AUDIT.md`
- `generator/CHO_RECONCILIATION.md`
- `generator/KATAGO_CROSSCHECK.md`
- `generator/MAC_SOLVER_EVALUATION.md`
- `generator/RZS_FEASIBILITY.md`

## Verification performed

High-effort code review of the refutation branch (2026-09-18) surfaced ten findings; the following were fixed the same day: report-checkpoint temp-file race between workers, missing GTP column bound, unguarded selected-target lookup, ko-conditional Owl codes (2/3) no longer publishable as unconditional wrong branches (pipeline version 2; incompatible or error-status prior results are discarded on resume), refutations report now embeds and the pack builder verifies `auditReportSha256`, a malformed refutation record downgrades one problem instead of aborting the build, stdin EPIPE handling in the shared GNU Go module, screening timeout scales with command count, problem viewports include wrong-branch stones with margin, and the pack installer deletes superseded revisions of the same pack inside the activation transaction. The re-run under version-2 semantics produced identical content (no ko-conditional evidence existed); only viewport margins changed in the rebuilt pack.

Refutation/pack-revision-2 block (2026-09-18):

- `npm run check` — passed.
- `npm test -- --run` — passed: **23 files / 69 tests**, including the new refutation-expansion unit tests, the wrong-branch pack-builder test, the quarantine/candidate-label pack scan, and the end-to-end wrong-move acceptance flow on installed pack content.
- Full `expand:cho-refutations` run: 305 eligible, 302 expanded, 0 errors, 38 s wall time.
- Pack rebuild output: 835 problems, 299 with refutations, 1,835 wrong edges, 1,835 failure terminals, 26 quarantined, 9 shards.
- `npm run build --workspace @goba/client` and the `/goba/` base-path build — passed; PWA precache 3,384 KiB with the revision-2 shards.
- Direct pack scan confirmed: no `solver-checked` label remains, problems 0018/0030 absent, first/last IDs 0001/0900.

Previous localization/settings block:

- `npm run check` — passed.
- `npm test -- --run` — passed: **21 files / 58 tests**.
- `npm run build --workspace @goba/client` — passed.
- `VITE_BASE_PATH=/goba/ npm run build --workspace @goba/client` — passed.
- Pages-style build emitted:
  - `client/dist/practice/today/index.html`
  - `client/dist/statistics/index.html`
  - `client/dist/settings/index.html`
- PWA precache: 20 entries / 2364.32 KiB in the `/goba/` build.
- Local production preview: `http://127.0.0.1:4185/goba/settings/`, exec session `56116`.
- Local HTTP smoke for settings returned **200**, 773 bytes.
- `git diff --check` passed after code and documentation changes.
- `rg -n '\p{Cyrillic}' --glob '*.md' --glob '!node_modules/**'` returned no output after translation.
- GitHub Actions run `35251645341` passed typecheck, 58 tests, build, artifact upload, and Pages deploy.
- Public HTTPS smoke returned 200 for practice, statistics, settings, and the web manifest.
- The published bundle is `assets/index-DnapFNC2.js` and contains `interface-language`, `Quiet Move`, `Main navigation`, and `Settings`.
- After the board-width fix: `npm run check` passed; `npm test -- --run` passed with 21 files / 58 tests; `VITE_BASE_PATH=/goba/ npm run build --workspace @goba/client` passed with 20 precache entries / 2364.41 KiB.
- After the clipping report and direct-sizing correction: `npm run check` passed; `npm test -- --run` passed with 22 files / 62 tests. The sizing regression covers 286 px and 341 px mobile content widths plus wider/full-board cases, and asserts both width and height bounds. The `/goba/` production build passed with 20 precache entries / 2363.51 KiB.
- For the 2026-09-18 content incident, direct scans of all nine checked-in shards confirmed 861 problems, 3,531 nodes, 2,670 `correct` edges, zero `wrong` edges, 1,064 success terminals, zero failure terminals, and `listed-only`/`unclassified` coverage on every node. The exact and reconciled GNU Go reports and the KataGo cross-check report were re-read for problem 30 and the pack-wide risk counts. `git diff --check` passed, every local Markdown link resolved, and the Markdown Cyrillic scan returned no output. No application code changed, so the test suite was not rerun for this documentation-only checkpoint.

Previous deployment:

- GitHub Actions run `35248977772` passed build and deploy.
- Production returned 200 for root, practice, statistics, manifest, and service worker.
- All 9 public shards returned 200 with manifest-matching byte sizes and 861 total problems.
- Rebuilt Cho pack matched the checked-in pack byte for byte.

Visual QA was not completed: the in-app browser provider is unavailable in this environment. Automated tests do not replace real iPhone checks.

## Known limitations

- The static web-app manifest still uses the Russian fallback install name/description. The selected in-app locale applies after launch.
- Arbitrary future content explanations are shown verbatim unless added to the translation mapping.
- Shudan pan/zoom and real mobile gesture QA remain incomplete.
- No expert-verified, rights-cleared release catalog exists.
- Refutation coverage is broad but still heuristic: 641/835 problems carry wrong branches (radius-2 plausibility, up to 12 per node). Under the off-tree rule every unlisted legal move is graded wrong without a demonstration, so an unverified-but-correct alternative move is misgraded until it is reviewed and added as a correct edge. Refutations are GNU Go candidate evidence ranked by KataGo policy, without independent terminal verification or expert review.
- Local progress can still be evicted by the browser. Export and server sync are not implemented.
- Node on the work machine is 23.6.0 while the project declares 22.12 or ≥24; builds pass with an engine warning.
- `@sabaki/shudan@1.8.0` has an existing unmet peer declaration for Preact; Vite aliases it to React and builds pass.

## Next concrete steps

1. Commit and deploy pack revision 2 after owner approval (refutations, quarantine, honest labels, e2e test are ready locally).
2. Extend refutation expansion to the partial-line and root-only records once their lines/targets are reviewed; today only the 305 clean full-line problems are covered.
3. Build the independent terminal verifier (Benson's unconditional life plus literal-capture checks on leaf boards) so success/failure terminals stop being derived from the goal type.
4. Review the recorded review queues: 3 `book-move-rejected` problems (318, 417, 541), 528 alternative-correct candidates, 110 skipped wrong candidates, 254 KataGo disagreement states, and the 26 quarantined explicit-`PASS` problems.
5. Review the 2,711 alternative-correct candidates: under the off-tree rule each unadded correct alternative is a false wrong, so this queue is now grading-critical.
6. Continue real-iPhone checks for language persistence, direct routes, restore, offline reopen, reset, header fit, tap targets, and VoiceOver; also verify the new failure flow (refutation reply, failure message, mistake rotation) on a real phone.
7. Deduplicate the GNU Go process/coordinate helpers: `generator/src/solver/gnugo-gtp.ts` is the canonical module for the refutation CLI, but `gnugo-adapter.ts` and `audit-gnugo-book.ts` still carry near-identical private copies (including the unguarded `child.stdin.end` EPIPE pattern fixed only in the shared module).

## Git rule

Do not commit or push without the user's prior permission. Before committing, show the exact proposed message and wait.
