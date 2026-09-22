import {
  applyMove,
  type CompiledMap,
  currentScore,
  generateMoves,
  isGameOver,
  MAX_MOVES,
  META_FILLED,
  mix32,
  Rng,
  ROLL_COUNT,
  type State,
} from '@trek12/engine'
import { lastPlyValue36 } from '../exact/endgame.ts'
import type { RolloutPolicy } from '../policy/types.ts'

/**
 * Common random numbers: the dice of rollout `i` at future turn `t` depend only on (seed, i, t),
 * so every root candidate faces exactly the same sequence of rolls and the difference between two
 * candidates is a low-variance paired estimate. The first future roll is stratified: rollouts
 * i, i+36, i+72… cover the 36 outcomes exactly once each.
 */
export function stratifiedFirstRoll(seed: number, i: number): number {
  // Seeded permutation of 0..35, one per block of 36 rollouts.
  const block = (i / 36) | 0
  const perm = PERM_CACHE.get(seed, block)
  return perm[i % 36]
}

class PermCache {
  private seed = -1
  private block = -1
  private perm = new Uint8Array(36)
  get(seed: number, block: number): Uint8Array {
    if (seed !== this.seed || block !== this.block) {
      this.seed = seed
      this.block = block
      for (let k = 0; k < 36; k++) this.perm[k] = k
      const rng = new Rng(mix32(seed, block, 0x5eed))
      for (let k = 35; k > 0; k--) {
        const j = rng.nextInt(k + 1)
        const tmp = this.perm[k]
        this.perm[k] = this.perm[j]
        this.perm[j] = tmp
      }
    }
    return this.perm
  }
}
const PERM_CACHE = new PermCache()

export function crnRoll(seed: number, i: number, turn: number): number {
  return turn === 0 ? stratifiedFirstRoll(seed, i) : mix32(seed, i, turn + 1) % 36
}

const moves = new Int32Array(MAX_MOVES)

/**
 * Plays `s` (in place) with the CRN dice of rollout `i` until one circle is left, then takes the
 * exact expectation of the last turn. Returns 36 × the final value — an integer, so sums are exact
 * and independent of how the work was split across workers.
 */
export function crnRollout36(
  map: CompiledMap,
  s: State,
  policy: RolloutPolicy,
  seed: number,
  i: number,
): number {
  const rng = new Rng(mix32(seed, i, 0x7ae))
  let turn = 0
  while (!isGameOver(map, s)) {
    if (map.n - s[map.oMeta + META_FILLED] === 1) return lastPlyValue36(map, s)
    const roll = crnRoll(seed, i, turn++)
    const y = (roll / 6) | 0
    const r = (roll % 6) + 1
    const count = generateMoves(map, s, y, r, moves)
    applyMove(map, s, moves[policy.choose(map, s, y, r, moves, count, rng)])
  }
  return currentScore(map, s) * ROLL_COUNT
}

/** 36 × scores of rollouts `from .. from+count` of `child` (a state right after a root move). */
export function crnRolloutScores(
  map: CompiledMap,
  child: State,
  policy: RolloutPolicy,
  seed: number,
  from: number,
  count: number,
  out: Int32Array = new Int32Array(count),
): Int32Array {
  const scratch = new Int32Array(child.length)
  for (let k = 0; k < count; k++) {
    scratch.set(child)
    out[k] = crnRollout36(map, scratch, policy, seed, from + k)
  }
  return out
}
