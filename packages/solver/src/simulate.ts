import {
  applyMove,
  type CompiledMap,
  cloneState,
  createState,
  currentScore,
  generateMoves,
  isGameOver,
  MAX_MOVES,
  Rng,
  type State,
} from '@trek12/engine'
import type { RolloutPolicy } from './policy/types.ts'

const moves = new Int32Array(MAX_MOVES)

/** Plays `s` to the end in place with random rolls from `rng`; returns the final score. */
export function rollout(map: CompiledMap, s: State, policy: RolloutPolicy, rng: Rng): number {
  while (!isGameOver(map, s)) {
    const roll = rng.nextInt(36)
    const y = (roll / 6) | 0
    const r = (roll % 6) + 1
    const count = generateMoves(map, s, y, r, moves)
    const idx = policy.choose(map, s, y, r, moves, count, rng)
    applyMove(map, s, moves[idx])
  }
  return currentScore(map, s)
}

/** A complete game from the empty sheet, deterministic for a given seed. */
export function simulateGame(map: CompiledMap, policy: RolloutPolicy, seed: number): number {
  return rollout(map, createState(map), policy, new Rng(seed))
}

/** Plays `turns` moves with `policy` from the empty sheet — a reproducible mid-game position. */
export function positionAfter(
  map: CompiledMap,
  policy: RolloutPolicy,
  seed: number,
  turns: number,
): State {
  const s = createState(map)
  const rng = new Rng(seed)
  for (let t = 0; t < turns && !isGameOver(map, s); t++) {
    const roll = rng.nextInt(36)
    const y = (roll / 6) | 0
    const r = (roll % 6) + 1
    const count = generateMoves(map, s, y, r, moves)
    applyMove(map, s, moves[policy.choose(map, s, y, r, moves, count, rng)])
  }
  return s
}

export type Stats = {
  games: number
  mean: number
  sd: number
  min: number
  p10: number
  median: number
  p90: number
  max: number
}

export function stats(scores: ArrayLike<number>): Stats {
  const sorted = Array.from(scores).sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((a, b) => a + b, 0) / n
  const sd = Math.sqrt(sorted.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, n - 1))
  const q = (p: number) => sorted[Math.min(n - 1, Math.floor(p * n))]
  return {
    games: n,
    mean,
    sd,
    min: sorted[0],
    p10: q(0.1),
    median: q(0.5),
    p90: q(0.9),
    max: sorted[n - 1],
  }
}

/** Throughput probe: rollouts per second from a copy of `from`. */
export function measureRollouts(
  map: CompiledMap,
  from: State,
  policy: RolloutPolicy,
  seed: number,
  budgetMs: number,
  now: () => number,
): { rollouts: number; perSecond: number; meanScore: number } {
  const rng = new Rng(seed)
  const start = now()
  let rollouts = 0
  let total = 0
  let elapsed = 0
  while (elapsed < budgetMs) {
    for (let k = 0; k < 20; k++) {
      total += rollout(map, cloneState(from), policy, rng)
      rollouts++
    }
    elapsed = now() - start
  }
  return { rollouts, perSecond: (rollouts * 1000) / elapsed, meanScore: total / rollouts }
}
