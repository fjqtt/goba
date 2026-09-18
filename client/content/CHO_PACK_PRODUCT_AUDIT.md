# Cho pack product audit

Date: 2026-09-18  
Status: confirmed content/publication incident; partial remediation shipped as pack revision 2 on 2026-09-18

**Remediation update (2026-09-18, pack revision 2).** The refutation-expansion pipeline added prepared wrong branches to 299 of the 305 clean full-line problems (1,835 wrong edges with refutation replies and failure terminals), the 26 explicit-`PASS` records including problem 30 were quarantined out of the pack, and every `verification.level` was downgraded from `solver-checked` to the new honest `candidate` value. Gates still open: measured coverage policy (gate 2 is partial — plausible-mistake coverage is heuristic), independent terminal verification (gate 3), root validation beyond `PASS` quarantine (gate 4), a blocking review queue (gate 5), human content review (gate 7). Gate 8's end-to-end acceptance now exists as an automated test in `client/src/catalog/cho-pack.test.ts`. The analysis below describes the pack as shipped in revision 1 and remains the reference for the remaining gates.

## Executive finding

The current 861-problem Cho pack cannot support the product's promised one-attempt practice mode.

The pack contains a single declared successful line, or several successful first moves, for each problem. It contains no declared wrong move, no failure terminal, and no prepared refutation. Consequently, the Client cannot grade any unlisted legal move as wrong. It correctly treats that move as `unclassified`, leaves the position unchanged, and displays “This move has not been verified. Try another one.” A learner can therefore probe legal points until a listed answer is found.

The screenshot reported by the tester is `cho-elementary-0030`. It also exposes a separate publication-gate defect: the problem was admitted even though the selected GNU Go result proposed `PASS`, its exported tree did not contain the expected root move, and KataGo ranked the published move very poorly. The `solver-checked` label overstates what was verified.

Until these issues are resolved, the published Cho pack must be treated as an ungraded candidate-line viewer. Its results must not be presented as reliable correct/wrong practice statistics.

## Incident 1: wrong answers are unreachable

An exhaustive scan of the checked-in pack found:

| Item | Count |
| --- | ---: |
| Problems | 861 |
| Nodes | 3,531 |
| Explicit edges | 2,670 |
| `correct` edges | 2,670 |
| `wrong` edges | 0 |
| Solution-role edges | 1,853 |
| Opponent-role edges | 817 |
| Success terminals | 1,064 |
| Failure terminals | 0 |
| Nodes with `listed-only` / default `unclassified` coverage | 3,531 |

This is a content limitation, rather than an accidental translation of a wrong edge by the Client. `client/src/engine/puzzle-session.ts` intentionally handles a missing edge as neutral: it returns the `unknown` phase without applying the move or grading the attempt. This preserves the contract rule that missing data can never mean “wrong.”

The user-visible consequences are severe:

- the advertised one-attempt rule is not enforced for an unlisted move;
- a learner receives no opponent refutation and no final error result;
- the `wrong` statistics path is unreachable for this pack;
- “repeat mistakes” cannot receive mistakes from this pack;
- repeated probing reveals the listed solution without a penalty.

The Client already supports explicit wrong branches and failure terminals. The shipped content does not provide them.

## Incident 2: problem 30 should not have passed publication

The screenshot position maps exactly to `cho-elementary-0030` in `client/public/packs/cho-elementary/1/problems-001.json`.

Published data:

- side to play: Black;
- goal: make the Black target group live;
- target anchor: D19;
- declared line: A17, B19, A19, A18, C19;
- declared terminal: success, `unconditional-life`;
- tags: `reconciled`, `root-only-match`, `candidate`;
- verification label: `solver-checked`.

The underlying solver evidence does not justify that label or terminal:

- GNU Go's primary result for the selected target was `PASS`.
- The GNU Go tree was empty: zero nodes and zero matched source plies.
- A17 was accepted only by the separate `owl_does_defend` query. That means GNU Go considered A17 capable of defending the selected target; it does not establish that A17 is necessary, uniquely correct, or that the starting group is unsettled.
- KataGo ranked A17 22nd both in search and policy at the root, with policy approximately `0.0000063`; its top move was F14. KataGo is a ranking signal, not a tsumego proof, but this large disagreement is a clear manual-review trigger.
- The tester's board reading that Black does not need to play is consistent with GNU Go's primary `PASS` result.

The final `unconditional-life` result was never evaluated on the terminal board. It was generated from the goal type.

This problem should be quarantined pending a human review of the source diagram, target group, starting status, answer key, and terminal result.

## How the problem passed

`generator/src/cli/audit-gnugo-book.ts` and `generator/src/catalog/cho-client-pack.ts` currently form a permissive chain:

