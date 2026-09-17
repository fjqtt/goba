# Tsumego on iPhone: Client / PWA

**Design document 01 · version 1.1 · 17 September 2026**

Status: implementation architecture and acceptance criteria. The implementation checklist is [PROGRESS.md](PROGRESS.md); the exact continuation point is [../HANDOFF.md](../HANDOFF.md). The paired service is described in [Generator](../generator/PLAN.md).

## 1. Decision

Use **React + TypeScript + Vite**, Shudan 1.8.0 behind a local adapter, and a simple CSS theme without raster textures. Keep move validation and learning-tree traversal in a small owned module. Shudan renders the board and reports input. Shared rules and replay behavior live in `packages/problem-contract`. SGF parsing belongs to Generator and is not part of the normal Client path.

OGS Goban remains a reasonable future choice for a game editor, online play, or large variation analysis. For the current product, externally controlled Shudan state is smaller and easier to theme.

| Area | Choice | Reason |
|---|---|---|
| Board | Shudan with React aliases and owned CSS | Direct sign maps, markers, crop, and pointer events |
| Rules | Shared `RulesAdapter` | Identical captures, suicide, repetition, and target tracking in Generator and Client |
| Solving | Deterministic ProblemV1 interpreter | No AI or network request per move |
| Storage | IndexedDB through Dexie; Cache Storage for shell | Transactional progress and separate app updates |
| Review | Pinned `ts-fsrs` version and parameters | Reproducible scheduling from events |
| Future backend | Fastify, PostgreSQL, Web Push worker | Catalog, optional sync, reminders |
| Content delivery | Immutable JSON packs through a CDN | Content updates independently from the PWA |
| First release | 100–300 distribution-cleared problems | Branch quality matters more than catalog size |

Commercial use must remain possible. Code, model, and problem-content rights are tracked independently.

## 2. MVP goals and boundaries

A user installs the app on the Home Screen, downloads a collection, solves a short session offline, and reviews mistakes. The goal, side to play, and target group must be known before solving, even when the minimal UI does not display instructional hints.

MVP includes precomputed trees, multiple correct moves, prepared refutations, offline packs, unfinished-attempt restore, SRS, PWA install, opt-in Web Push, progress export, and optional account sync. Local practice works without an account.

After MVP: full ko/seki coverage, user editor, social features, online play, and generation initiated from the client. Pan/zoom is still an MVP requirement. Acceptance devices are a real 375 CSS px iPhone SE-class device and a regular 390 px iPhone on iOS 17+ and current stable iOS. Browser emulation does not replace device checks.

## 3. Renderer research summary

Repository activity and licensing were checked on 2026-09-15 through primary repository/API sources.

| Option | Result |
|---|---|
| Shudan | MIT, actively maintained, direct controlled maps, crop and markers; chosen |
| OGS Goban | Apache-2.0, capable Canvas/SVG engine and puzzle modes; larger owned state and APIs |
| BesoGo | MIT code with separately licensed assets; older architecture |
| WGo.js | mature but old code path |
| jGoBoard 5.x | CC-BY-NC-4.0 blocks the intended commercial option |
| Kaya | AGPL application, not a drop-in renderer |

Measured production bundles on the research machine:

| Build | JS raw/gzip | Assets | Total transfer |
|---|---:|---:|---:|
| React baseline | 182.1 / 56.9 KiB | 0 | 56.9 KiB |
| Shudan with bundled theme assets | 194.0 / 61.2 KiB | 194.8 KiB | 256.0 KiB |
| Shudan with owned CSS theme | 194.0 / 61.2 KiB | 0 | 61.2 KiB |
| OGS Canvas npm entry | 573.0 / 153.6 KiB | 0 | 153.6 KiB |

These are comparative measurements, not final product budgets. Shudan is implemented with Preact, so the adapter is the only place that normalizes its published types while Vite aliases Preact runtime imports to React.

## 4. Service architecture

```text
immutable pack CDN ──> Client PWA ──> IndexedDB / Cache Storage
                           │
                           └── optional Client API ──> PostgreSQL / Web Push

source SGF or image ──> Generator API/workers ──> reviewed immutable pack
```

Client and Generator deploy independently. Client never calls a solver during a move. Shared packages contain only schemas, rules, hashes, and replay fixtures.

Main PWA modules:

