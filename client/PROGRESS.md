# Client implementation checklist

Requirements source: [PLAN.md](PLAN.md), roadmap §13. `[x]` means the stated work is implemented and verified; it does not close an unverified stage gate.

## Stage 0 — contract and prototype

- [x] C0.1 Split the projects, preserve plans, and create the handoff log.
- [x] C0.2 Configure React/TypeScript/Vite, the workspace, and pinned dependencies.
- [x] C0.3 Implement ProblemV1, runtime validation, SHA-256 contracts, and graph limits.
- [x] C0.4 Implement RulesAdapter with captures, suicide, pass, situational superko, and target identities.
- [ ] C0.5 Add conformance fixtures with independently derived expectations. Partial: technical fixtures and full replay of all 861 packaged candidate problems pass automatically; an expert corpus is missing.
- [ ] C0.6 Integrate Shudan with exact React aliases, crop, markers, one-tap input, zoom, and keyboard controls. Partial: aliases, crop, one-tap placement, and arrow/Enter controls are ready; pan/zoom and mobile QA remain.
- [ ] C0.7 Obtain 20 manually verified positions and test 375/390 px layouts and gestures on a real iPhone.

## Stage 1 — solving flow

- [x] C1.1 Deterministic interpreter: legality → edge → replay/hash → checkpoint.
- [x] C1.2 Alternative correct moves, defaultReply, neutral unknown, and invalid content without SRS.
- [ ] C1.3 Solution view, prepared refutation navigation, and retry that retains errors. Partial: the interpreter supports false branches and refutation navigation, and pack revision 2 now ships 299 problems with 1,835 prepared wrong branches and failure terminals, covered by an end-to-end acceptance test. Full solution view and practice retry also remain. The visible hint button was removed following product feedback.
- [x] C1.4 Restore an unfinished attempt against its pinned revision.
- [x] C1.5 Gate: replay every included path; a missing edge is never wrong. Every edge in the local Cho pack is replayed after serialization/install; missing branches stay `unclassified`. This is a structural replay gate and does not verify terminal truth or refutation coverage.

## Stage 2 — offline

- [x] C2.1 Dexie tables: packs, problems, sessions, reviews, cards, outbox, settings. Startup also makes a best-effort persistent-storage request through the Storage API.
- [x] C2.2 Manifest/shards with SHA-256, schema validation, size limits, and staged atomic install.
- [x] C2.3 Offline shell, manifest/icons, and a safe service-worker update prompt.
- [ ] C2.4 Test interrupted download/upgrade, quota, revocations, and retention of an old revision.
- [ ] C2.5 Gate: cold start after force quit in airplane mode on a real iPhone.

## Stage 3 — progress

- [x] C3.1 ts-fsrs with pinned parameters, append-only events, and one rating per attempt.
- [ ] C3.2 Daily queue: due → limited new; hinted/wrong/solution = Again. Partial: a persisted collection run shuffles once, and the Client can record correct/wrong, repeat mistakes, and reset local state. Pack revision 3 provides refutations on 641 problems, and the off-tree rule grades every other legal unlisted move as an immediate mistake, so one-attempt behavior now holds everywhere. A separate `/statistics` page shows correct/wrong/unseen/accuracy. The SRS daily policy is not connected yet.
- [ ] C3.3 Export and reproducible replay projection.
- [ ] C3.4 First authorized and verified catalog of 100–300 problems. **Partial:** a local restricted Cho candidate catalog contains 835 problems (revision 2, 299 with prepared refutations, 26 explicit-`PASS` records quarantined); it is neither an authorized public catalog nor expert verified. Human content review and independent terminal verification remain open.

## Stage 4 — server

- [ ] C4.1 Fastify public catalog and PostgreSQL migrations.
- [ ] C4.2 Accounts, secure cookie/CSRF, batch reviews, sync cursor, and projection ordering.
- [ ] C4.3 Push subscriptions, reminder worker, DST, dedup/retry, and endpoint protections.
- [ ] C4.4 Gate: duplicate delivery/multi-device behavior, 410 subscriptions, and push on a real device.

## Stage 5 — beta

- [ ] C5.1 VoiceOver, reduced motion, 200% zoom, and the complete acceptance list from §13.
- [ ] C5.2 Security/CSP, dependency and license inventory, budgets, and observability.
- [ ] C5.3 10–20 beta users, content QA, and no critical false-wrong reports.

## Work log

- 2026-09-19: installed pack revision 4 after the KataGo verification sweep: 707 problems (128 quarantined for review — book-move-doubtful or genuinely settled), 579 with refutations, and 120 problems now accept 299 KataGo-confirmed alternative solutions as correct moves (immediate success, option A), which removes the corresponding false mistakes under the off-tree rule. TypeScript, 23 files / 70 tests, and the `/goba/` build (10,278 KiB precache) pass.

- 2026-09-18 (off-tree rule): by owner decision, a legal move outside the verified tree is now graded as an immediate mistake instead of the neutral "not verified" reply: the stone is placed, the attempt ends as `failure` without a refutation demonstration, the wrong result and `Again` rating are recorded, and the problem rotates into mistakes. The retired neutral phase was removed from the engine; old checkpoints carrying it restore as `ready`, and a failed off-tree checkpoint restores its final off-graph move. The alternative-correct review queue (2,711 candidates) is now grading-critical because unadded correct alternatives are misgraded. Tests updated; 23 files / 70 tests pass.
- 2026-09-18 (later): switched the default interface language to English, replaced the practice-screen brand header (its round mark rendered squashed on a real phone) with a problem counter such as 2/835 that opens statistics, and installed pack revision 3: refutation coverage expanded to 641/835 problems and 14,941 wrong branches (plausibility radius 2, up to 12 per student node, all shipped audit statuses eligible; 51 book-move-rejected problems ship without branches pending review). Static HTML, PWA manifest, and document metadata default to English. TypeScript, 23 files / 70 tests, and the `/goba/` build (11,372 KiB precache) pass.

