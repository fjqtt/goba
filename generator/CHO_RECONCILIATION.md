# Cho elementary: reconciliation of 55 setup mismatches

Checked on 2026-09-16. Every input and derived artifact is `restricted`.

## Why the setups differ

In `tsumego-pdf`, numbered symbols encode both solution moves and the stone color after the line is played. `give_resulting_board` places those moves and returns the resulting diagram. Reading that diagram as an initial setup therefore adds solution stones to the problem.

Exact stone comparison, rather than problem-number heuristics, showed:

- **46** SGF setups exactly match the printable diagram after numbered stones are included in the displayed position;
- removing numbered moves produces a separate base-position candidate;
- problem **201** has an 18-column row; the unique repair that preserves the left-edge marker inserts an empty point immediately after it;
- **8** problems still do not match and are real edition/transcription differences.

The upstream playout removes captures but allows suicide. Independent replay found `suicide` in printable lines for **57, 103, 108, 200, 249, 282, 537, 640, 690, 746**. They cannot be accepted automatically.

## Eight real setup differences

Coordinates list stones found only in one version.

| No. | B only in key | B only in SGF | W only in key | W only in SGF |
|---:|---|---|---|---|
| 4 | — | — | C15 | — |
| 8 | — | — | — | H17 |
| 40 | — | A18 A17 B17 | — | B19 B18 |
| 93 | — | — | F18 | — |
| 216 | — | — | — | C19 |
| 420 | — | — | — | B19 |
| 533 | B16 | — | C19 D19 A15 B15 C15 | B19 E19 D18 A16 B16 |
| 617 | — | — | — | A16 |

A solution must not be transferred between these editions by problem number alone. Both versions were sent to KataGo; see `KATAGO_CROSSCHECK.md`.

KataGo triage:

- **40, 420:** the printable line ranks substantially better on the SGF setup;
- **533, 617:** the SGF setup occupies a printable-line move; the key setup remains legal and is the better candidate;
- **216:** both lines are illegal (`suicide` in the key, `occupied` in SGF) and remain rejected;
- **4, 8, 93:** both setups give root rank 1 and are inconclusive.

This is ranking triage, not acceptance. KataGo did not prove the target group.

## GNU Go on 47 base-position candidates

| Class | Problems |
|---|---:|
| Full printable line | 1 |
| Partial line | 1 |
| Root only | 19 |
| No target group accepted the root | 16 |
| Printable line illegal under `ld-v1` | 10 |

Mechanical removal explains the data structure but does not repair defects in the community key.

## Reproduce

```bash
npm run reconcile:printable-key --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/cho-go-problems.json \
  /private/tmp/goba-cho-reconciliation

npm run audit:gnugo-book --workspace @goba/generator -- \
  /private/tmp/goba-cho-reconciliation/corrected-positions.sgf \
  /private/tmp/goba-cho-reconciliation/corrected-links.json \
  /private/tmp/goba-cho-reconciliation/gnugo-audit 1 900 4
```

Artifacts:

- `/private/tmp/goba-cho-reconciliation/reconciliation-report.json`
- `/private/tmp/goba-cho-reconciliation/corrected-positions.sgf`
- `/private/tmp/goba-cho-reconciliation/corrected-links.json`
- `/private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json`
- `/private/tmp/goba-cho-reconciliation/gnugo-audit/audit-summary.csv`
