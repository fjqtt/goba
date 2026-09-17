# KataGo cross-check Cho elementary

Date: 2026-09-16. Model: `g170e-b20c256x2-s5303129600-d1228401921`, Metal, 32 visits per state.

KataGo is used here as an independent ranking signal over a locally restricted move set. It is not life-and-death proof and does not justify automatic publication.

## Coverage

- States checked: **2,642**; Analysis API errors: **0**.
- Exact-linked: **2,393** states / **845** problems.
- Reconstructed setup candidates: **197** states / **47** problems.
- All eight real setup differences were checked on both position versions.

## Exact-linked: every printable-line move

| Metric | Value |
|---|---:|
| Key move top-1 in KataGo search | 1908/2393 |
| Key move top-3 in KataGo search | 2268/2393 |
| Key move top-5 in policy | 2366/2393 |
| GNU Go has a continuation at this prefix | 1540 |
| GNU Go contains the next key move | 1366/1540 |
| GNU Go continuation top-5 in KataGo policy | 1498/1540 |

At **174** prefixes GNU Go proposes a continuation that omits the next key move. KataGo policy ranks the key higher in **126**, the GNU Go move higher in **48**, and ties in **0**.

### By GNU Go audit status

| Status | States | key top-3 policy | GNU contains key | GNU top-3 policy |
|---|---:|---:|---:|---:|
| all-root-moves-covered | 1 | 1/1 | 1/1 | 1/1 |
| full-line-match | 694 | 677/694 | 694/694 | 680/694 |
| no-matching-target | 15 | 15/15 | 0/0 | 0/0 |
| partial-line-match | 555 | 538/555 | 395/420 | 407/420 |
| root-only-match | 1128 | 1078/1128 | 276/425 | 368/425 |

## 47 reconstructed positions

| Metric | Value |
|---|---:|
| States | 197 |
| Illegal key moves under ld-v1 | 10 |
| Key move top-5 in policy | 157/197 |
| GNU Go contains the next key move | 9/17 |

## Eight real setup differences

| No. | Moves | root rank key/SGF | top-3 key/SGF | illegal key/SGF | MRR key/SGF | Signal |
|---:|---:|---:|---:|---:|---:|---|
| 4 | 1 | 1/1 | 1/1 | 0/0 | 1.000/1.000 | inconclusive |
| 8 | 1 | 1/1 | 1/1 | 0/0 | 1.000/1.000 | inconclusive |
| 40 | 5 | 25/1 | 3/5 | 0/0 | 0.281/1.000 | sgf-position-stronger |
| 93 | 1 | 1/1 | 1/1 | 0/0 | 1.000/1.000 | inconclusive |
| 216 | 4 | 1/1 | 3/4 | 1/1 | 0.778/0.708 | both-lines-invalid |
| 420 | 6 | 8/1 | 3/6 | 0/0 | 0.507/0.917 | sgf-position-stronger |
| 533 | 1 | 2/— | 1/0 | 0/1 | 0.500/0.000 | key-position-stronger |
| 617 | 6 | 4/1 | 3/5 | 0/1 | 0.469/0.900 | key-position-stronger |

## Direct GNU Go disagreements with the key

The first 100 states are shown where the selected GNU Go tree continues at the same prefix but omits the next key move. JSON/CSV artifacts contain the full list.

