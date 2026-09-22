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
 ├─ rollouts   = CRN playouts with a fast policy (heuristic), last turn taken exactly
 ├─ rounds     = successive halving: 36·2^round rollouts per survivor, eliminate the hopeless
 └─ endgame    = exact expectimax when ≤ 3 cells remain after the move (exact/endgame.ts)
advise() (mc/advisor.ts) drives a Race over a SolverPool of workers; results are anytime.
```

### Rollout policies (`policy/`)

- `random`, `greedy` (best immediate score change) and `heuristic` (greedy plus expected-value
  features: orphan rescue, open chain ends, zone growth, tick scarcity). The heuristic is the
  playout policy of the Monte-Carlo search; its weights were found by cross-entropy search
  (`pnpm bench tune`, see `docs/BENCHMARKS.md`) and `heuristic-v1` keeps the hand-set weights of
  v1.0.0 for comparisons.
- Ties are broken uniformly at random. Taking the first best candidate instead costs ~13 points
  (it systematically favours the lowest operation and cell indices).

### Common random numbers (`mc/crn.ts`)

The dice of rollout `i` at future turn `t` are a pure function of `(seed, i, t)`. Every candidate
therefore faces the same sequence of rolls, and the difference between two candidates is a paired
estimate with far less variance than two independent means. The first future roll is stratified: each
block of 36 rollouts covers the 36 outcomes exactly once.

A rollout stops when **one circle is left** and returns the exact expectation of that last turn
(`lastPlyValue36`) instead of sampling it: the final roll is the noisiest part of a playout, and the
table costs about as much as one heuristic decision. Values are kept as `36 × points` integers, so
sums are exact and the ranking is **bit-identical** whether the work runs on one thread or is split
into arbitrary chunks over several workers (tested).

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

With **3 or fewer empty cells after the candidate move**, the expected score is computed exactly by
expectimax over the 26 weighted rolls and every legal reply. Two devices make this affordable:

- **Last-ply table.** With one circle left, the outcome depends only on the number that ends up in it
  (0–12 or ☹), never on the operation, so the 26 rolls × 5 operations collapse to at most 14
  evaluations (`lastPlyValue36`). This is also the tail of every rollout.
- **Memoisation.** Positions with 2+ empty cells are keyed by their core (numbers, links, ticks) and
  solved once; the same 2-empty position is reached from several candidates and roll orders.

A 3-empty solve costs about 10 ms per candidate on a laptop thread (≈ 50–130 ms per decision), and
candidates are spread across the workers. With 4 empty cells the cost would be a hundred times higher,
so those positions are still sampled. Validated against an independent naive expectimax in the tests.

### Worker pool (`pool/`)

Workers are pure: `init(map, ruleset)`, then `rollouts(core, seed, from, count, policy)` →
`Int32Array` of 36 × scores, or `exact(core, moves)` → `Float64Array` of values. The pool queues
requests, hands them to idle workers, and replaces a worker that has to be cancelled (a decision the
user abandoned by changing the dice). The same handler runs in Web Workers, in Node and in
`FakeWorker` for tests.

## Cost of a decision (Apple Silicon Mac, one thread, budget 2 304 rollouts/survivor, 5 positions each)

| Sheet | Turn 1 | Turn 10 | Turn 15 | Turn 16 (exact) | Turn 17 (exact) |
|---|---:|---:|---:|---:|---:|
| Dunai | 1.5 s | 90 ms | 12 ms | 50 ms | < 1 ms |
| Kagkot | 1.1 s | 60 ms | 7 ms | 130 ms | 1 ms |
| Dhaulagiri | 0.9 s | 220 ms | 16 ms | 70 ms | 1 ms |

Turn 1 has ~95 candidates; in the app the rollouts are split over 2–4 workers and the race is
interrupted at the time budget (1.5 s by default) with the current ranking.

## Strength

`pnpm bench compare --policy heuristic-v1,heuristic,mc288@heuristic-v1,mc288 --games 80 --seed 200`
(paired seeds; `mc288` = root race with up to 288 rollouts per surviving candidate):

| Sheet | heuristic-v1 | heuristic (shipped) | advisor with v1 rollouts | **advisor v1.1** |
|---|---:|---:|---:|---:|
| Dunai (65+) | 66.6 | 66.5 | 88.2 | **89.7** |
| Kagkot (70+) | 60.8 | 62.0 | 81.6 | **82.5** |
| Dhaulagiri (75+) | 60.4 | 63.6 | 84.1 | **83.7** |

Every mean is well above the printed summit threshold. See `docs/BENCHMARKS.md` for the baseline
policies, the weight tuning and the search-change comparison against v1.0.0.

## Roadmap for the solver

1. Exact solve at 4 empty cells within a node budget (needs a transposition table across chance nodes).
2. Tune the rollout policy directly against the Monte-Carlo objective, not the greedy proxy.
3. Learned evaluation (linear on engineered features, then n-tuple network) under a 1-ply expectimax.
