# Tsumego: Problem Generator pipeline

**Design document 02 · version 1.1 · 17 September 2026**

Status: architecture and acceptance criteria. See [PROGRESS.md](PROGRESS.md) and [../HANDOFF.md](../HANDOFF.md). The paired runtime is [Client](../client/PLAN.md).

## 1. Decision

Build Generator as an independently deployed Fastify API plus isolated workers. It imports SGF or images, requires explicit goal/target confirmation, runs bounded solvers, normalizes candidate trees, independently replays every edge, and publishes only immutable ProblemV1 packs that pass all gates.

No solver result is self-publishing. Separate three concepts:

- search status: `proven-win | proven-loss | unknown | unsupported | error`;
- board outcome: `target-captured | unconditional-life | seki | ko-dependent | unknown`;
- verification: `solver-checked | expert-reviewed` and a future `certificate-verified`.

Current lanes:

| Input/lane | Choice | Trust boundary |
|---|---|---|
| SGF | `@sabaki/sgf` plus shared rules | Preserve source; never infer a result from variation order |
| Screenshot/diagram | Small OpenCV recognizer plus mandatory board confirmation | Recognition confidence never proves the position |
| Small bounded region | `tsumego.js` subprocess | Proof candidate only within its supported profile |
| General Mac research | GNU Go 3.8 Owl | Heuristic candidate and partial branches only |
| Ranking | KataGo Analysis API | Policy/PV signal, never life-and-death proof |
| Intended proof lane | RZS on pinned Linux/CUDA worker | Blocked until reproducible build/runtime and license gates pass |

## 2. Corrections to earlier assumptions

- No maintained universal exact tsumego solver with a simple macOS package was found.
- KataGo optimizes game outcome and does not become a target-group proof engine through `allowMoves`.
- GNU Go Owl is useful but heuristic and node-limit dependent.
- RZS ships an old `linux/amd64` CUDA path; Apple Silicon Docker emulation does not supply NVIDIA devices.
- Proof trees and teaching trees are different artifacts. Raw diagnostic branches cannot go directly to Client.
- Image recognition and solver agreement do not replace exact-board confirmation, rights review, or curator approval.
- Missing branches are unknown, never wrong.

## 3. Solver evidence and promise limits

Repository activity, license, source, and automation paths were checked through primary sources. Relevant options:

| Solver | Role | Limitation |
|---|---|---|
| `tsumego.js` | deterministic small-region worker with tree output | only small connected empty regions; many real Cho positions are unsupported |
| GNU Go Owl | native Mac CPU candidate lane with GTP and SGF variations | heuristic; can add false alternatives and omit source continuations |
| KataGo | fast Metal ranking and independent policy/PV comparison | not target-group proof |
| RZS/rzone | research proof-oriented lane | old amd64 CUDA stack, GPL, reproducibility blocker |
| Cameron solver | interactive exploration | no suitable headless solution-tree export and restricted board representation |

Timeout is `unknown`, never loss. Unsupported goal/boundary is `unsupported`, never a weakened replacement problem. `UCT_WIN` or any engine status must be mapped with explicit side/goal fixtures; never treat a raw enum as a universal boolean.

## 4. Architecture

```text
Admin UI/API
  ├─ SGF importer and image-recognition queue
  ├─ explicit goal/target annotation
  ├─ idempotent jobs and leases
  ├─ isolated solver adapters
  ├─ raw artifact store
  ├─ normalizer + independent replay/terminal verifier
  ├─ curator review
  └─ immutable pack publisher
```

| Component | Ownership |
|---|---|
| Admin API/UI | TypeScript/Fastify; editor, queue, approvals, publication |
| SGF/rules/normalization | TypeScript; shared `RulesAdapter` and ProblemV1 |
| Recognition worker | Python/OpenCV subprocess or queue; no public endpoint |
| Small solver | isolated Node process running `tsumego.js` |
| GNU Go worker | GTP/Owl subprocess with bounded resources |
| RZS worker | pinned Linux x86_64 image/source/model; separate GPL compliance |
| KataGo worker | streaming JSONL Analysis API; optional shared GPU queue |
| Job store | PostgreSQL drafts, jobs, attempts, events, leases |
| Blob store | raw inputs, logs, trees, reports, and final packs |

Workers receive immutable canonical input and produce immutable artifacts. API processes never load untrusted solver libraries in-process. Generator has no access to Client user progress.

## 5. Ingestion

### 5.1 SGF

- Parse collections while preserving the untouched source bytes, URL, attribution, and SHA-256.
- Read `SZ`, `AB`, `AW`, `PL`, history, rules, comments, and problem number.
- Split roots deterministically into drafts.
- Generate target-group candidates but do not select one automatically for publication.
- Treat comments and custom properties as untrusted text.
- Do not assume the first variation is correct.
- Reject malformed setup/history before solving.

