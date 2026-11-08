import {
  type CompiledMap,
  EMPTY,
  type Move,
  mix32,
  moveCell,
  moveDown,
  moveOp,
  moveResult,
  moveUp,
  OP_COUNT,
  SAD,
  type State,
} from '@trek12/engine'

/**
 * Zobrist hashing of a sheet's core (numbers, rope links, ticks), updated incrementally by a move.
 * Two independent 32-bit tables give a 53-bit key, enough to deduplicate millions of positions
 * reached by different move orders (transpositions) with a negligible collision risk.
 */
export type Zobrist = {
  n: number
  /** value tables, index cell * 14 + code (0..12 or SAD = 13) */
  v1: Int32Array
  v2: Int32Array
  /** link tables, index lower * n + upper (UP[lower] = upper) */
  l1: Int32Array
  l2: Int32Array
  /** tick tables, index op * 16 + ticks used */
  t1: Int32Array
  t2: Int32Array
}

const TICK_SLOTS = 16

const cache = new Map<number, Zobrist>()

export function zobristFor(map: CompiledMap): Zobrist {
  const n = map.n
  const hit = cache.get(n)
  if (hit) return hit
  const fill = (len: number, salt: number) => {
    const a = new Int32Array(len)
    for (let i = 0; i < len; i++) a[i] = mix32(i, salt, 0x2b5ec7) | 0
    return a
  }
  const z: Zobrist = {
    n,
    v1: fill(n * 14, 1),
    v2: fill(n * 14, 2),
    l1: fill(n * n, 3),
    l2: fill(n * n, 4),
    t1: fill(OP_COUNT * TICK_SLOTS, 5),
    t2: fill(OP_COUNT * TICK_SLOTS, 6),
  }
  cache.set(n, z)
  return z
}

/** 53-bit integer key from the two halves (exact in a double, usable as a Map key). */
export function hashKey(h1: number, h2: number): number {
  return (h1 >>> 0) * 2097152 + (h2 >>> 11)
}

/** Hash of `s` from scratch, written to out[0], out[1]. */
export function hashState(z: Zobrist, map: CompiledMap, s: State, out: Int32Array): void {
  const n = map.n
  let h1 = 0
  let h2 = 0
  for (let c = 0; c < n; c++) {
    const v = s[map.oVal + c]
    if (v !== EMPTY) {
      h1 ^= z.v1[c * 14 + v]
      h2 ^= z.v2[c * 14 + v]
    }
    const up = s[map.oUp + c]
    if (up !== EMPTY) {
      h1 ^= z.l1[c * n + up]
      h2 ^= z.l2[c * n + up]
    }
  }
  for (let op = 0; op < OP_COUNT; op++) {
    const k = op * TICK_SLOTS + s[map.oTicks + op]
    h1 ^= z.t1[k]
    h2 ^= z.t2[k]
  }
  out[0] = h1
  out[1] = h2
}

/** Hash of the child of `parent` (hash h1/h2) after `move`, written to out[0], out[1]. */
export function childHash(
  z: Zobrist,
  map: CompiledMap,
  parent: State,
  h1: number,
  h2: number,
  move: Move,
  out: Int32Array,
): void {
  const n = z.n
  const cell = moveCell(move)
  const op = moveOp(move)
  const result = moveResult(move)
  const code = result > map.cellMax[cell] ? SAD : result
  h1 ^= z.v1[cell * 14 + code]
  h2 ^= z.v2[cell * 14 + code]
  const down = moveDown(move)
  if (down !== EMPTY) {
    h1 ^= z.l1[down * n + cell]
    h2 ^= z.l2[down * n + cell]
  }
  const up = moveUp(move)
  if (up !== EMPTY) {
    h1 ^= z.l1[cell * n + up]
    h2 ^= z.l2[cell * n + up]
  }
  const used = parent[map.oTicks + op]
  h1 ^= z.t1[op * TICK_SLOTS + used] ^ z.t1[op * TICK_SLOTS + used + 1]
  h2 ^= z.t2[op * TICK_SLOTS + used] ^ z.t2[op * TICK_SLOTS + used + 1]
  out[0] = h1
  out[1] = h2
}
