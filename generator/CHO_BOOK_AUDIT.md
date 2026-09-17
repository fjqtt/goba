# Cho elementary: full GNU Go audit

Checked on 2026-09-16 using GNU Go 3.8 Owl on an Apple M1 Pro.

## Inputs

- Positions: `/private/tmp/cho-1.sgf`, 900 problems, `sha256:2667ddc1f73d9256820a598427ae212be78874c33932c5baf99d97793d8df432`.
- Community printable key: `/private/tmp/cho-go-problems.json`, 900 records, `sha256:742af89d57931488e6f3b6e90732481a94809bc1a3b8f3fd386f5e2ff72f416d`.
- Exact setup match: 845 problems. The other 55 were excluded from this audit because source setups differ.
- The key has one 1–9 move sequence for 723 linked problems. The other 122 provide only several alternative first moves.

## Comparison method

1. Replay every printable-line move independently through `RulesAdapter` using `ld-v1`; all 845 linked records are legal on their source setup.
2. Run `owl_attack`/`owl_defend` and `owl_does_*` for every connected group and known first move.
3. Save complete `--decide-owl` output for every target candidate.
4. Inspect only the tree branch with the actual first-player color; discard Owl's diagnostic “other side moves first” branch.
5. Search the complete source sequence as a continuous path and independently replay every edge in every considered branch.

## Results

| Class | Problems | Meaning |
|---|---:|---|
| Full line and entire selected Owl tree legal | **305** | Full available source sequence found; no illegal branch in selected tree |
| Full source line found but neighboring branches violate `ld-v1` | **69** | Line agrees; raw tree cannot be accepted whole |
| Only part of the continuation matches | **73** | Requires expansion or another solver/target review |
| Root only or incomplete alternative roots | **392** | Selected Owl tree omits later source moves or alternatives |
| Every alternative root covered and tree legal | **1** | Complete available multi-root key covered |
| No target group accepted a known root | **5** | Problems 193, 214, 724, 804, 887 |

A full path exists in **374/723** sequence records. Sixty-nine have illegal neighboring branches, leaving the strict 305. Of 122 multi-root records, 6 selected trees contain every known first move and only one is fully legal.

The machine report conservatively groups 69 full lines with illegal neighbors and 73 incomplete continuations as `partial-line-match` (142 total).

GNU Go accepted every known root through `owl_does_*` for 830 problems, some roots for 10, and none for 5. A positive GTP check does not guarantee that `--decide-owl` materializes the move.

## Trees and violations

- Saved **3,327** SGF trees for candidate targets.
- No solver process or export failed.
- 459 problems have additional root moves in at least one candidate tree. They remain `unclassified` pending terminal verification.
- 189 problems have an independently invalid branch in at least one candidate tree; 134 selected trees do.
- Raw output violations: 992 `wrong-turn` and 7,663 `superko` edges. Diagnostic Owl trees cannot be converted directly to Client solution trees.

## Artifacts

- Report: `/private/tmp/goba-cho-gnugo-audit/audit-report.json`.
- One-row-per-problem summary: `/private/tmp/goba-cho-gnugo-audit/audit-summary.csv`.
- Report SHA-256: `c283aed19995101909d3122e293be00dab308e8aff00931735398aad3439ac2d`.
- Trees: `/private/tmp/goba-cho-gnugo-audit/trees/`.
- Total size: about 123 MiB; JSON report: about 21 MiB.

Reproduce:

```bash
npm run audit:gnugo-book --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf /private/tmp/goba-cho-answer-links.json \
  /private/tmp/goba-cho-gnugo-audit 1 900 4
```

## Publication conclusion

This is a full corpus comparison, not a Client-ready book. The 305 strict records are only normalization candidates: target-goal terminals still need verification and additional moves need classification. Other problems need branch expansion, another proof solver, or curator review. A missing branch never receives `wrong`; it remains `unclassified`.