- `BoardAdapter`: Shudan boundary, crop, markers, input, keyboard access.
- `PuzzleSession`: deterministic graph traversal and checkpointing.
- `RulesAdapter`: legal moves, captures, suicide, pass, situational superko, target identity.
- `PackInstaller`: manifest/shard verification and atomic activation.
- `CollectionProgress`: one-attempt queue, results, mistake mode, and reset.
- `ReviewEvents`: append-only SRS events and projections.
- `i18n` and preferences: Russian/English UI and persisted language.
- Pages: practice, statistics, and settings.

## 5. ProblemV1 contract

Every problem is immutable within `(problemId, revision)` and contains:

- schema, identity, learning version, and semantic hash;
- board size, setup stones, side to play, history, and rules profile;
- explicit goal and stable target-group anchors;
- viewport;
- graph nodes with `toPlay`, `stateHash`, edges, optional `defaultReply`, and explicit terminal;
- verification provenance, source rights, difficulty, and tags.

Every edge has a move, next node, `correct | wrong | unclassified` verdict, and role. Missing edges are unknown. A leaf without terminal data is invalid content.

Required semantics:

1. Validate legality before edge classification.
2. A legal missing edge or an `unclassified` edge is neutral and does not change SRS.
3. `wrong` is allowed only with a prepared refutation or verified terminal path.
4. Multiple correct moves are first-class.
5. Opponent moves use explicit `defaultReply`; never select the first array element implicitly.
6. Replay each edge and compare the resulting state hash.
7. Target groups use persistent identities/anchors; coordinates alone are insufficient after merges or captures.
8. Rule profile and repetition history are part of identity.
9. A semantic content change increments revision; a learning-meaning change increments `learningVersion`.

Pack manifests contain immutable shard URLs, byte sizes, expanded sizes, SHA-256, problem counts, minimum client version, attribution, publication time, and revocations. Installation validates all of them before changing the active pointer.

## 6. Solving flow

1. Load a ready local revision and restore a matching checkpoint when present.
2. Render the verified node state.
3. On tap, apply rules first.
4. If illegal, explain it without grading.
5. If no classified edge exists, show a neutral unverified message and keep the attempt open.
6. For a correct or wrong edge, append the student step, briefly show it, wait 420 ms, then play explicit opponent replies.
7. Stop only at an explicit terminal. Persist one result and one review event per attempt.
8. A wrong terminal may replay the prepared refutation backward and forward.
9. Move to the next stable shuffled problem. Mistake mode rotates current wrong results until solved.

The current collection policy gives one graded attempt. Unknown moves are not attempts. A full solution view and non-graded retry remain unfinished.

## 7. iPhone UX and localization

The primary screen contains only the side to play and the board. Stone placement is one tap. The board must remain at least about 28 CSS px per point in common compact crops. Pointer cancellation never places a stone. The opponent delay blocks input but shows the student's move immediately.

Keyboard control uses a roving point selected by arrow keys and Enter/Space. VoiceOver, 200% zoom, reduced motion, and real touch gestures remain explicit acceptance gates.

The interface supports Russian and English. Language changes immediately on practice, statistics, settings, engine feedback, update notices, document metadata, and accessibility labels. The preference is stored in IndexedDB and survives progress reset. The static install manifest has one fallback locale; the in-app selection remains authoritative after launch.

Offer install and notification prompts only after the first useful session. iPhone installation guidance must follow current Safari behavior rather than a fixed old screenshot.

## 8. Offline storage and updates

| Store | Content | Policy |
|---|---|---|
| `packs` | manifest and staged/ready state | Only ready revisions are visible |
| `problems` | immutable ProblemV1 records | Indexed by pack/tags/difficulty |
| `sessions` | active attempt and checkpoint | Save after confirmed changes |
| `reviewEvents` | one append-only event per attempt | Progress source of truth |
| `cards` | FSRS projection | Rebuildable from events |
| `outbox` | sync payload and retry state | Written atomically with reviews |
| `settings` | collection run, language, device, future reminders | Progress reset preserves identity/preferences |
| Cache Storage | versioned shell, icons, pack assets | No private API responses |

Pack install sequence: inspect capacity → fetch manifest → download shards outside a DB transaction → verify size/hash/schema/graph → atomically activate. Interrupted work leaves the old ready revision. Retain a revision used by an active session.

A waiting service worker updates only at a safe checkpoint. Unknown schema majors do not load. IDB upgrades handle blocked/versionchange and rebuild projections when needed.

`navigator.storage.persist()` is best effort. WebKit may still evict data under pressure, so export and optional sync are required before promising durable progress. Synchronization runs on foreground, after review, and after connectivity returns; the app does not rely on background sync.