1. A target candidate qualifies when at least one expected root move receives a positive `owl_does_attack` or `owl_does_defend` response.
2. Candidate scoring awards that response even if GNU Go's primary move is `PASS` and the exported tree is empty or incomplete.
3. The audit classification permits `root-only-match`.
4. The pack builder requires only a selected target, a legally replayable printable line, and at least one expected root move.
5. The builder serializes the printable line alone. Every generated edge is `correct`.
6. The builder creates a success terminal from `goalKind`; it does not independently verify capture or life on the leaf board.
7. The builder hard-codes `verification.level` to `solver-checked`.
8. KataGo review-queue disagreements do not block publication.

The checks therefore established that the position and printable moves could be represented and legally replayed, and that a heuristic GNU Go query accepted the expected root against one target hypothesis. They did not establish solution necessity, complete responses, terminal truth, or teaching quality.

## Scope of the publication weakness

The issue is broader than problem 30:

| Audit status in the published pack | Exact | Reconciled | Total |
| --- | ---: | ---: | ---: |
| All expected roots covered | 1 | 0 | 1 |
| Full source-line match | 305 | 1 | 306 |
| Partial source-line match | 142 | 1 | 143 |
| Root-only match | 392 | 19 | 411 |
| **Total** | **840** | **21** | **861** |

Additional risk signals among the selected candidates:

- 26 have an explicit GNU Go primary move of `PASS`;
- 32 have an empty selected GNU Go tree;
- 246 match zero source-line plies in the selected tree;
- 14 published root moves rank below KataGo's top five search candidates, and 3 more expected roots are missing from its recorded candidates;
- 3 published root moves rank below its top ten, in addition to those 3 missing roots.

Even the 307 all-root/full-line records have no wrong branches and no independent terminal proof, so they are not ready for graded one-attempt use solely on the strength of that classification.

## Required publication gates

Before this collection can drive the one-attempt mode, the generator/publication path needs all of the following:

1. **Mode separation.** A line drill may allow neutral retry. A graded one-attempt problem must meet a stricter content contract.
2. **Measured refutation coverage.** A graded problem needs explicit wrong branches with legal opponent replies and failure leaves for the plausible learner moves covered by the publication policy. The coverage metric and omissions must be recorded.
3. **Independent terminal verification.** Capture, life, seki, ko, and already-settled states must be checked on the actual leaf and root boards. Goal type alone cannot create a terminal result.
4. **Root validation.** Detect `PASS`/already-solved positions, alternate correct roots, source-version mismatches, and cases where the printed answer is legal but unnecessary.
5. **Blocking review queue.** Empty trees, incomplete trees, solver disagreement, weak KataGo ranking, illegal neighboring branches, and reconciled diagrams must prevent graded publication until resolved.
6. **Truthful verification labels.** Candidate or heuristic evidence must not be serialized as `solver-checked`. Verification metadata must describe the evidence actually obtained.
7. **Human content review.** A Go reviewer must confirm the diagram, target, goal, correct alternatives, refutations, and result before the problem is called curated or expert verified.
8. **End-to-end acceptance.** A fixture must demonstrate a wrong learner move, prepared computer replies, a failure terminal, one recorded wrong result, and mistake rotation.

As an immediate content-policy decision, problem 30 and the other 25 explicit-`PASS` records should be quarantined. The 32 empty-tree and 411 root-only records also require review before graded use. This recommendation does not assert that every flagged problem is invalid; it says the current evidence is insufficient for publication in this mode.

## Evidence locations

- Published problems: `client/public/packs/cho-elementary/1/problems-*.json`
- Client unknown-branch behavior: `client/src/engine/puzzle-session.ts`
- Pack builder: `generator/src/catalog/cho-client-pack.ts`
- GNU Go candidate selection: `generator/src/cli/audit-gnugo-book.ts`
- GNU Go audit summary: `generator/CHO_BOOK_AUDIT.md`
- Setup reconciliation: `generator/CHO_RECONCILIATION.md`
- KataGo limitations and review queue: `generator/KATAGO_CROSSCHECK.md`
- Local exact audit report: `/private/tmp/goba-cho-gnugo-audit/audit-report.json`
- Local reconciled audit report: `/private/tmp/goba-cho-reconciliation/gnugo-audit/audit-report.json`
- Local KataGo analysis: `/private/tmp/goba-cho-katago-crosscheck/analysis/crosscheck-report.json`

The `/private/tmp` reports are research artifacts on the current workstation and are not durable repository inputs. Any future publication should preserve its evidence in an immutable, reproducible artifact set.

## Work intentionally deferred

No Client behavior, generated problem, pack manifest, publication flag, or deployment was changed during this audit. Remediation starts only after the product/content policy is chosen.
