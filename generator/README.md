# Problem Generator

A separate Fastify service for importing SGF, formalizing a goal, and running constrained solver workers. Solver output is saved as a review candidate and is never published automatically.

- [Architecture](PLAN.md)
- [Progress](PROGRESS.md)
- [RZS feasibility](RZS_FEASIBILITY.md)
- [Mac solver evaluation](MAC_SOLVER_EVALUATION.md)
- [Handoff](../HANDOFF.md)

Published content follows `@goba/problem-contract`. Generator does not access Client user data.

## Run

```bash
npm run generator:start
```

The service listens on `http://127.0.0.1:4310`. Implemented endpoints:

- `POST /v1/imports/sgf` — SGF collection to drafts;
- `GET /v1/drafts` and `GET /v1/drafts/:id`;
- `PATCH /v1/drafts/:id` — confirm goal and target group with `If-Match`;
- `POST /v1/jobs` — idempotently start `tsumego.js` or GNU Go Owl with `Idempotency-Key`;
- `GET /v1/jobs/:id` — status and raw artifacts;
- `GET /health`.

The queue and drafts are in memory and disappear after restart. This is an API vertical slice, not production storage.

## Probe SGF without accepting an inferred goal

```bash
npm run probe --workspace @goba/generator -- /path/to/collection.sgf 1 4
```

The command builds hypotheses from target candidates, runs each in a separate process, and prints JSONL. `automated-hypothesis-only` requires curator review. Every hypothesis for the first Cho example exceeds the small bounded region supported by `tsumego.js`.

## GNU Go on macOS

```bash
brew install gnu-go
npm run probe:gnugo --workspace @goba/generator -- \
  /path/to/collection.sgf 8 1 4 /private/tmp/goba-gnugo-probe
```

Arguments after the file are the one-based first problem, count, maximum target hypotheses, and artifact directory. The command writes Owl SGF trees and JSONL. Results always remain `status: "unknown"` and `verification: "heuristic-candidate-only"`: GNU Go proposes candidates and branches but never proves them for publication.

## Link a printable answer key

```bash
npm run link:printable-key --workspace @goba/generator -- \
  /path/to/cho-1.sgf /path/to/go-problems.json /private/tmp/cho-answer-links.json
```

The command does not copy the corpus into the project. It hashes both restricted sources, extracts root moves/printable lines, and assigns `linkedDraftId` only after exact setup matching and successful parsing. The checked local inputs linked 845/900 records; 55 setups differ and one also has a malformed row.

## Full GNU Go book audit

```bash
npm run audit:gnugo-book --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/goba-cho-answer-links.json \
  /private/tmp/goba-cho-gnugo-audit 1 900 4
```

The audit checks every target hypothesis, every available printable line through `RulesAdapter`, and every saved Owl branch. It checkpoints every 10 problems and resumes. Additional moves stay `unclassified`; agreement never turns heuristic Owl output into proof.
