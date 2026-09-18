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

The complete evidence, counts, scope, and required gates are in `client/content/CHO_PACK_PRODUCT_AUDIT.md`. Treat the current pack as an ungraded candidate-line viewer, not a reliable graded catalog. No code, generated content, or deployment was changed during this investigation.

## Earlier completed application work

### Russian/English interface

Implemented a small typed localization layer without a new dependency:

- `client/src/i18n.ts` contains Russian/English UI text and interpolation.
- Practice, statistics, settings, engine feedback, update prompts, document title/description, and accessibility labels switch immediately.
- Saved Russian engine/checkpoint messages are translated at render time, so changing language does not invalidate an unfinished attempt.
- Unknown source explanations fall back to their original text.
- Default language is Russian.

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
- A missing/unclassified branch is neutral and never recorded as wrong.
- Persisted shuffled collection run with one graded attempt when content reaches an explicit terminal; the current Cho pack cannot reach a wrong terminal.
- Result handling supports correct/wrong, continuing to new problems, and rotating mistakes until corrected; only the correct path is reachable in the current Cho pack.
- Separate `/statistics` page with total/correct/wrong/unseen/accuracy and confirmed reset.
- Reset atomically clears collection results, active session, review events, FSRS cards, and outbox while preserving installed packs, device identity, and preferences.
- Best-effort `navigator.storage.persist()`.
- Service worker, safe update prompt, offline shell, staged/hash-checked pack install.

## Cho Client pack

Location: `client/public/packs/cho-elementary/1/`.

- 861/900 problems included.
- 840 exact-linked setups.
- 21 reconciled setups with a legal printable line and selected GNU Go target.
- 9 JSON shards, about 1.9 MiB.
- Manifest records SHA-256, expanded size, and count.
- Pack installer verifies manifest, size, hash, schema, and ProblemV1 before atomic activation.
- Integration tests install all shards and replay every edge/state hash.
- Service worker precaches the shards.

Excluded: 39 problems in `exclusions.json`.

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

Rebuild command:

```bash
npm run build:cho-client-pack --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf \
  /private/tmp/goba-cho-gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/corrected-positions.sgf \
  /private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json \
  /private/tmp/goba-cho-reconciliation/reconciliation-report.json \
  client/public/packs/cho-elementary/1
```

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
- Generator queues/drafts remain in memory; no PostgreSQL leases, editor, terminal verifier, or publication pipeline exists.

Key research documents:

- `generator/CHO_BOOK_AUDIT.md`
- `generator/CHO_RECONCILIATION.md`
- `generator/KATAGO_CROSSCHECK.md`
- `generator/MAC_SOLVER_EVALUATION.md`
- `generator/RZS_FEASIBILITY.md`

## Verification performed

Current localization/settings block:

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
- The current Cho pack has no refutation branches at all. Every unlisted legal move stays `unclassified`, making a wrong result unreachable for this pack. This is a release-blocking mismatch with one-attempt practice, not a rare edge case.
- Local progress can still be evicted by the browser. Export and server sync are not implemented.
- Node on the work machine is 23.6.0 while the project declares 22.12 or ≥24; builds pass with an engine warning.
- `@sabaki/shudan@1.8.0` has an existing unmet peer declaration for Preact; Vite aliases it to React and builds pass.

## Next concrete steps

1. Wait for product direction before applying a fix; this checkpoint was explicitly analysis-only.
2. Decide whether to disable grading for the current candidate pack or quarantine it from practice while content is rebuilt.
3. Add publication gates for wrong/refutation coverage, independent terminal verification, `PASS`/already-settled detection, solver-review blockers, and evidence-accurate verification labels.
4. Quarantine and manually review problem 30 plus the other explicit-`PASS`, empty-tree, and root-only records before graded publication.
5. Build at least one end-to-end acceptance case that reaches a prepared refutation, failure terminal, stored wrong result, and mistake rotation.
6. Continue real-iPhone checks for language persistence, direct routes, restore, offline reopen, reset, header fit, tap targets, and VoiceOver.

## Git rule

Do not commit or push without the user's prior permission. Before committing, show the exact proposed message and wait.
