import {
  applyMove,
  type CompiledMap,
  currentScore,
  generateMoves,
  MAX_MOVES,
  META_FILLED,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'
import type { Line, Rolls } from './line.ts'
import { childHash, hashKey, hashState, zobristFor } from './zobrist.ts'

/** Thrown internally when the node budget is exhausted. */
class Budget extends Error {}

const MOVE_SPAN = 1 << 23
const OFFSET = 1024
/** A JavaScript Map holds at most 2^24 entries; stay well below. */
export const EXACT_MAX_NODES = 8_000_000

/**
 * Exact best completion of `start` for the known rolls: depth-first search over every legal move
 * with a transposition table (two move orders reaching the same sheet are solved once). The cost
 * grows quickly with the number of empty circles; `maxNodes` bounds it and `null` is returned when
 * it is exceeded. Used to prove the last turns of a line optimal and, on small maps, as the ground
 * truth the heuristic searches are tested against.
 */
export function solveExact(
  map: CompiledMap,
  rolls: Rolls,
  start: State,
  maxNodes = 2_000_000,
): Line | null {
  maxNodes = Math.min(maxNodes, EXACT_MAX_NODES)
  const n = map.n
  const turn0 = start[map.oMeta + META_FILLED]
  const depth = n - turn0
  const z = zobristFor(map)
  // One entry per solved position: (score + OFFSET) * 2^23 + best move (moves fit in 23 bits).
  const memo = new Map<number, number>()
  const states: State[] = []
  const buffers: Int32Array[] = []
  for (let d = 0; d <= depth; d++) {
    states.push(new Int32Array(start.length))
    buffers.push(new Int32Array(MAX_MOVES))
  }
  const tmp = new Int32Array(2)
  let nodes = 0

  const search = (d: number, h1: number, h2: number): number => {
    const s = states[d]
    if (d === depth) return currentScore(map, s)
    const key = hashKey(h1, h2)
    const hit = memo.get(key)
    if (hit !== undefined) return Math.floor(hit / MOVE_SPAN) - OFFSET
    if (++nodes > maxNodes) throw new Budget()
    const roll = rolls[turn0 + d]
    const moves = buffers[d]
    const count = generateMoves(map, s, rollYellow(roll), rollRed(roll), moves)
    const child = states[d + 1]
    let best = -Infinity
    let arg = moves[0]
    for (let i = 0; i < count; i++) {
      childHash(z, map, s, h1, h2, moves[i], tmp)
      child.set(s)
      applyMove(map, child, moves[i])
      const v = search(d + 1, tmp[0], tmp[1])
      if (v > best) {
        best = v
        arg = moves[i]
      }
    }
    memo.set(key, (best + OFFSET) * MOVE_SPAN + arg)
    return best
  }

  states[0].set(start)
  hashState(z, map, start, tmp)
  let score: number
  try {
    score = search(0, tmp[0], tmp[1])
  } catch (error) {
    if (error instanceof Budget) return null
    throw error
  }
  // Walk the stored best moves.
  const moves = new Int32Array(depth)
  const s = start.slice()
  const h = new Int32Array(2)
  hashState(z, map, s, h)
  for (let d = 0; d < depth; d++) {
    const m = (memo.get(hashKey(h[0], h[1])) as number) % MOVE_SPAN
    moves[d] = m
    childHash(z, map, s, h[0], h[1], m, tmp)
    h.set(tmp)
    applyMove(map, s, m)
  }
  return { moves, score }
}
