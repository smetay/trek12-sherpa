# Benchmarks

Reproducible with the bench CLI (`pnpm bench help`). All numbers: single thread, seed 1, mandatory
link rule. Machine: Apple Silicon Mac, Node 24.13, 2026-09-22 (solver 0.1.0).

## Baseline policies — 1 000 games per sheet

`pnpm bench sim --policy random,greedy,heuristic --games 1000`

| Sheet | Policy | Mean | SD | p10 | Median | p90 | Max | P(≥ summit) | Games/s |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Dunai (65+) | random | 6.4 | 15.0 | −13 | 7 | 25 | 54 | 0 % | 70 k |
| Dunai (65+) | greedy | 59.7 | 13.1 | 42 | 61 | 76 | 96 | 38.1 % | 31 k |
| Dunai (65+) | **heuristic** | **65.6** | 10.7 | 51 | 66 | 79 | 93 | **55.8 %** | 11 k |
| Kagkot (70+) | random | −0.4 | 15.4 | −20 | 0 | 20 | 44 | 0 % | 112 k |
| Kagkot (70+) | greedy | 51.6 | 15.0 | 32 | 53 | 70 | 95 | 10.9 % | 41 k |
| Kagkot (70+) | **heuristic** | **60.8** | 11.2 | 46 | 61 | 75 | 93 | **21.9 %** | 13 k |
| Dhaulagiri (75+) | random | −5.4 | 15.9 | −26 | −5 | 16 | 46 | 0 % | 121 k |
| Dhaulagiri (75+) | greedy | 54.2 | 14.4 | 37 | 55 | 72 | 89 | 7.8 % | 40 k |
| Dhaulagiri (75+) | **heuristic** | **62.7** | 12.0 | 48 | 63 | 78 | 93 | **15.9 %** | 14 k |

- `random`: uniform over legal moves. `greedy`: best immediate score change, random tie-break.
- `heuristic`: greedy plus expected-value features (orphan rescue, open chain ends, zone growth, tick
  scarcity) with the default weights in `packages/solver/src/policy/heuristic.ts`. Each feature was
  checked in isolation on 400 paired games (Kagkot / Dunai): rescue +4.1 / +4.4, chain ends +5.0 / +4.6,
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