Budgets: initial shell target ≤200 KiB gzip JS+CSS; a 100-problem pack target ≤5 MiB expanded; per problem ≤10,000 nodes, ≤40,000 edges, ≤200 plies, and ≤2 MiB expanded.

## 9. Progress and SRS

Use pinned `ts-fsrs`, initial retention 0.90, and disabled random fuzz. Ratings:

| Outcome | Rating |
|---|---|
| Wrong or solution viewed | Again |
| Solved with a hint | Again |
| Independent with effort | Hard by explicit choice |
| Independent | Good by default |
| Independent and easy | Easy by explicit choice |
| Unknown, content error, interruption | No SRS change |

Daily order is due reviews, a limited number of new problems, then optional extra practice. Speed alone never implies mastery.

A `ReviewEvent` records IDs, revision/learning version, device sequence, occurrence time/timezone, rating, first-try flag, hints, solution view, path, and scheduler version. Server-side uniqueness on `eventId` and `attemptId` makes at-least-once delivery have an exactly-once effect. Multi-device ordering uses normalized time then device/sequence/event IDs; late events trigger projection replay.

## 10. Push and future Client API

Push uses standard Web Push with VAPID from a Client-service worker. The secret key stays on the server. iOS subscription requires a Home Screen web app and direct user action. Denial is respected.

Schedules store IANA timezone, local time, weekdays, quiet hours, next send time, and a schedule version. DST gaps use the next valid local time; repeated times use the first occurrence. Deduplication key: `(subscriptionId, localDate, scheduleVersion)`. 404/410 remove subscriptions; 429/5xx use bounded jittered retries.

Planned endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /v1/catalog` | Published metadata, ETag, revocations |
| `GET /v1/packs/{id}/{revision}/manifest` | Immutable manifest |
| `POST /v1/reviews:batch` | Idempotent event delivery and canonical cards |
| `GET /v1/sync?cursor=...` | Cursor-based events/settings/projections |
| `PUT/DELETE /v1/devices/{id}/push-subscription` | Owned push subscription |
| `PUT /v1/reminder` | Optimistically versioned schedule |
| `POST /v1/problem-reports` | Problem/revision/node/move/path report |
| `GET /v1/me/export` | Portable progress/settings JSON |
| `DELETE /v1/me` | Account, events, and subscriptions deletion |

Catalog is public. Mutations use secure HttpOnly SameSite cookies plus CSRF protection. Push endpoints are capability URLs and must be redacted, allowlisted, and protected from SSRF.

## 11. Reliability and security

Treat SGF comments and explanations as untrusted plain text or a tightly sanitized format. Never inject source content through `innerHTML`. Pin dependencies, enforce CSP/TLS/size limits, and keep user scripts off the content CDN.

Track offline launch success, pack failures, missing-edge rate, state-hash mismatches, review deduplication, outbox age, subscription churn, and provider acceptance. A broken graph disables that revision and excludes the attempt from SRS.

Key risks: incomplete correct coverage, small touch targets, IDB eviction, updates during sessions, rule-model divergence, renderer maintenance, best-effort push, and content rights. Mitigations are neutral unknown moves, crop/zoom/device QA, export/sync, pinned revisions, shared conformance fixtures, an adapter boundary, honest reminder UX, and an independent publication-rights gate.

## 12. Roadmap and gates

| Stage | Scope | Exit gate |
|---|---|---|
| 0 | Contracts, renderer adapter, 20 manual fixtures, iPhone prototype | Goal/coordinates agree and gestures work on a real iPhone |
| 1 | Interpreter, captures, alternatives, refutations, checkpoint | 100% of published paths replay; unknown is never wrong |
| 2 | IDB, packs, offline shell, versioning | Cold airplane-mode launch after force quit; interrupted download keeps old pack |
| 3 | SRS, export, daily queue, first catalog | One event per attempt; event replay reproduces cards |
| 4 | Public API, optional account sync, push | Duplicate delivery, DST, 410, and real-device push verified |
| 5 | Accessibility, content QA, beta | 100–300 cleared problems, 10–20 users, no critical false-wrong reports |

Before beta verify real Safari/Home Screen mode, 375/390 px, offline/network flap, low storage, SW/IDB upgrade during a session, alternate correct moves, invalid/pass/capture/repetition fixtures, multi-device order, VoiceOver, denied/revoked push, and DST.

## 13. Final constraint

Shudan is the current renderer choice, with OGS kept as a credible expansion path. The architecture depends on one product rule: **grade only moves for which Generator supplied a verified result, and preserve uncertainty everywhere else.**
