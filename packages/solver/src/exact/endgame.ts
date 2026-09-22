import {
  applyMove,
  BRANCHES,
  type CompiledMap,
  currentScore,
  generateMoves,
  isGameOver,
  MAX_MOVES,
  META_FILLED,
  ROLL_COUNT,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'

/** Exact expectimax is affordable up to this many empty cells per candidate (~5k applies at 2; ~300k at 3). */
export const EXACT_EMPTY_LIMIT = 2

// Per-depth scratch buffers, allocated on first use so any depth works (tests go deeper than the limit).
const scratchStates: State[] = []
const scratchMoves: Int32Array[] = []

export function emptyCells(map: CompiledMap, s: State): number {
  return map.n - s[map.oMeta + META_FILLED]
}

/**
 * Expected final score of `s` under optimal play, before the next roll.
 * Enumerates the 26 distinct rolls (weighted) and every legal reply; exact, no sampling.
 */
export function exactValue(map: CompiledMap, s: State, depth = 0): number {
  if (isGameOver(map, s)) return currentScore(map, s)
  if (scratchStates[depth] === undefined || scratchStates[depth].length !== s.length) {
    scratchStates[depth] = new Int32Array(s.length)
  }
  if (scratchMoves[depth] === undefined) scratchMoves[depth] = new Int32Array(MAX_MOVES)
  const child = scratchStates[depth]
  const moves = scratchMoves[depth]
  let total = 0
  for (const branch of BRANCHES) {
    const y = rollYellow(branch.roll)
    const r = rollRed(branch.roll)
    const count = generateMoves(map, s, y, r, moves)
    let best = -Infinity
    for (let i = 0; i < count; i++) {
      child.set(s)
      applyMove(map, child, moves[i])
      const v = exactValue(map, child, depth + 1)
      if (v > best) best = v
    }
    total += branch.weight * best
  }
  return total / ROLL_COUNT
}

/** Exact value of each root move (dice known) when few cells remain. */
export function exactRootValues(
  map: CompiledMap,
  s: State,
  rootMoves: Int32Array,
  count: number,
): Float64Array {
  const values = new Float64Array(count)
  const child = new Int32Array(s.length)
  for (let i = 0; i < count; i++) {
    child.set(s)
    applyMove(map, child, rootMoves[i])
    values[i] = exactValue(map, child, 0)
  }
  return values
}
