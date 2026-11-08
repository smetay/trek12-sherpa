import {
  applyMove,
  type CompiledMap,
  createState,
  currentScore,
  EMPTY,
  generateMoves,
  MAX_MOVES,
  META_FILLED,
  META_FILLED_MASK,
  type Move,
  moveCell,
  moveResult,
  OP_COUNT,
  RESULTS,
  Rng,
  ROLL_COUNT,
  rollRed,
  rollYellow,
  SAD,
  type State,
} from '@trek12/engine'
import type { Rolls } from '../hindsight/line.ts'

/**
 * A finished paper sheet: `target[c]` is what circle c holds — a number 0..12 or SAD (13) for ☹.
 * The paper does not say in which order the circles were filled; `SheetReconstructor` finds the
 * orders compatible with the dice, which is what a post-game review needs.
 *
 * Rope links never decide whether a move is legal (only which links it draws), so the existence of
 * a completion only depends on the filled circles and the ticked boxes: a small DP over
 * (filled mask, ticks) with memoisation and a matching-based cut.
 */
export type TargetSheet = ArrayLike<number>

export type SheetDiagnosis = {
  /** At least one legal order of play produces exactly this sheet with these dice. */
  feasible: boolean
  /** Circles whose number no roll of the game can produce (whatever the operation). */
  impossible: number[]
  /** Circles left without a roll in a maximum turn ↔ circle matching (too many of some number). */
  unmatched: number[]
  /** When the counts work but no order does: circles whose number, if wrong, would explain it. */
  suspects: number[]
}

/** Number or ☹ that writing `result` produces in a circle with limit `max`. */
function codeFor(result: number, max: number): number {
  return result > max ? SAD : result
}

const moveBuf = new Int32Array(MAX_MOVES)

export class SheetReconstructor {
  readonly map: CompiledMap
  readonly rolls: Rolls
  readonly target: Int8Array
  /** canMake[t] = bitmask of the circles whose number turn t can produce with some operation. */
  private readonly canMake: Int32Array
  /** opsFor[t * n + c] = bitmask of the operations of turn t that produce circle c's number. */
  private readonly opsFor: Uint8Array
  private readonly memo = new Map<number, boolean>()
  private readonly countMemo = new Map<number, number>()

  constructor(map: CompiledMap, rolls: Rolls, target: TargetSheet) {
    if (rolls.length < map.n) throw new RangeError(`need ${map.n} rolls, got ${rolls.length}`)
    this.map = map
    this.rolls = rolls
    this.target = Int8Array.from({ length: map.n }, (_, c) => target[c])
    const n = map.n
    this.canMake = new Int32Array(n)
    this.opsFor = new Uint8Array(n * n)
    for (let t = 0; t < n; t++) {
      for (let c = 0; c < n; c++) {
        let ops = 0
        for (let op = 0; op < OP_COUNT; op++) {
          const v = RESULTS[op * ROLL_COUNT + rolls[t]]
          if (codeFor(v, map.cellMax[c]) === this.target[c]) ops |= 1 << op
        }
        this.opsFor[t * n + c] = ops
        if (ops !== 0) this.canMake[t] |= 1 << c
      }
    }
  }

  /** Bitmask of the turns ≥ `from` (bit t) — helper for the matching. */
  private maxMatching(cellsMask: number, from: number, matchOut?: Int32Array): number {
    const n = this.map.n
    // matchTurn[t] = circle matched to turn t, or -1.
    const matchTurn = new Int32Array(n).fill(-1)
    let size = 0
    for (let c = 0; c < n; c++) {
      if ((cellsMask & (1 << c)) === 0) continue
      const seen = new Uint8Array(n)
      if (this.augment(c, from, seen, matchTurn)) size++
    }
    if (matchOut) matchOut.set(matchTurn)
    return size
  }

  private augment(c: number, from: number, seen: Uint8Array, matchTurn: Int32Array): boolean {
    const n = this.map.n
    for (let t = from; t < n; t++) {
      if (seen[t] || (this.canMake[t] & (1 << c)) === 0) continue
      seen[t] = 1
      if (matchTurn[t] === -1 || this.augment(matchTurn[t], from, seen, matchTurn)) {
        matchTurn[t] = c
        return true
      }
    }
    return false
  }

