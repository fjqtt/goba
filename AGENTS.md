# Working on Go practice

## Before starting

1. Read `HANDOFF.md`, then `client/PROGRESS.md` or `generator/PROGRESS.md`.
2. Architecture and acceptance criteria are in `client/PLAN.md` and `generator/PLAN.md`.
3. Continue the first unfinished item. Do not mark a stage complete until its gate passes.

## Handoff is mandatory

- Update the checklist after every completed logical block, not only at the end of a session.
- Record the current step, changed modules, verification commands and their actual results, blockers, and the next concrete step in `HANDOFF.md`.
- `[x]` means implemented and verified as stated; `[ ]` means incomplete. Describe partial implementation explicitly.
- Automated tests do not replace checks on a real iPhone, content rights clearance, or expert review.
- Do not describe test positions as an expert-verified public catalog.

## Git

- Never commit or push without the user's prior permission.
- Show the proposed commit message and wait for approval before committing.
- Do not include issue or ticket IDs in commit messages; include them only in PR titles.

## TeamCity

When investigating TeamCity, check both MCP data (logs/runtime) and `.teamcity/**/*.kt` (the source of truth for configuration).

## Boundaries

- Client: React + TypeScript + Vite, Shudan behind an adapter, Dexie, and ts-fsrs.
- Generator is a separate project; shared contracts and rules live in `packages/problem-contract`.
- A missing branch is `unclassified`, never `wrong`. A leaf without a terminal is a content error.
- Do not add the Generator or AI to the Client's runtime solving path.
