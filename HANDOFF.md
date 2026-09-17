# Handoff

Last updated: 2026-09-17, Europe/Lisbon.

## Current state

The repository contains two independent projects and a shared contract:

- `client/`: React/TypeScript/Vite offline-first PWA.
- `generator/`: Fastify API plus isolated solver/research tooling.
- `packages/problem-contract/`: ProblemV1, rules, hashes, and replay validation.

Public repository: `https://github.com/fjqtt/goba`. `main` tracks `origin/main`; first pushed commit: `7a4df9d`.

Current GitHub Pages deployment:

- `https://fjqtt.github.io/goba/practice/today`
- `https://fjqtt.github.io/goba/statistics`

The current uncommitted work adds `/settings` and Russian/English localization. It is built and tested locally but is **not deployed** until a new commit and push are explicitly approved.

The bundled Cho pack is public because this is a requested test deployment, but its status remains `LicenseRef-Restricted-Research`. Do not describe it as rights-cleared or expert verified.

## Active work completed in this checkpoint

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

All repository Markdown documentation was rewritten in English. Architecture, gates, audit figures, commands, links, rights restrictions, and current checkpoint were preserved. `rg` reports no Cyrillic text in Markdown.

## Client behavior already present

- One-tap stone placement, 420 ms opponent delay, minimal side-to-play UI.
- Deterministic ProblemV1 interpreter with legality first, explicit replies, state-hash replay, and checkpoint restore.
- A missing/unclassified branch is neutral and never recorded as wrong.
- Persisted shuffled collection run with one graded attempt.
- Results: correct/wrong, continue new problems, rotate mistakes until corrected.
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

Previous deployment:

- GitHub Actions run `35248977772` passed build and deploy.
- Production returned 200 for root, practice, statistics, manifest, and service worker.
- All 9 public shards returned 200 with manifest-matching byte sizes and 861 total problems.
- Rebuilt Cho pack matched the checked-in pack byte for byte.

Visual QA was not completed: the in-app browser provider is unavailable in this environment. Automated tests do not replace real iPhone checks.

## Known limitations

- The deployed GitHub Pages build does not yet contain settings/localization.
- The static web-app manifest still uses the Russian fallback install name/description. The selected in-app locale applies after launch.
- Arbitrary future content explanations are shown verbatim unless added to the translation mapping.
- Shudan pan/zoom and real mobile gesture QA remain incomplete.
- No expert-verified, rights-cleared release catalog exists.
- Missing refutation branches mean many legal alternative moves stay `unclassified`; they must not end an attempt as wrong.
- Local progress can still be evicted by the browser. Export and server sync are not implemented.
- Node on the work machine is 23.6.0 while the project declares 22.12 or ≥24; builds pass with an engine warning.
- `@sabaki/shudan@1.8.0` has an existing unmet peer declaration for Preact; Vite aliases it to React and builds pass.

## Next concrete steps

1. Review the current diff and obtain explicit approval for the proposed commit message before committing.
2. After separate push approval, push `main`, wait for the Pages workflow, and smoke-test the three public routes.
3. On a real iPhone: open the Pages URL, add to Home Screen, verify Russian/English switching persists after force quit, test direct settings/statistics routes, unfinished-attempt restore, offline reopen, and reset.
4. Confirm header fit and tap targets at 375/390 px plus VoiceOver labels.
5. Resume content work with the 27 legal excluded candidates and the 254-state KataGo review queue. Keep all uncertain branches neutral.

## Git rule

Do not commit or push without the user's prior permission. Before committing, show the exact proposed message and wait. The current suggested message is:

`Add bilingual settings and translate project documentation`
