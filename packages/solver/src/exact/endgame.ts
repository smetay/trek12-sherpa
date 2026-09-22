import {
  applyMove,
  BRANCHES,
  type CompiledMap,
  currentScore,
  EMPTY,
  generateMoves,
  isGameOver,
  MAX_MOVES,
  META_FILLED,
  OP_COUNT,
  opAvailable,
  placementMoves,
  RESULTS,
  ROLL_COUNT,
  rollRed,
  rollYellow,
  SAD,
  type State,
} from '@trek12/engine'

/** Empty cells (after the candidate move) up to which the root is solved exactly. */
export const EXACT_EMPTY_LIMIT = 3
/** With 3 empty cells the exact solve costs ~0.05 s per candidate: cap the field it is used on. */
export const EXACT3_MAX_CANDIDATES = 48

export function emptyCells(map: CompiledMap, s: State): number {
  return map.n - s[map.oMeta + META_FILLED]
}

const lastMoves = new Int32Array(64)
const lastChild: State[] = []
const lastTable = new Float64Array(SAD + 1)

/**
 * Exact value of a sheet with exactly one empty circle, 36 times (an integer: every roll has an
 * integer weight and every outcome an integer score).
 *
 * The last write only depends on the number that ends up in the circle (0..12 or ☹), never on the
 * operation used, so the 26 rolls × 5 operations collapse to a 14-entry table.
 */
export function lastPlyValue36(map: CompiledMap, s: State): number {
  const n = map.n
  let cell = -1
  for (let c = 0; c < n; c++) {
    if (s[map.oVal + c] === EMPTY) {
      cell = c
      break
    }
  }
  if (lastChild[0] === undefined || lastChild[0].length !== s.length)
    lastChild[0] = new Int32Array(s.length)
  const child = lastChild[0]
  const max = map.cellMax[cell]
  lastTable.fill(Number.NaN)

  let total = 0
  for (const branch of BRANCHES) {
    let best = -Infinity
    for (let op = 0; op < OP_COUNT; op++) {
      if (!opAvailable(map, s, op)) continue
      const result = RESULTS[op * ROLL_COUNT + branch.roll]
      const code = result > max ? SAD : result
      let v = lastTable[code]
      if (Number.isNaN(v)) {
        // Best link choice for this number in this circle (the operation is irrelevant here).
        const count = placementMoves(map, s, cell, op, result, lastMoves, 0)
        v = -Infinity
        for (let i = 0; i < count; i++) {
          child.set(s)
          applyMove(map, child, lastMoves[i])
          const sc = currentScore(map, child)
          if (sc > v) v = sc
        }
        lastTable[code] = v
      }
      if (v > best) best = v
    }
    total += branch.weight * best
  }
  return total
}

/** Serialised core used as a memo key: values, links and ticks fully determine the future. */
function coreKey(map: CompiledMap, s: State): string {
  return `${s.subarray(map.oVal, map.oEnd).join(',')}|${s.subarray(map.oTicks, map.oTicks + OP_COUNT).join(',')}`
}

// Per-depth scratch buffers (indexed by the number of empty cells, which strictly decreases).
const scratchStates: State[] = []
const scratchMoves: Int32Array[] = []

/**
 * Expected final score of `s` under optimal play, before the next roll — exact, no sampling.
 * The last ply uses the 14-entry table; positions with 2+ empty cells are memoised in `memo` so
 * that transpositions (same numbers written in a different order) are solved once.
 */
export function exactValue(map: CompiledMap, s: State, memo?: Map<string, number>): number {
  if (isGameOver(map, s)) return currentScore(map, s)
  const empty = emptyCells(map, s)
  if (empty === 1) return lastPlyValue36(map, s) / ROLL_COUNT

  const key = memo ? coreKey(map, s) : ''
  if (memo) {
    const hit = memo.get(key)
    if (hit !== undefined) return hit
  }
  if (scratchStates[empty] === undefined || scratchStates[empty].length !== s.length) {
    scratchStates[empty] = new Int32Array(s.length)
  }
  if (scratchMoves[empty] === undefined) scratchMoves[empty] = new Int32Array(MAX_MOVES)
  const child = scratchStates[empty]
  const moves = scratchMoves[empty]
  let total = 0
  for (const branch of BRANCHES) {
    const count = generateMoves(map, s, rollYellow(branch.roll), rollRed(branch.roll), moves)
    let best = -Infinity
    for (let i = 0; i < count; i++) {
      child.set(s)
      applyMove(map, child, moves[i])
      const v = exactValue(map, child, memo)
      if (v > best) best = v
    }
    total += branch.weight * best
  }
  const value = total / ROLL_COUNT
  memo?.set(key, value)
  return value
}

/** Exact value of each of `rootMoves[0..count)` (dice known), sharing one memo across candidates. */
export function exactRootValues(
  map: CompiledMap,
  s: State,
  rootMoves: Int32Array,
  count: number,
  memo: Map<string, number> = new Map(),
): Float64Array {
  const values = new Float64Array(count)
  const child = new Int32Array(s.length)
  for (let i = 0; i < count; i++) {
    child.set(s)
    applyMove(map, child, rootMoves[i])
    values[i] = exactValue(map, child, memo)
  }
  return values
}

/** Whether a root with `count` candidates and `emptyAfter` empty cells after each move is solved exactly. */
export function useExact(emptyAfter: number, count: number): boolean {
  if (emptyAfter <= 2) return true
  return emptyAfter <= EXACT_EMPTY_LIMIT && count <= EXACT3_MAX_CANDIDATES
}