  private static key(mask: number, ticks: number): number {
    return mask * 32768 + ticks
  }

  /** Can turns `t..n-1` fill the empty circles of `mask` with their target numbers? */
  private feasible(mask: number, frontier: number, ticks: number, t: number): boolean {
    const n = this.map.n
    if (t === n) return true
    const key = SheetReconstructor.key(mask, ticks)
    const hit = this.memo.get(key)
    if (hit !== undefined) return hit
    const empty = this.map.allMask & ~mask
    let ok = this.maxMatching(empty, t) === n - t
    if (ok) {
      ok = false
      const allowed = t === 0 ? this.map.allMask : frontier
      for (let c = 0; c < n && !ok; c++) {
        if ((allowed & (1 << c)) === 0 || (mask & (1 << c)) !== 0) continue
        const ops = this.opsFor[t * n + c]
        for (let op = 0; op < OP_COUNT && !ok; op++) {
          if ((ops & (1 << op)) === 0) continue
          const used = (ticks >> (3 * op)) & 7
          if (used >= this.map.opLimits[op]) continue
          const nextMask = mask | (1 << c)
          const nextFrontier = (frontier | this.map.nbrMask[c]) & ~nextMask
          ok = this.feasible(nextMask, nextFrontier, ticks + (1 << (3 * op)), t + 1)
        }
      }
    }
    this.memo.set(key, ok)
    return ok
  }

  private static packTicks(map: CompiledMap, s: State): number {
    let ticks = 0
    for (let op = 0; op < OP_COUNT; op++) ticks |= s[map.oTicks + op] << (3 * op)
    return ticks
  }

  /** Whether the sheet `s` (filled so far consistently with the target) can still be completed. */
  feasibleFrom(s: State): boolean {
    const map = this.map
    for (let c = 0; c < map.n; c++) {
      const v = s[map.oVal + c]
      if (v !== EMPTY && v !== this.target[c]) return false
    }
    const mask = s[map.oMeta + META_FILLED_MASK]
    let frontier = 0
    for (let c = 0; c < map.n; c++) if (mask & (1 << c)) frontier |= map.nbrMask[c]
    frontier &= ~mask
    return this.feasible(
      mask,
      frontier,
      SheetReconstructor.packTicks(map, s),
      s[map.oMeta + META_FILLED],
    )
  }

  /**
   * Legal moves of the next turn that write the target number and keep a completion possible.
   * Link variants are distinct moves (they matter for the score, not for legality).
   */
  candidates(s: State): Move[] {
    const map = this.map
    const t = s[map.oMeta + META_FILLED]
    if (t >= map.n) return []
    const roll = this.rolls[t]
    const count = generateMoves(map, s, rollYellow(roll), rollRed(roll), moveBuf)
    const out: Move[] = []
    const child = new Int32Array(s.length)
    const okCell = new Map<string, boolean>()
    for (let i = 0; i < count; i++) {
      const m = moveBuf[i]
      const cell = moveCell(m)
      if (codeFor(moveResult(m), map.cellMax[cell]) !== this.target[cell]) continue
      // Feasibility depends on (cell, op) only: test once per pair.
      const pairKey = `${cell}:${(m >> 5) & 7}`
      let ok = okCell.get(pairKey)
      if (ok === undefined) {
        child.set(s)
        // Cheap structural update: ticks, filled mask and frontier are all that feasibility reads.
        const op = (m >> 5) & 7
        child[map.oTicks + op]++
        const mask = s[map.oMeta + META_FILLED_MASK] | (1 << cell)
        let frontier = 0
        for (let c = 0; c < map.n; c++) if (mask & (1 << c)) frontier |= map.nbrMask[c]
        frontier &= ~mask
        ok = this.feasible(mask, frontier, SheetReconstructor.packTicks(map, child), t + 1)
        okCell.set(pairKey, ok)
      }
      if (ok) out.push(m)
    }
    return out
  }

  /**
   * Number of distinct orders of play (turn → circle, operation; links ignored) that produce the
   * sheet, saturated at `cap`.
   */
  countOrders(cap = 1_000_000): number {
    this.countMemo.clear()
    return Math.min(cap, this.count(0, 0, 0, 0, cap))
  }

