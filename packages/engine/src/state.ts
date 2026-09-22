import { OP_COUNT } from './dice.ts'
import {
  type CompiledMap,
  META_CHAIN_SUM,
  META_FILLED,
  META_FILLED_MASK,
  META_FRONTIER,
  META_MAX_CHAIN,
  META_MAX_ZONE,
  META_ORPHANS,
  META_SAD,
  META_ZONE_SUM,
} from './map.ts'

/**
 * Game state: one flat Int32Array, laid out by `CompiledMap` offsets.
 *
 *   VAL[n]    -1 empty · 0..12 number · 13 (SAD) over-limit mark ☹
 *   UP[n]     cell linked as the next value of the rope path (v + 1), or -1
 *   DOWN[n]   cell linked as the previous value (v - 1), or -1
 *   END[n]    for a chain end: the opposite end; for an unlinked cell: itself; interior: stale
 *   ZID[n]    zone label (root cell index), -1 for empty/SAD cells
 *   ZSIZE[n]  zone size, valid at the root
 *   TICKS[5]  boxes ticked per operation
 *   META[9]   filled count, chain/zone sums, maxima, sad/orphan counts, bitmasks
 *
 * The core (VAL, UP, DOWN, TICKS) fully determines the rest; `rebuildDerived` recomputes it.
 * States are cheap to copy (`state.slice()`), so there is no undo: copy, then apply.
 */
export type State = Int32Array

export const EMPTY = -1
export const SAD = 13
export const MAX_VALUE = 12

export function isNumber(v: number): boolean {
  return v >= 0 && v <= MAX_VALUE
}

export function createState(map: CompiledMap): State {
  const s = new Int32Array(map.stateSize)
  s.fill(-1, map.oVal, map.oZsize) // VAL, UP, DOWN, END, ZID
  s.fill(0, map.oZsize, map.stateSize) // ZSIZE, TICKS, META (frontier is empty: turn 1 may go anywhere)
  return s
}

export function cloneState(s: State): State {
  return s.slice()
}

/** Size bonus for the longest rope path and the largest zone (rulebook table). */
export function bonusFor(size: number): number {
  if (size < 3) return 0
  if (size <= 9) return [1, 3, 6, 10, 15, 20, 25][size - 3]
  return 25 + 5 * (size - 9)
}

/** Points of one rope path from its min and max values (values are consecutive, so len = max - min + 1). */
export function chainPoints(min: number, max: number): number {
  return max > min ? 2 * max - min : 0
}

/** Points of one zone of `size` cells holding `value`. */
export function zonePoints(value: number, size: number): number {
  return size >= 2 ? value + size - 1 : 0
}

export const SAD_PENALTY = 3

export function filledCount(map: CompiledMap, s: State): number {
  return s[map.oMeta + META_FILLED]
}

export function isGameOver(map: CompiledMap, s: State): boolean {
  return s[map.oMeta + META_FILLED] === map.n
}

/** Current total, as it would be counted on the paper sheet if the game stopped now. */
export function currentScore(map: CompiledMap, s: State): number {
  const m = map.oMeta
  return (
    s[m + META_CHAIN_SUM] +
    bonusFor(s[m + META_MAX_CHAIN]) +
    s[m + META_ZONE_SUM] +
    bonusFor(s[m + META_MAX_ZONE]) -
    SAD_PENALTY * (s[m + META_SAD] + s[m + META_ORPHANS])
  )
}

export function cellValue(map: CompiledMap, s: State, cell: number): number {
  return s[map.oVal + cell]
}

export function ticksUsed(map: CompiledMap, s: State, op: number): number {
  return s[map.oTicks + op]
}

export function opAvailable(map: CompiledMap, s: State, op: number): boolean {
  return s[map.oTicks + op] < map.opLimits[op]
}

/** Bitmask of the cells a number may be written in right now. */
export function legalCellMask(map: CompiledMap, s: State): number {
  return s[map.oMeta + META_FILLED] === 0 ? map.allMask : s[map.oMeta + META_FRONTIER]
}