- 2026-09-15: implemented the workspace, contract/rules, session and refutation navigation, Shudan prototype, staged packs, offline shell, and basic FSRS event flow; see `../HANDOFF.md`.
- 2026-09-15: reduced the interface to the current color and board; changed input to one tap.
- 2026-09-15: removed synthetic demos after feedback. Added real Tsumego Hero problem 408 from `Life & Death — Elementary #3` (claimed 7k) with its full SGF correct line, three false first moves, and a false continuation. It remains a temporary local example with unclear rights, not release content.
- 2026-09-15: added a 420 ms pause before the prepared opponent reply. Removed the offline-cache-ready notification while keeping the service worker active.
- 2026-09-16: added a persisted collection run with a stable shuffled queue, one attempt, correct/wrong results, cyclic mistake review, statistics, and reset. Removed restart to preserve one attempt. Documented that 900 Cho positions exist but no authorized full-volume SGF with complete solution trees was found.
- 2026-09-17: replaced the sample with a restricted local Cho pack. Client includes 861/900 problems: 840 exact-linked and 21 reconciled. Nine shards are hash checked, validated, atomically installed in IndexedDB, and precached. All included edges/state hashes pass replay; unknown branches remain `unclassified`.
- 2026-09-17: audited all 39 exclusions. Of 38 declared printable lines, only 27 replay legally on at least one consistent candidate setup: 20 still lack a confirmed target and 7 have setup-version conflicts. Problem 804 has no line; 10 lines contain suicide; problem 216 is illegal in both versions.
- 2026-09-17: moved statistics to `/statistics`, added correct/wrong/unseen/accuracy, collection modes, and confirmed reset. Reset atomically clears collection results, active session, review events, FSRS cards, and outbox while preserving the pack, device identity, and preferences.
- 2026-09-17: deployed Client through GitHub Pages. The workflow ran typecheck, 54 tests, build, and deploy. Public routes, manifest, and all 9 shards for 861 problems returned the expected HTTP status and size.
- 2026-09-17: added Russian and English interface localization, a persisted language preference, and a direct `/settings` page. Practice, statistics, engine feedback, update prompts, document metadata, and accessibility labels switch immediately. Added an explicit settings button and a Pages entry point. Verification: TypeScript passed; 21 test files / 58 tests passed; the `/goba/` production build created practice/statistics/settings entries; local HTTP smoke for settings returned 200.
- 2026-09-17: committed the bilingual/settings release as `2faddca` and deployed it through GitHub Pages run `35251645341`. The public practice, statistics, settings, and manifest URLs all returned HTTP 200; the published bundle contains the new language preference and English interface.
- 2026-09-17: fixed horizontal board scrolling on narrow phones. `BoardAdapter` now subtracts computed horizontal padding from the container's `clientWidth` before sizing Shudan, and the board focus container clips overflow instead of creating a nested horizontal scroller. TypeScript, 21 test files / 58 tests, and the `/goba/` production build pass; real-phone confirmation remains required after deployment.
- 2026-09-17: real-phone feedback showed that the first overflow fix hid the scrollbar but clipped the board. Replaced `BoundedGoban`'s iterative DOM sizing with a deterministic integer vertex-size calculation that accounts for the cropped grid, coordinate cells, border, content width, height cap, and a rounding inset. Added four mobile/wide geometry regressions. TypeScript, 22 test files / 62 tests, and the `/goba/` production build pass; deployment and phone confirmation remain pending.
- 2026-09-18: investigated the first real content-quality report. The published 861-problem Cho pack has 2,670 explicit edges, all `correct`; it has no wrong edge, failure terminal, or prepared refutation. Therefore an unlisted legal move remains neutral and lets the learner retry indefinitely, making wrong statistics and mistake rotation unreachable for this pack. Screenshot problem `cho-elementary-0030` was admitted as `root-only-match` even though GNU Go proposed `PASS` with an empty tree and KataGo ranked A17 22nd. Documented the publication-gate failure and scope in `content/CHO_PACK_PRODUCT_AUDIT.md`; no fix was applied.
- 2026-09-18: reframed the client as a one-book application. New `client/src/book.ts` is the single source for pack pointers, titles, tagline, and the book description; `bundled-catalog.ts`, `i18n.ts`, the PWA manifest in `vite.config.ts`, and `index.html` consume it. The app is renamed from "Quiet Move" to "Cho Chikun Elementary" (with the Russian title in `BOOK.title.ru`), and the statistics page now shows the book description. The next book becomes a separate deployment: copy the client, change `BOOK`, build with its own base path. The app icon is now an owner-supplied stylized Cho Chikun portrait (`app-icon-512.png`/`app-icon-192.png`, full-bleed tan background composited locally with ImageMagick); the old gold-stone SVG icon was removed and PNG assets joined the service-worker precache.
- 2026-09-18: installed pack revision 2 built by the new refutation-expansion pipeline: 835 problems (26 explicit-`PASS` records quarantined, including problem 30), 299 problems with 1,835 prepared wrong branches, refutation replies, and failure terminals; every problem is labeled `verification.level: candidate`. Added the `candidate` level to the shared contract, an English translation for the new failure explanation, and an end-to-end acceptance test that plays an unknown probe (neutral), a prepared wrong move, receives the refutation, reaches the failure terminal, records an `Again` review and a wrong collection result, and rotates the problem into the mistakes queue. TypeScript, 23 test files / 69 tests, and both production builds pass.
