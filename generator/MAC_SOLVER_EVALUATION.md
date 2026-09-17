# Mac solver feasibility checkpoint

Checked on 2026-09-16 on an Apple M1 Pro (`arm64`, macOS) using Cho volume-one problems.

## Decision

Use **GNU Go 3.8 Owl** as the local CPU lane for candidate moves and partial SGF trees. It runs natively on Apple Silicon, accepts SGF/GTP, and requires neither Docker nor a GPU. Output remains `unknown/heuristic-candidate-only`: Owl is heuristic and node-limit dependent, so it cannot publish a proof automatically.

Keep KataGo Metal for policy/PV and plausible-move ranking. Its whole-game objective means that even local `allowMoves` does not turn Analysis API into a tsumego proof engine.

## Measurements

| Option | Runs on this Mac | Measured result | Role |
|---|---|---|---|
| GNU Go 3.8 Owl | Native Homebrew arm64, 7.9 MiB | On 37 labeled upstream Cho fixtures, first move matched 27 and `owl_does_defend` accepted the author move in 33. Higher limits did not change results; 37 positions took 5.14 s | Candidates, alternatives, partial SGF; always reviewed |
| KataGo 1.16.2 | Native Metal | Small benchmark: 103.86 visits/s at one thread. Unrestricted Cho analysis chose global moves; local move lists changed search but gave no L&D proof | Policy/PV, ranking, second opinion |
| Cameron tsumego-solver 0.1.3 | x86_64 under Rosetta | Interactive `explore`, no headless solution export; 16×8 bitboard with explicit mask | Do not integrate |
| rzone | Official `linux/amd64` image can be emulated | Caffe2 path requires unavailable CUDA/NVIDIA | Separate Linux/CUDA worker |

GNU Go documents `--decide-owl` SGF output and the relevant GTP commands, while warning that Owl depends on limits and higher node limits do not necessarily improve strength: [usage](https://www.gnu.org/software/gnugo/gnugo_3.html), [GTP](https://www.gnu.org/software/gnugo/gnugo_19.html), [Owl](https://www.gnu.org/software/gnugo/gnugo_11.html), [Homebrew](https://formulae.brew.sh/formula/gnu-go).

KataGo supports Metal and a streaming Analysis API, but returns estimates, policy, and PV rather than a proof tree: [compilation](https://github.com/lightvector/KataGo/blob/master/Compiling.md), [Analysis Engine](https://github.com/lightvector/KataGo/blob/master/docs/Analysis_Engine.md).

## Real downloaded-SGF run

```bash
npm run probe:gnugo --workspace @goba/generator -- \
  /private/tmp/cho-1.sgf 8 1 4 /private/tmp/goba-gnugo-cho-8
```

Imported 900 drafts with SHA-256 `2667ddc1f73d9256820a598427ae212be78874c33932c5baf99d97793d8df432`. Problem 8 produced three target hypotheses. For the black group, GNU Go proposed the known `A18` and saved 10 attack plus 8 defense variations. It also accepted `H19`, absent from the available key, demonstrating why output remains a hypothesis.

Artifact: `/private/tmp/goba-gnugo-cho-8/problem-8-candidate-608-b.sgf`.

## First-move source

[`travisgk/tsumego-pdf`](https://github.com/travisgk/tsumego-pdf) has a key for all 900 elementary positions, but no full interactive trees and unclear rights for source problems/community solutions; see its [disclaimer](https://github.com/travisgk/tsumego-pdf/blob/main/LICENSE). Data therefore remains `restricted` research material.

Deterministic matching with `cho-1.sgf` found **845/900** exact setups. Fifty-five differ; problem 201 has an 18-column row. Some numbered solution overlays became setup stones in one source. Answers must not be transferred by number alone. Manifest: `/private/tmp/goba-cho-answer-links.json`; key hash `sha256:742af89d57931488e6f3b6e90732481a94809bc1a3b8f3fd386f5e2ff72f416d`.

## Next gate

1. Store the 845 exact roots as restricted annotations with provenance; keep 55 in review.
2. Run GNU Go and separate agreement, extra moves, and disagreement.
3. Normalize Owl SGF, replay every edge, and verify terminal predicates.
4. Neither key agreement nor GNU Go/KataGo agreement replaces curator/expert review.