function isOrphanCell(map: CompiledMap, s: State, c: number): boolean {
  const v = s[map.oVal + c]
  return (
    isNumber(v) &&
    s[map.oUp + c] === EMPTY &&
    s[map.oDown + c] === EMPTY &&
    s[map.oZsize + s[map.oZid + c]] === 1
  )
}

/** Recomputes END, ZID, ZSIZE and every META slot from VAL, UP, DOWN and TICKS. */
export function rebuildDerived(map: CompiledMap, s: State): void {
  const n = map.n
  const { oVal, oUp, oDown, oEnd, oZid, oZsize, oMeta } = map

  let filled = 0
  let filledMask = 0
  let frontier = 0
  let sad = 0
  for (let c = 0; c < n; c++) {
    const v = s[oVal + c]
    if (v === EMPTY) continue
    filled++
    filledMask |= 1 << c
    frontier |= map.nbrMask[c] // a ☹ is a filled circle too (docs/RULES.md)
    if (v === SAD) sad++
  }
  frontier &= ~filledMask

  // Chains: walk up from every bottom end. Maxima only count scoring structures (size >= 2).
  let chainSum = 0
  let maxChain = 0
  s.fill(-1, oEnd, oEnd + n)
  for (let c = 0; c < n; c++) {
    if (!isNumber(s[oVal + c]) || s[oDown + c] !== EMPTY) continue
    let top = c
    while (s[oUp + top] !== EMPTY) top = s[oUp + top]
    s[oEnd + c] = top
    s[oEnd + top] = c
    const min = s[oVal + c]
    const max = s[oVal + top]
    if (max === min) continue
    chainSum += chainPoints(min, max)
    if (max - min + 1 > maxChain) maxChain = max - min + 1
  }

  // Zones: flood fill over equal values.
  let zoneSum = 0
  let maxZone = 0
  s.fill(-1, oZid, oZid + n)
  s.fill(0, oZsize, oZsize + n)
  for (let root = 0; root < n; root++) {
    const v = s[oVal + root]
    if (!isNumber(v) || s[oZid + root] !== -1) continue
    let size = 0
    const stack = [root]
    s[oZid + root] = root
    while (stack.length > 0) {
      const c = stack.pop() as number
      size++
      for (let i = map.nbrStart[c]; i < map.nbrStart[c + 1]; i++) {
        const nb = map.nbrList[i]
        if (s[oVal + nb] === v && s[oZid + nb] === -1) {
          s[oZid + nb] = root
          stack.push(nb)
        }
      }
    }
    s[oZsize + root] = size
    if (size < 2) continue
    zoneSum += zonePoints(v, size)
    if (size > maxZone) maxZone = size
  }

  let orphans = 0
  for (let c = 0; c < n; c++) if (isOrphanCell(map, s, c)) orphans++

  s[oMeta + META_FILLED] = filled
  s[oMeta + META_CHAIN_SUM] = chainSum
  s[oMeta + META_ZONE_SUM] = zoneSum
  s[oMeta + META_MAX_CHAIN] = maxChain
  s[oMeta + META_MAX_ZONE] = maxZone
  s[oMeta + META_SAD] = sad
  s[oMeta + META_ORPHANS] = orphans
  s[oMeta + META_FILLED_MASK] = filledMask
  s[oMeta + META_FRONTIER] = frontier
}

/** The part of the state that is serialised: VAL, UP, DOWN, TICKS. */
export function coreOf(map: CompiledMap, s: State): Int32Array {
  const core = new Int32Array(3 * map.n + OP_COUNT)
  core.set(s.subarray(map.oVal, map.oEnd), 0)
  core.set(s.subarray(map.oTicks, map.oTicks + OP_COUNT), 3 * map.n)
  return core
}

export function stateFromCore(map: CompiledMap, core: Int32Array): State {
  const s = createState(map)
  s.set(core.subarray(0, 3 * map.n), map.oVal)
  s.set(core.subarray(3 * map.n, 3 * map.n + OP_COUNT), map.oTicks)
  rebuildDerived(map, s)
  return s
}