  private count(mask: number, frontier: number, ticks: number, t: number, cap: number): number {
    const n = this.map.n
    if (t === n) return 1
    const key = SheetReconstructor.key(mask, ticks)
    const hit = this.countMemo.get(key)
    if (hit !== undefined) return hit
    let total = 0
    if (this.feasible(mask, frontier, ticks, t)) {
      const allowed = t === 0 ? this.map.allMask : frontier
      for (let c = 0; c < n && total < cap; c++) {
        if ((allowed & (1 << c)) === 0 || (mask & (1 << c)) !== 0) continue
        const ops = this.opsFor[t * n + c]
        for (let op = 0; op < OP_COUNT; op++) {
          if ((ops & (1 << op)) === 0) continue
          if (((ticks >> (3 * op)) & 7) >= this.map.opLimits[op]) continue
          const nextMask = mask | (1 << c)
          total += this.count(
            nextMask,
            (frontier | this.map.nbrMask[c]) & ~nextMask,
            ticks + (1 << (3 * op)),
            t + 1,
            cap,
          )
        }
      }
    }
    total = Math.min(total, cap)
    this.countMemo.set(key, total)
    return total
  }

  /**
   * Scores this sheet can have under the rules. The numbers are fixed, but the rope links depend on
   * the order of play, so different compatible orders can end with different totals. Samples random
   * orders (plus one taking the best links greedily) and returns the distinct totals seen, sorted.
   * Used to check a player's own count without blaming a total that another order would justify.
   */
  sampleScores(samples = 32, seed = 1): number[] {
    const map = this.map
    if (!this.feasibleFrom(createState(map))) return []
    const rng = new Rng(seed)
    const seen = new Set<number>()
    const child = new Int32Array(map.stateSize)
    for (let k = 0; k <= samples; k++) {
      const s = createState(map)
      for (let t = 0; t < map.n; t++) {
        const candidates = this.candidates(s)
        let pick = candidates[rng.nextInt(candidates.length)]
        if (k === 0) {
          // First pass: the best immediate total at every turn (usually the best links).
          let best = -Infinity
          for (const m of candidates) {
            child.set(s)
            applyMove(map, child, m)
            const sc = currentScore(map, child)
            if (sc > best) {
              best = sc
              pick = m
            }
          }
        }
        applyMove(map, s, pick)
      }
      seen.add(currentScore(map, s))
    }
    return [...seen].sort((a, b) => a - b)
  }

  /** Why the sheet cannot be reached (or confirmation that it can). */
  diagnose(): SheetDiagnosis {
    const map = this.map
    const n = map.n
    const feasible = this.feasible(0, 0, 0, 0)
    const impossible: number[] = []
    for (let c = 0; c < n; c++) {
      let any = false
      for (let t = 0; t < n; t++) if (this.canMake[t] & (1 << c)) any = true
      if (!any) impossible.push(c)
    }
    const matchTurn = new Int32Array(n)
    this.maxMatching(map.allMask, 0, matchTurn)
    const matched = new Set<number>()
    for (let t = 0; t < n; t++) if (matchTurn[t] >= 0) matched.add(matchTurn[t])
    const unmatched: number[] = []
    for (let c = 0; c < n; c++) if (!matched.has(c) && !impossible.includes(c)) unmatched.push(c)

    const suspects: number[] = []
    if (!feasible && impossible.length === 0 && unmatched.length === 0) {
      // Order or box problem: which single circle, if it could hold anything, unlocks the sheet?
      for (let c = 0; c < n; c++) {
        const relaxed = new SheetReconstructor(map, this.rolls, this.target)
        relaxed.wildcard(c)
        if (relaxed.feasible(0, 0, 0, 0)) suspects.push(c)
      }
    }
    return { feasible, impossible, unmatched, suspects }
  }

  /** Lets circle `c` hold whatever any operation produces (diagnosis only). */
  private wildcard(c: number): void {
    const n = this.map.n
    for (let t = 0; t < n; t++) {
      this.opsFor[t * n + c] = (1 << OP_COUNT) - 1
      this.canMake[t] |= 1 << c
    }
    this.memo.clear()
  }
}