### 5.2 Images

Chosen pipeline: orientation/crop → board-line detection → intersection sampling → black/white/empty classification → numbered/markup overlay detection → confidence map → editable board → mandatory exact-board confirmation.

Keep source pixels, transform, per-point confidence, and every edit. Train/evaluate on separate scan, screenshot, and camera-photo strata. Report exact-board accuracy in addition to per-intersection accuracy; a single stone error invalidates proof.

Moku or other weights with unclear rights cannot be a mandatory input path. The fallback is owned OpenCV code plus manual correction.

## 6. Goal and target metadata

A canonical task explicitly records:

- `capture | live` goal;
- solver perspective and first player;
- stable target-group color and anchor(s);
- ko/seki policy;
- outside-boundary treatment and any proven history;
- rule profile;
- source/rights/provenance;
- setup and semantic hash.

Goal confirmation is an optimistic-concurrency edit. The API never guesses the task from `PL`, filename, book section, or solver output.

For life goals, unconditional life, seki, and ko-dependent survival remain distinct. For capture goals, target identity must survive group merges until explicit capture. A crop or mask changes the effective task and therefore its hash.

## 7. Solver adapters

Every adapter accepts canonical task JSON plus a pinned configuration ID and returns status, outcome, verification level, resource usage, log/tree artifact references, and hashes of binary/config/model/input.

Required isolation:

- hard wall timeout;
- process-tree cancellation;
- memory/heap bound where supported;
- stdout/stderr and artifact-size caps;
- no network in solver workers;
- dedicated temporary directory;
- exact binary/config/model hashes;
- structured distinction between timeout, unsupported, crash, and proven result.

### 7.1 `tsumego.js`

Admit only compatible capture/live tasks with a confirmed target and connected local empty region ≤15 points. Serialize canonical SGF, run in a Node subprocess, and retain raw output. Open positions remain unsupported.

### 7.2 GNU Go Owl

Use `owl_attack`, `owl_defend`, `owl_does_attack`, `owl_does_defend`, and `--decide-owl`. Export raw SGF trees and replay them independently. Always label positive output `unknown/heuristic-candidate-only` until another verifier and curator accept it.

### 7.3 RZS

Pin source, image digest, model/config, and compiler/runtime. Prove side/goal status mapping with golden fixtures. Preserve masks as part of the effective-position hash. Do not enable the lane until the Linux/CUDA runtime is reproducible and distribution obligations are documented.

### 7.4 KataGo

Use only for local policy/PV, move ordering, disagreement triage, and cost control. Even a locally restricted move list does not prove life, capture, seki, or ko semantics.

## 8. From proof candidates to teaching trees

Proof search aims to establish a result. A teaching tree needs understandable branches, default replies, bounded size, and explicit terminals.

Expansion algorithm:

1. Verify the intended solution and target semantics.
2. Enumerate legal root moves from source keys and candidate engines.
3. Prove or review every move before assigning `correct` or `wrong`.
4. Preserve unclassified legal moves.
5. For wrong moves, select a short valid refutation, not merely the engine's first diagnostic branch.
6. Expand alternate correct moves until equivalent terminals or explicit coverage limits.
7. Replay every edge under the shared rule profile and compare state hashes.
8. Stop only at an explicit terminal predicate.
9. Prune transpositions/long noise without changing verdicts.
10. Measure coverage and send gaps to review.

Raw leaves without terminal semantics are content errors. Illegal diagnostic branches are excluded and reported. Extra solver moves never become wrong by omission from a book key.

## 9. Data contracts

### CanonicalTask

Contains schema version, task ID/revision, board/setup/history, side to play, rule profile, goal/target, boundary policy, source/rights, and semantic hash.

### SolverResult

Contains adapter/config identity, input hash, search status, board outcome, verification, root moves/tree artifact, log artifact, timing/resources, warnings, and error details.

### ProblemV1

Published data follows the shared Client contract: explicit node states/hashes, classified edges, default replies, terminals, verification/source/difficulty metadata, and strict graph/size limits.

### Identity and reproducibility

A job key combines canonical task hash, adapter/config/model/binary versions, and expansion policy. `Idempotency-Key` may repeat only the exact same payload. Artifacts are content-addressed. Retrying after a crash creates a new attempt under the same logical job.

## 10. API and lifecycle

Implemented vertical slice:

| Endpoint | Contract |
|---|---|
| `POST /v1/imports/sgf` | Import collection and return deterministic drafts |
| `GET /v1/drafts[/:id]` | Read drafts and candidates |
| `PATCH /v1/drafts/:id` | Confirm goal/target with numeric `If-Match` |
| `POST /v1/jobs` | Start exact draft revision with `Idempotency-Key` and adapter |
| `GET /v1/jobs/:id` | Status and raw artifacts |
| `GET /health` | Process health |

