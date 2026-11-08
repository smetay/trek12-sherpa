import {
  type CompiledMap,
  currentScore,
  EMPTY,
  isNumber,
  MAX_VALUE,
  OP_COUNT,
  RESULTS,
  ROLL_COUNT,
  type State,
} from '@trek12/engine'
import type { Rolls } from './line.ts'

/**
 * Weights of the clairvoyant evaluation. Each feature is the value of an open opportunity on the
 * sheet, discounted by how often the *known* remaining rolls can still produce the number it needs.
 */
export type PotentialWeights = {
  /** Orphan with a free neighbour that a remaining roll can rescue (worth the 3-point refund). */
  rescue: number
  /** Chain end that can still grow upwards (+2 per step) … */
  up: number
  /** … or downwards (+1 per step). */
  down: number
  /** Number that can still grow a zone. */
  zone: number
  /** Dangerous circle still empty while few remaining rolls can produce a number ≤ 6. */
  danger: number
}

/**
 * Hand-set, not tuned: the beam only provides the starting line, and the tempering that follows
 * does the real work (docs/BENCHMARKS.md, clairvoyant maximum).
 */
export const DEFAULT_POTENTIAL: PotentialWeights = {
  rescue: 0.75,
  up: 0.5,
  down: 0.5,
  zone: 0.5,
  danger: 1,
}

const avail = new Int32Array(MAX_VALUE + 2)
/** Saturating credit for `a` remaining rolls able to produce a number: 0, 0.5, 0.75, 0.875 … */
const SAT = Float64Array.from({ length: 32 }, (_, a) => 1 - 0.5 ** a)

/**
 * Current score plus the open opportunities, given that turns `turn..n-1` will roll `rolls[turn..]`.
 * Comparable between positions at the same turn (the beam's ranking key); exact when the sheet is full.
 */
export function evaluate(
  map: CompiledMap,
  s: State,
  rolls: Rolls,
  turn: number,
  w: PotentialWeights,
): number {
  const n = map.n
  let value = currentScore(map, s)
  if (turn >= n) return value

  // How many remaining turns can produce each number with an operation that still has boxes.
  avail.fill(0)
  let mask = 0
  for (let op = 0; op < OP_COUNT; op++) if (s[map.oTicks + op] < map.opLimits[op]) mask |= 1 << op
  let small = 0
  for (let t = turn; t < n; t++) {
    const roll = rolls[t]
    let hit = 0
    for (let op = 0; op < OP_COUNT; op++) {
      if ((mask & (1 << op)) === 0) continue
      const v = RESULTS[op * ROLL_COUNT + roll]
      if (v <= MAX_VALUE) hit |= 1 << v
    }
    for (let v = 0; v <= MAX_VALUE; v++) if (hit & (1 << v)) avail[v]++
    if (hit & 0x7f) small++
  }

  const { oVal, oUp, oDown, oZid, oZsize, nbrStart, nbrList } = map
  let dangerousEmpty = 0
  for (let c = 0; c < n; c++) {
    const v = s[oVal + c]
    if (v === EMPTY) {
      if (map.cellMax[c] < MAX_VALUE) dangerousEmpty++
      continue
    }
    if (!isNumber(v)) continue
    let free = false
    for (let i = nbrStart[c]; i < nbrStart[c + 1]; i++) {
      if (s[oVal + nbrList[i]] === EMPTY) {
        free = true
        break
      }
    }
    if (!free) continue
    const upFree = s[oUp + c] === EMPTY && v < MAX_VALUE
    const downFree = s[oDown + c] === EMPTY && v > 0
    const lonely = s[oZsize + s[oZid + c]] === 1
    if (!upFree && !downFree && !lonely) continue
    const aUp = upFree ? avail[v + 1] : 0
    const aDown = downFree ? avail[v - 1] : 0
    const aSame = avail[v]
    if (lonely && s[oUp + c] === EMPTY && s[oDown + c] === EMPTY) {
      value += w.rescue * 3 * SAT[Math.min(31, aUp + aDown + aSame)]
    }
    if (upFree) value += w.up * 2 * SAT[Math.min(31, aUp)]
    if (downFree) value += w.down * SAT[Math.min(31, aDown)]
    value += w.zone * SAT[Math.min(31, aSame)]
  }
  if (dangerousEmpty > small) value -= w.danger * 3 * (dangerousEmpty - small)
  return value
}
