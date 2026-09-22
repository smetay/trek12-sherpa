# Solver

How the advisor picks a move, and why it is built this way. Code: `packages/solver`.

## The problem

At each of the 19 turns the player sees the two dice and chooses an operation, a circle and, when
several neighbours are eligible, which rope link to draw. There are up to ~95 legal moves on turn 1
and typically 10–35 afterwards; each future turn is preceded by one of 36 equiprobable rolls (26
distinct outcomes once the symmetric ones are merged). The state includes the drawn links, so the
reachable space is far too large for exact search except at the very end. We optimise the **expected
final score**.

## Architecture

```
Race (root search, packages/solver/src/mc/race.ts)
 ├─ candidates = every legal move for the dice on the table
 ├─ rollouts   = CRN playouts to the end of the game with a fast policy (heuristic)
 ├─ rounds     = successive halving: 36·2^round rollouts per survivor, eliminate the hopeless
 └─ endgame    = exact expectimax when ≤ 2 cells remain after the move (exact/endgame.ts)
advise() (mc/advisor.ts) drives a Race over a SolverPool of workers; results are anytime.
```

### Rollout policies (`policy/`)

- `random`, `greedy` (best immediate score change) and `heuristic` (greedy plus expected-value
  features: orphan rescue, open chain ends, zone growth, tick scarcity). The heuristic is the playout
  policy of the Monte-Carlo search; its weights live in `policy/heuristic.ts`.
- Ties are broken uniformly at random. Taking the first best candidate instead costs ~13 points
  (it systematically favours the lowest operation and cell indices).

### Common random numbers (`mc/crn.ts`)

The dice of rollout `i` at future turn `t` are a pure function of `(seed, i, t)`. Every candidate
therefore faces the same sequence of rolls, and the difference between two candidates is a paired
estimate with far less variance than two independent means. The first future roll is stratified: each
block of 36 rollouts covers the 36 outcomes exactly once. Results are integers and their order is
fixed by `i`, so the ranking is **bit-identical** whether the work runs on one thread or is split into
arbitrary chunks over several workers (tested).

### Successive halving (`mc/race.ts`)

Round `k` gives every surviving candidate `36·2^k` new rollouts. After each round the leader is the
candidate with the best mean; a candidate is eliminated when the leader beats it by more than 3
standard errors of the paired difference, and the field is additionally capped at half its size
(minimum 3) so the race converges even when everything is close. The race stops when one candidate
survives, when the leader is 3 SE ahead of the runner-up with at least 252 rollouts, when all
survivors are within ±0.25 point of each other, when the rollout budget is spent, or when the caller's
time budget runs out (rounds are barriers, so a time limit never breaks determinism for a given number
of rounds).

The ranking reports, for every move: mean, standard error, the paired difference to the best move with
its 95 % half-width, a `tied` flag (the interval contains 0), and P(score ≥ summit).

### Exact endgame (`exact/endgame.ts`)

With 2 or fewer empty cells after the candidate move, the expected score is computed exactly by
expectimax over the 26 weighted rolls and every legal reply (~5 k applies per candidate). With 3 empty
cells it would cost ~300 k applies per candidate (~1 s for 20 candidates on a laptop), so that ply is
still sampled. Validated against an independent naive expectimax in the tests.

### Worker pool (`pool/`)

Workers are pure: `init(map, ruleset)` then `rollouts(core, seed, from, count, policy)` →
`Int32Array` of scores. The pool queues requests, hands them to idle workers, and replaces a worker
that has to be cancelled (a decision the user abandoned by changing the dice). The same handler runs
in Web Workers, in Node and in `FakeWorker` for tests.

## Cost of a decision (Apple Silicon Mac, one thread, Kagkot, budget 2 304 rollouts/survivor)

| Turn | Candidates | Outcome | Time |
|---:|---:|---|---:|
| 1 | 95 | 7 rounds, 3 survivors | 1.2 s |
| 5 | 33 | 4 rounds, 1 survivor | 130 ms |
| 10 | 28 | 4 rounds, 2 survivors | 50 ms |
| 15 | 12 | 5 rounds, 1 survivor | 11 ms |
| 17 | 9 | exact | 5 ms |
| 18 | 4 | exact | < 1 ms |

## Strength

`pnpm bench compare --map kagkot --policy heuristic,mc288 --games 40 --seed 100` (paired seeds):

| Sheet | heuristic | mc288 | Δ ± SE |
|---|---:|---:|---:|
| Dunai (65+) | 64.3 | **89.0** | +24.7 ± 2.5 |
| Kagkot (70+) | 61.4 | **83.2** | +21.8 ± 2.2 |
| Dhaulagiri (75+) | 58.5 | **83.8** | +25.3 ± 2.7 |

Every mean is well above the printed summit threshold. See `docs/BENCHMARKS.md` for the baseline
policies.

## Roadmap for the solver

1. Last-ply table (`E1`): end every rollout with the exact expectation of the final turn, and make
   3-empty positions exact within budget.
2. Weight tuning of the rollout policy by cross-entropy on generated maps (avoid overfitting a sheet).
3. Learned evaluation (linear on engineered features, then n-tuple network) under a 1-ply expectimax.
