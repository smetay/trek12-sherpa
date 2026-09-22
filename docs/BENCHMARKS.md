# Benchmarks

Reproducible with the bench CLI (`pnpm bench help`). All numbers: single thread, seed 1, mandatory
link rule. Machine: Apple Silicon Mac, Node 24.13, 2026-09-22 (solver 0.1.0).

## Baseline policies — 1 000 games per sheet

`pnpm bench sim --policy random,greedy,heuristic --games 1000`

| Sheet | Policy | Mean | SD | p10 | Median | p90 | Max | P(≥ summit) | Games/s |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dunai (65+) | random | 6.4 | 15.0 | −13 | 7 | 25 | 54 | 0 % | 70 k |
| Dunai (65+) | greedy | 59.7 | 13.1 | 42 | 61 | 76 | 96 | 38.1 % | 31 k |
| Dunai (65+) | heuristic (v1 weights) | 65.6 | 10.7 | 51 | 66 | 79 | 93 | 55.8 % | 11 k |
| Dunai (65+) | **heuristic** (tuned, shipped) | **67.1** | 10.0 | 54 | 67 | 80 | 95 | **62.5 %** | 10 k |
| Kagkot (70+) | random | −0.4 | 15.4 | −20 | 0 | 20 | 44 | 0 % | 112 k |
| Kagkot (70+) | greedy | 51.6 | 15.0 | 32 | 53 | 70 | 95 | 10.9 % | 41 k |
| Kagkot (70+) | heuristic (v1 weights) | 60.8 | 11.2 | 46 | 61 | 75 | 93 | 21.9 % | 13 k |
| Kagkot (70+) | **heuristic** (tuned, shipped) | **61.5** | 11.3 | 47 | 63 | 75 | 93 | **22.7 %** | 13 k |
| Dhaulagiri (75+) | random | −5.4 | 15.9 | −26 | −5 | 16 | 46 | 0 % | 121 k |
| Dhaulagiri (75+) | greedy | 54.2 | 14.4 | 37 | 55 | 72 | 89 | 7.8 % | 40 k |
| Dhaulagiri (75+) | heuristic (v1 weights) | 62.7 | 12.0 | 48 | 63 | 78 | 93 | 15.9 % | 14 k |
| Dhaulagiri (75+) | **heuristic** (tuned, shipped) | **63.6** | 11.2 | 49 | 64 | 78 | 93 | **16.8 %** | 14 k |

- `random`: uniform over legal moves. `greedy`: best immediate score change, random tie-break.
- `heuristic`: greedy plus expected-value features (orphan rescue, open chain ends, zone growth, tick
  scarcity) with the v1.0.0 hand-set weights (now `heuristic-v1`). Each feature was checked in
  isolation on 400 paired games (Kagkot / Dunai): rescue +4.1 / +4.4, chain ends +5.0 / +4.6,
  ticks +2.5 / +3.1, zone +1.6 / +1.5; the danger term is currently a no-op and kept as a placeholder.
- A lesson worth recording: with all feature weights at zero the heuristic scored **13 points below**
  greedy until ties were broken at random — always taking the first best candidate favours the lowest
  operation and cell indices, a large systematic bias.

## Rollout throughput (mid-game, turn 9, Kagkot)

`pnpm bench perf --map kagkot --policy random,greedy,heuristic --ms 2000`

| Policy | Rollouts/s (1 thread) |
|---|---:|
| random | 293 k |
| greedy | 110 k |
| heuristic | 46 k |

The M2 gate was 3 k heuristic rollouts/s per worker on a phone; the desktop figure leaves a wide margin.
Phone numbers come from the in-app `#/perf` page.

## Monte-Carlo advisor — 40 paired games per sheet

`pnpm bench compare --policy heuristic,mc288 --games 40 --seed 100` (solver 0.2.0; `mc288` = root
race with up to 288 rollouts per surviving candidate and the exact endgame; see `docs/SOLVER.md`).

| Sheet | heuristic | mc288 | Δ ± SE |
|---|---:|---:|---:|
| Dunai (65+) | 64.3 | **89.0** | +24.7 ± 2.5 |
| Kagkot (70+) | 61.4 | **83.2** | +21.8 ± 2.2 |
| Dhaulagiri (75+) | 58.5 | **83.8** | +25.3 ± 2.7 |

## Weight tuning (solver 0.3.0)

`pnpm bench tune --map dunai,kagkot,dhaulagiri --games 800 --pop 24 --elite 6 --gens 30 --seed 1`

Cross-entropy method over the six heuristic weights: 24 candidates per generation play the same 800
seeds on each of the three sheets (common random numbers), the best 6 move the mean and spread, seeds
change every generation. 30 generations took 141 s.

| Weight | v1.0.0 (hand-set) | tuned |
|---|---:|---:|
| rescue | 0.8 | 1.25 |
| chainEnd | 0.6 | 0.70 |
| zone | 0.5 | 0.34 |
| ticks | 1.0 | 1.43 |
| danger | 0.8 | 0.83 (no-op) |
| noise | 0 | 0.17 |

Held-out check (3 000 games per sheet, seeds never seen during tuning, paired): greedy heuristic
**63.2 → 64.7 points** (+1.6). The shipped weights drop the noise term (see below): as a greedy
player that costs a little, but the weights serve inside the Monte-Carlo search, where randomness
only adds variance.

## Advisor v1.1 (solver 0.3.0)

Two changes to the search: every rollout ends with the **exact expectation of the last turn** instead
of one sampled roll, and the root is solved **exactly with up to 3 empty cells** after the move
(last-ply table + memoisation, spread over the workers). Then the rollout weights.

**Search changes, 40 paired games per sheet** (`--policy heuristic-v1,heuristic,mc288@heuristic-v1,mc288
--games 40 --seed 100`, tuned weights *with* noise 0.17 at that point):

| Sheet | heuristic-v1 | heuristic (tuned, noise 0.17) | mc288, v1 rollouts | mc288, tuned rollouts |
|---|---:|---:|---:|---:|
| Dunai (65+) | 64.3 | 67.5 | 91.0 | 88.1 |
| Kagkot (70+) | 61.4 | 66.0 | 84.5 | 84.8 |
| Dhaulagiri (75+) | 58.5 | 63.2 | 83.6 | 84.8 |

v1.0.0 scored 89.0 / 83.2 / 83.8 on the same seeds with 2-empty exactness and sampled last plies.

**Rollout weights, 80 paired games per sheet** (`--games 80 --seed 200 --weights '{"noise":0}'`):

| Sheet | heuristic-v1 | heuristic (tuned, noise 0) | mc288, v1 rollouts | **mc288, shipped** |
|---|---:|---:|---:|---:|
| Dunai (65+) | 66.6 | 66.5 | 88.2 | **89.7** (+1.5 ± 1.0) |
| Kagkot (70+) | 60.8 | 62.0 | 81.6 | **82.5** (+0.9 ± 1.0) |
| Dhaulagiri (75+) | 60.4 | 63.6 | 84.1 | **83.7** (−0.5 ± 1.0) |

Tuned weights without noise are never significantly worse and +0.6 point on average over the 240
paired games, so they ship. (Different seed sets give absolute means that differ by 2–3 points — only
paired differences within one run are comparable.)