Planned endpoints cover image imports, edit events, cancellation, review decisions, publication, pack manifests, and revocation.

Lifecycle: imported → needs-annotation → ready-for-solve → queued → running → candidate/unknown/unsupported/error → normalized → review → approved → published/revoked. State transitions are append-only events. Production jobs use PostgreSQL leases with heartbeat, bounded retries, cancellation, and orphan recovery.

## 11. Publication gates

| Gate | Check | Failure behavior |
|---|---|---|
| G0 Rights | permission/license for input, solutions, models, and code path | Private draft; distribution blocked |
| G1 Position | exact board, orientation, edges, targets, history | Annotation queue |
| G2 Semantics | goal/ko/seki/boundary supported by solver profile | Unsupported; never silently weaken |
| G3 Proof | allowlisted final status/config and complete hashed artifacts | Unknown/error with diagnostics |
| G4 Replay | every move legal; captures, identities, hashes match | Reject candidate |
| G5 Coverage | correct alternatives and wrong refutations; no implicit leaf success | Re-expand/downgrade; unknown stays neutral |
| G6 Teaching | clear terminals/default replies and Client size limits | Curator edits or prunes |
| G7 Publication | schema compatibility, attribution, immutable hashes | Do not move active catalog pointer |

Expert review cannot be replaced by agreement among engines that share source data or assumptions. Publication records reviewer, timestamp, exact artifacts, and rights decision.

## 12. Operations and budgets

Suggested starting capacity:

| Lane | Start | Qualification |
|---|---|---|
| API/parse/normalization | 2–4 vCPU, 4–8 GiB | Scale from queue measurements |
| OpenCV/`tsumego.js` | one CPU core/process, 1–2 GiB hard limit | small cancellable jobs |
| GNU Go | native CPU workers | candidates only |
| RZS | Linux x86_64, 8–16 CPU cores, 16–32 GiB, compatible NVIDIA GPU | recommendation, not measured minimum |
| KataGo | CPU for rare jobs or queued shared GPU | cap VRAM competition |

Every job records queue time, run time, peak memory when measurable, expanded nodes, artifacts, status, retries, and cost estimate. Default budgets are lane/config specific. Timeout or quota exhaustion retains diagnostics and returns unknown; it never retries forever or publishes a loss.

Observability tracks status/error rates, queue age, lease recovery, artifact sizes, proof/replay disagreement, coverage gaps, review throughput, and publication/revocation events. Logs redact uploaded content and secrets.

## 13. Content provenance

Prefer public-domain, permissively licensed, or explicitly commissioned tasks. Store author/source/URL, license or permission evidence, transformation history, and source hash. Book ownership or online availability does not grant republication rights. Community solutions and original problem diagrams may have different rights.

New material may be created from owned positions, commissioned curation, self-play candidates, or transformations only after a human confirms originality and teaching value. Similarity checks are advisory, not legal clearance.

## 14. Main risks

- incorrect solver perspective/status mapping;
- a crop or mask proving a different problem;
- recognition proving the wrong board;
- heuristic agreement mistaken for proof;
- shared bugs in multiple engine versions;
- illegal or nonterminal raw branches;
- incomplete correct coverage causing false wrong grades;
- unlicensed book/model content;
- expensive jobs or stuck leases.

Controls are golden fixtures, effective-position hashes, exact-board confirmation, independent replay and terminal checks, neutral unknown branches, rights gates, pinned artifacts, budgets, leases, and curator approval.

## 15. Roadmap

| Stage | Scope | Exit gate |
|---|---|---|
| 0 | Pin repos/licenses, RZS feasibility, rule mapping, 20 fixtures | Reproducible worker or recorded blocker; lane decision does not block Client |
| 1 | SGF import, metadata/editor, common schema, replay | 20 problems round-trip to Client without disagreement |
| 2 | CPU/RZS adapters, leases, artifacts, gold corpus | zero known wrong labels; unsupported/timeout preserved |
| 3 | Branch expansion, alternatives, 3–8 plausible wrong branches and refutations | measured coverage; missing edges never wrong |
| 4 | Image/OpenCV recognition, correction, provenance | curator confirms exact board; image strata reported separately |
| 5 | Immutable publication/revocation, cost controls, 100–300 curated tasks | idempotent publish; offline Client accepts pack |

The implementation benchmark must report by corpus and goal: solved/proven/unknown/unsupported/error, replay validity, source agreement, alternate coverage, runtime percentiles, memory, nodes, and artifact size. Never publish a single blended accuracy number.

## 16. Final constraint

Generator is a controlled content-production pipeline, not an oracle. **Only explicit, replayed, semantically verified branches may affect Client grading. Everything else remains unknown or stays in review.**
