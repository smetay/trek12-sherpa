import {
  applyMove,
  type CompiledMap,
  createState,
  currentScore,
  generateMoves,
  MAX_MOVES,
  META_FILLED,
  Rng,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'
import type { Line, Rolls } from './line.ts'
import { DEFAULT_POTENTIAL, evaluate, type PotentialWeights } from './potential.ts'
import { childHash, hashKey, hashState, zobristFor } from './zobrist.ts'

export type BeamOptions = {
  /** Positions kept per turn. */
  width: number
  seed?: number
  weights?: PotentialWeights
  /** Search from this position instead of the empty sheet (its turn = number of filled circles). */
  start?: State
  /** Uniform random perturbation of the ranking key, in points (diversified restarts). */
  noise?: number
}

const moveBuf = new Int32Array(MAX_MOVES)
const hashOut = new Int32Array(2)

/** Value of the k-th largest of a[0..count) (1-based k), by quickselect on a scratch copy. */
function kthLargest(a: Float64Array, count: number, k: number, tmp: Float64Array): number {
  tmp.set(a.subarray(0, count))
  let lo = 0
  let hi = count - 1
  const target = k - 1
  while (lo < hi) {
    const pivot = tmp[(lo + hi) >> 1]
    let i = lo
    let j = hi
    while (i <= j) {
      while (tmp[i] > pivot) i++
      while (tmp[j] < pivot) j--
      if (i <= j) {
        const x = tmp[i]
        tmp[i] = tmp[j]
        tmp[j] = x
        i++
        j--
      }
    }
    if (target <= j) hi = j
    else if (target >= i) lo = i
    else break
  }
  return tmp[target]
}

/**
 * Beam search over a known roll sequence: every turn, all children of the kept positions are
 * generated, transpositions merged (Zobrist keys), and the `width` best by `evaluate` survive.
 * Deterministic for a given seed. Returns the best complete line from the start position.
 */
export function beamSearch(map: CompiledMap, rolls: Rolls, opts: BeamOptions): Line {
  const n = map.n
  const S = map.stateSize
  const width = Math.max(1, opts.width)
  const w = opts.weights ?? DEFAULT_POTENTIAL
  const noise = opts.noise ?? 0
  const rng = new Rng(opts.seed ?? 1)
  const z = zobristFor(map)
  const start = opts.start ?? createState(map)
  const turn0 = start[map.oMeta + META_FILLED]
  const levels = n - turn0
  if (levels <= 0) return { moves: new Int32Array(0), score: currentScore(map, start) }

  let cur = new Int32Array(width * S)
  let next = new Int32Array(width * S)
  let curH1 = new Int32Array(width)
  let curH2 = new Int32Array(width)
  let nextH1 = new Int32Array(width)
  let nextH2 = new Int32Array(width)
  cur.set(start, 0)
  hashState(z, map, start, hashOut)
  curH1[0] = hashOut[0]
  curH2[0] = hashOut[1]
  let curCount = 1

  const lvParent: Int32Array[] = []
  const lvMove: Int32Array[] = []

  let cap = width * 48
  let cEval = new Float64Array(cap)
  let cParent = new Int32Array(cap)
  let cMove = new Int32Array(cap)
  let cH1 = new Int32Array(cap)
  let cH2 = new Int32Array(cap)
  let tmp = new Float64Array(cap)
  const seen = new Map<number, number>()
  const child = new Int32Array(S)
  const parent = new Int32Array(S)
  const pick = new Int32Array(width)

  for (let level = 0; level < levels; level++) {
    const turn = turn0 + level
    const roll = rolls[turn]
    const y = rollYellow(roll)
    const r = rollRed(roll)
    let count = 0
    seen.clear()
    for (let p = 0; p < curCount; p++) {
      parent.set(cur.subarray(p * S, p * S + S))
      const m = generateMoves(map, parent, y, r, moveBuf)
      for (let i = 0; i < m; i++) {
        const move = moveBuf[i]
        childHash(z, map, parent, curH1[p], curH2[p], move, hashOut)
        const key = hashKey(hashOut[0], hashOut[1])
        if (seen.has(key)) continue
        seen.set(key, count)
        child.set(parent)
        applyMove(map, child, move)
        if (count === cap) {
          cap *= 2
          const grow = <T extends Int32Array | Float64Array>(a: T, make: (len: number) => T) => {
            const b = make(cap)
            b.set(a)
            return b
          }
          cEval = grow(cEval, (len) => new Float64Array(len))
          cParent = grow(cParent, (len) => new Int32Array(len))
          cMove = grow(cMove, (len) => new Int32Array(len))
          cH1 = grow(cH1, (len) => new Int32Array(len))
          cH2 = grow(cH2, (len) => new Int32Array(len))
          tmp = new Float64Array(cap)
        }
        // A tiny jitter breaks the many exact ties without favouring low move or cell indices.
        cEval[count] = evaluate(map, child, rolls, turn + 1, w) + (noise + 1e-6) * rng.nextFloat()
        cParent[count] = p
        cMove[count] = move
        cH1[count] = hashOut[0]
        cH2[count] = hashOut[1]
        count++
      }
    }

    // Keep the `width` best children.
    let kept = 0
    if (count <= width) {
      for (let i = 0; i < count; i++) pick[kept++] = i
    } else {
      const thr = kthLargest(cEval, count, width, tmp)
      for (let i = 0; i < count && kept < width; i++) if (cEval[i] > thr) pick[kept++] = i
      for (let i = 0; i < count && kept < width; i++) if (cEval[i] === thr) pick[kept++] = i
    }
    const parents = new Int32Array(kept)
    const movesKept = new Int32Array(kept)
    for (let k = 0; k < kept; k++) {
      const c = pick[k]
      const p = cParent[c]
      next.set(cur.subarray(p * S, p * S + S), k * S)
      applyMove(map, next.subarray(k * S, k * S + S), cMove[c])
      nextH1[k] = cH1[c]
      nextH2[k] = cH2[c]
      parents[k] = p
      movesKept[k] = cMove[c]
    }
    lvParent.push(parents)
    lvMove.push(movesKept)
    ;[cur, next] = [next, cur]
    ;[curH1, nextH1] = [nextH1, curH1]
    ;[curH2, nextH2] = [nextH2, curH2]
    curCount = kept
  }

  // Best complete position, then walk the parent pointers back.
  let best = 0
  let bestScore = -Infinity
  for (let k = 0; k < curCount; k++) {
    const sc = currentScore(map, cur.subarray(k * S, k * S + S))
    if (sc > bestScore) {
      bestScore = sc
      best = k
    }
  }
  const moves = new Int32Array(levels)
  let slot = best
  for (let level = levels - 1; level >= 0; level--) {
    moves[level] = lvMove[level][slot]
    slot = lvParent[level][slot]
  }
  return { moves, score: bestScore }
}