| No. | Line move | Key | GNU Go | key rank | GNU Go rank |
|---:|---:|---|---|---:|---:|
| 11 | 1 | D19 | E19 | 1 | 3 |
| 17 | 1 | A18 | B18 | 1 | 2 |
| 21 | 1 | A19 | E18 | 2 | 1 |
| 42 | 1 | B19 | K17 | 1 | 14 |
| 44 | 2 | A16 | B18 | 1 | 2 |
| 50 | 1 | A19 | C15 | 2 | 1 |
| 51 | 1 | D19 | E19/D18/E18/C17 | 1 | 2 |
| 52 | 1 | D19 | E19/C17 | 1 | 4 |
| 59 | 1 | D18 | A19/A16 | 4 | 1 |
| 60 | 1 | F18 | B19/D18/E18 | 1 | 3 |
| 63 | 3 | F19 | G19 | 1 | 2 |
| 72 | 1 | D18 | E18 | 2 | 3 |
| 78 | 2 | F19 | F17/A16 | 2 | 1 |
| 94 | 1 | B19 | C18 | 1 | 5 |
| 104 | 1 | A18 | B19 | 2 | 1 |
| 125 | 2 | C18 | C17/A16 | 1 | 3 |
| 126 | 2 | B19 | D17 | 3 | 2 |
| 127 | 2 | C18 | A18/B18 | 1 | 2 |
| 130 | 2 | E19 | E17 | 3 | 4 |
| 139 | 1 | D18 | E17 | 2 | 8 |
| 148 | 2 | A15 | E19/A18 | 1 | 2 |
| 155 | 2 | E19 | B19 | 1 | 2 |
| 157 | 1 | B19 | C19/A17 | 1 | 2 |
| 162 | 1 | B19 | C19 | 2 | 1 |
| 164 | 1 | B18 | B19 | 1 | 3 |
| 181 | 4 | A18 | C19/G19 | 2 | 5 |
| 187 | 2 | E19 | C18 | 1 | 2 |
| 190 | 1 | A18 | C18 | 2 | 14 |
| 195 | 2 | B19 | C19/B17 | 3 | 1 |
| 198 | 1 | B19 | B18 | 1 | 4 |
| 199 | 4 | A15 | B18 | 1 | 2 |
| 212 | 1 | A18 | D19 | 3 | 2 |
| 226 | 1 | A17 | C19 | 1 | 9 |
| 232 | 1 | B19 | D18 | 1 | 2 |
| 233 | 1 | C19 | B19/A18/C18 | 1 | 2 |
| 237 | 4 | A18 | C19 | 1 | 2 |
| 240 | 2 | F17 | C19 | 1 | 5 |
| 254 | 2 | G19 | D19 | 1 | 2 |
| 257 | 2 | E18 | D18 | 2 | 1 |
| 266 | 2 | D18 | E19/G19 | 3 | 1 |
| 268 | 1 | D19 | D18 | 5 | 3 |
| 275 | 2 | E17 | D18 | 1 | 3 |
| 277 | 2 | C19 | B19/D19 | 2 | 3 |
| 285 | 1 | E19 | C19 | 2 | 30 |
| 297 | 3 | E19 | F19 | 3 | 1 |
| 302 | 2 | B18 | D18/B17 | 1 | 2 |
| 309 | 2 | A18 | E19/A17 | 2 | 3 |
| 313 | 1 | C18 | D13 | 1 | 6 |
| 316 | 1 | A18 | C19 | 1 | 2 |
| 325 | 2 | B17 | C17/A16 | 3 | 1 |
| 337 | 1 | C17 | D18/E18/A17 | 2 | 1 |
| 338 | 1 | A18/B18/D18/B17/A16 | F15 | 1 | 14 |
| 339 | 1 | B18/C18 | F18/B17 | 1 | 2 |
| 341 | 1 | E18 | C18/C17 | 1 | 2 |
| 345 | 2 | E19 | B19/C17 | 1 | 2 |
| 346 | 5 | D18 | A19 | 1 | 9 |
| 351 | 2 | C18 | A19 | 5 | 3 |
| 357 | 2 | A15 | A18 | 1 | 4 |
| 366 | 2 | B18 | C19 | 2 | 1 |
| 368 | 1 | A18 | C19 | 2 | 12 |
| 369 | 2 | C19 | B18 | 2 | 3 |
| 372 | 1 | A19/D19/B18 | E14 | 3 | 2 |
| 378 | 1 | B19 | B18 | 1 | 2 |
| 384 | 1 | B19 | B18 | 2 | 1 |
| 392 | 2 | C18 | C19 | 3 | 1 |
| 399 | 1 | B19 | B18 | 3 | 2 |
| 415 | 1 | A17 | A18/D17 | 1 | 3 |
| 416 | 2 | C18 | C19 | 1 | 8 |
| 422 | 2 | E19 | A18 | 1 | 2 |
| 426 | 1 | B19 | C19 | 1 | 2 |
| 429 | 1 | B19 | C15 | 1 | 14 |
| 432 | 1 | A18 | J17 | 1 | 9 |
| 435 | 1 | B19 | C19/C18/D18 | 1 | 18 |
| 437 | 1 | D19 | D18 | 1 | 22 |
| 440 | 2 | E19 | D18 | 3 | 1 |
| 443 | 1 | B19 | B18 | 2 | 1 |
| 455 | 1 | D19 | C18 | 1 | 2 |
| 457 | 1 | B19 | B18 | 2 | 1 |
| 458 | 2 | A15 | A17 | 1 | 4 |
| 460 | 2 | B19 | D19/A17 | 1 | 2 |
| 462 | 1 | B19 | D18 | 1 | 2 |
| 475 | 1 | C19 | B18 | 1 | 4 |
| 478 | 2 | B18 | C19/D18 | 1 | 2 |
| 482 | 2 | G19 | D18 | 2 | 5 |
| 498 | 2 | B18 | B17 | 1 | 5 |
| 499 | 2 | B19 | E19 | 2 | 1 |
| 505 | 1 | B19 | E19 | 2 | 4 |
| 509 | 1 | A18 | B18 | 2 | 1 |
| 513 | 2 | E19 | D18 | 1 | 4 |
| 520 | 1 | C19 | A18/D18 | 1 | 10 |
| 522 | 1 | F19 | B19 | 1 | 2 |
| 525 | 1 | A18 | B18 | 2 | 1 |
| 539 | 3 | D18 | A19 | 1 | 2 |
| 543 | 1 | C19 | D18 | 1 | 2 |
| 545 | 1 | C19 | A18 | 3 | 1 |
| 548 | 1 | C19 | A18 | 3 | 1 |
| 560 | 4 | H19 | G19/E18 | 7 | 2 |
| 561 | 2 | D19 | D18 | 2 | 3 |
| 567 | 1 | C19 | D18 | 2 | 1 |
| 571 | 2 | A17 | B16 | 1 | 2 |
