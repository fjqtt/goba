# Modern L&D solver research — 2026-09-19

Independent research pass over solver options as of September 2026, updating
[MAC_SOLVER_EVALUATION.md](MAC_SOLVER_EVALUATION.md) and [RZS_FEASIBILITY.md](RZS_FEASIBILITY.md).
Repository/paper analysis only; no candidate was executed.

## Headline finding

In February 2026 the RLG lab (I-Chen Wu et al.) published **rlglab/study-LD-RZ** — official code
for a new IEEE ToG paper (arXiv 2512.21365, Dec 2025) on Relevance-Zone based solvers (RZS-TT and
the 4.74x faster RZS-PT with a radix-tree pattern table). Unlike the dead `rockmanray/rzone`, it has
a headless batch mode (`CGI -mode tsumego_solver`), JSON task input (SGF, ko rules, crucial stones,
side), JSON statistics plus SGF solution-tree output, and ships 117 Cho vol1/vol2 tasks. It covers
pipeline requirements for status, solution trees, and reproducibility pinning.

Blockers:
1. **No LICENSE file** (`license: null` — all rights reserved by default; rzone ancestry is GPL-3.0).
   The lane is legally blocked for pack publication until the authors grant permission.
2. Same old stack: linux/amd64 + Caffe2 + NVIDIA CUDA (`rockmanray/gorzone` image, hard-wired GPU
   device in cfg, no CPU path). Needs a rented T4/RTX20xx-class worker; may fail on Ada/Hopper.
3. Per-move verification (our requirement 2) is not documented; presumably solved by playing the
   move and solving for the opponent — unverified.
4. The paper itself reports solutions differing from the book in 2 of 7 published trees — curator
   review stays mandatory. The published solution trees are ready-made golden fixtures for our
   replay verifier: https://rlg.iis.sinica.edu.tw/papers/study-LD-RZ

## Shortlist

| Candidate | Platform | License | Fit |
|---|---|---|---|
| rlglab/study-LD-RZ (RZS-PT) | linux/amd64 + NVIDIA | **none — ask authors** | Proof-oriented lane: status, trees, pinning; medium/high integration cost |
| KataGo 1.18.2 + tsumego-frame | arm64 Mac Metal | MIT | Cheap upgrade of the heuristic lane: transformer nets on Metal (since 1.17.0), per-player `allowMoves`; frame preprocessing (LizGoban technique — reimplement, do not copy GPL code) makes the global objective match the local task |
| KataGomo LifeGo (hzyhhzy, LifeGo_20241025) | Win/Linux; Mac build untested | MIT | Strongest neural L&D signal found (kill-all-trained transfer of b28c512nbt); still heuristic; base is KataGo 1.15.3 |
| GNU Go 3.8 Owl (status quo) | arm64 native | GPL-3.0 | Current candidate lane; frozen upstream |

## Dead ends confirmed

- df-pn open source is dead: cameron-martin/tsumego-solver (last push 2020-07, no license),
  tsumego.js (2018), GoTools (MS-DOS), Kishimoto/Müller TsumeGo Explorer (never released),
  MIGOS (never released, ≤5x5 whole board).
- KataGo PR #261 (`kata-problem_analyze`) was never merged; no official tsumego mode exists.
- 101weiqi, BadukPop, Tsumego Hero, goproblems: no public solver APIs or code found.
- rlglab/online-fine-tuning-solver is 7x7 Killall only; rlglab/minizero is a training framework.

## Recommended next steps

1. Email the RLG lab about a license for study-LD-RZ and rights to use solver output in a published
   pack (contacts on the paper page).
2. Technical spike (internal evaluation only until the license answer): rent linux/amd64 + T4-class
   GPU, run their 117 tasks with their scripts, cross-check the 3 positions matching our corpus and
   the 7 published trees; pin commit, image digest, and cfg hashes.
3. Mac quick win: upgrade KataGo 1.16.2 → 1.18.2 with a transformer net, implement a tsumego-frame
   preprocessor in our own code, and re-measure on the 37 labeled Cho fixtures against GNU Go Owl
   (same methodology as MAC_SOLVER_EVALUATION.md).

Key links: https://github.com/rlglab/study-LD-RZ · https://arxiv.org/abs/2512.21365 ·
https://github.com/lightvector/katago/releases · https://github.com/hzyhhzy/KataGomo/tree/LifeGo2024 ·
https://github.com/kaorahi/lizgoban · https://github.com/rockmanray/rzone
