import {
  applyMove,
  type CompiledMap,
  createState,
  currentScore,
  legalCellMask,
  moveCell,
  moveOp,
  OP_COUNT,
  placementMoves,
  RESULTS,
  Rng,
  ROLL_COUNT,
  SAD,
  type State,
} from '@trek12/engine'
import type { Line, Rolls } from './line.ts'

/**
 * A complete game seen as a plan: on turn t, write in circle `cells[t]` with operation `ops[t]`,
 * drawing the rope links of variant `variants[t]` (only matters when several equal neighbours are
 * eligible). The numbers follow from the rolls; the plan is legal when every circle is next to an
 * earlier one and no operation is used more often than its boxes allow.
 *
 * Local search in this space is cheap — replaying a plan is 19 incremental moves — so annealing can
 * try about a million plans per second and per thread.
 */
export type Plan = { cells: Int8Array; ops: Int8Array; variants: Int8Array }

const variantBuf = new Int32Array(64)

export function planFromMoves(map: CompiledMap, rolls: Rolls, moves: Int32Array): Plan {
  const n = map.n
  const plan: Plan = { cells: new Int8Array(n), ops: new Int8Array(n), variants: new Int8Array(n) }
  const s = createState(map)
  for (let t = 0; t < n; t++) {
    const m = moves[t]
    const cell = moveCell(m)
    const op = moveOp(m)
    plan.cells[t] = cell
    plan.ops[t] = op
    const count = placementMoves(
      map,
      s,
      cell,
      op,
      RESULTS[op * ROLL_COUNT + rolls[t]],
      variantBuf,
      0,
    )
    let v = 0
    for (let i = 0; i < count; i++) if (variantBuf[i] === m) v = i
    plan.variants[t] = v
    applyMove(map, s, m)
  }
  return plan
}

/**
 * Replays turns `from..n-1` of a plan on `s` (the state before turn `from`), in place, saving the
 * state after each turn into `states` (stride `map.stateSize`, slot t + 1) and the moves into `moves`.
 * Returns the final score, or NaN if the plan is illegal from `from` on.
 */
export function replayPlan(
  map: CompiledMap,
  rolls: Rolls,
  plan: Plan,
  from: number,
  s: State,
  states: Int32Array | null,
  moves: Int32Array,
): number {
  const n = map.n
  const S = map.stateSize
  for (let t = from; t < n; t++) {
    const cell = plan.cells[t]
    const op = plan.ops[t]
    if ((legalCellMask(map, s) & (1 << cell)) === 0) return Number.NaN
    if (s[map.oTicks + op] >= map.opLimits[op]) return Number.NaN
    const count = placementMoves(
      map,
      s,
      cell,
      op,
      RESULTS[op * ROLL_COUNT + rolls[t]],
      variantBuf,
      0,
    )
    const m = variantBuf[plan.variants[t] % count]
    applyMove(map, s, m)
    moves[t] = m
    if (states !== null) states.set(s, (t + 1) * S)
  }
  return currentScore(map, s)
}

const spare = new Int32Array(OP_COUNT)

/**
 * One Metropolis chain over plans. Proposals: change the operation of a turn, swap the operations
 * or the circles of two turns (sometimes with fresh operations), reorder turns a..b while keeping
 * the numbers on the sheet whenever the rolls allow it, or toggle a link variant. Each proposal is
 * replayed exactly from the earliest turn it touches (states before it are cached).
 */
export class PlanChain {
  readonly map: CompiledMap
  readonly rolls: Rolls
  score: number
  best: number
  readonly bestMoves: Int32Array
  private readonly n: number
  private readonly S: number
  private readonly plan: Plan
  private readonly trial: Plan
  private readonly opCount = new Int32Array(OP_COUNT)
  /** states[t * S ..] = sheet before turn t, for the current plan. */
  private readonly states: Int32Array
  private readonly moves: Int32Array
  private readonly trialStates: Int32Array
  private readonly trialMoves: Int32Array
  private readonly work: Int32Array

  constructor(map: CompiledMap, rolls: Rolls, start: Line) {
    this.map = map
    this.rolls = rolls
    const n = map.n
    const S = map.stateSize
    this.n = n
    this.S = S
    this.plan = planFromMoves(map, rolls, start.moves)
    this.trial = {
      cells: this.plan.cells.slice(),
      ops: this.plan.ops.slice(),
      variants: this.plan.variants.slice(),
    }
    for (let t = 0; t < n; t++) this.opCount[this.plan.ops[t]]++
    this.states = new Int32Array((n + 1) * S)
    this.states.set(createState(map), 0)
    this.moves = new Int32Array(n)
    this.trialStates = new Int32Array((n + 1) * S)
    this.trialMoves = new Int32Array(n)
    this.work = new Int32Array(S)
    this.score = replayPlan(map, rolls, this.plan, 0, createState(map), this.states, this.moves)
    this.best = this.score
    this.bestMoves = this.moves.slice()
  }

  /** The current line. */
  line(): Line {
    return { moves: this.moves.slice(), score: this.score }
  }

  /** Copies another chain's current plan (same map and rolls) into this one. */
  copyFrom(other: PlanChain): void {
    this.plan.cells.set(other.plan.cells)
    this.plan.ops.set(other.plan.ops)
    this.plan.variants.set(other.plan.variants)
    this.opCount.set(other.opCount)
    this.states.set(other.states)
    this.moves.set(other.moves)
    this.score = other.score
  }

  /** Proposes one change and accepts it with the Metropolis rule at temperature `temp` (points). */
  step(rng: Rng, temp: number): void {
    const { map, rolls, n, S, plan, trial, opCount } = this
    trial.cells.set(plan.cells)
    trial.ops.set(plan.ops)
    trial.variants.set(plan.variants)
    let from = n
    const kind = rng.nextInt(100)
    if (kind < 25) {
      // New operation for one turn (if it has a spare box).
      const t = rng.nextInt(n)
      const op = rng.nextInt(OP_COUNT)
      if (op === plan.ops[t] || opCount[op] >= map.opLimits[op]) return
      trial.ops[t] = op
      from = t
    } else if (kind < 40) {
      // Swap the operations of two turns (box counts unchanged).
      const a = rng.nextInt(n)
      const b = rng.nextInt(n)
      if (plan.ops[a] === plan.ops[b]) return
      trial.ops[a] = plan.ops[b]
      trial.ops[b] = plan.ops[a]
      from = a < b ? a : b
    } else if (kind < 65) {
      // Swap the circles of two turns, sometimes with fresh operations for both.
      const a = rng.nextInt(n)
      const b = rng.nextInt(n)
      if (a === b) return
      trial.cells[a] = plan.cells[b]
      trial.cells[b] = plan.cells[a]
      if (kind >= 55) {
        const oa = rng.nextInt(OP_COUNT)
        const ob = rng.nextInt(OP_COUNT)
        const same = oa === ob ? 1 : 0
        opCount[plan.ops[a]]--
        opCount[plan.ops[b]]--
        const ok =
          opCount[oa] + 1 + same <= map.opLimits[oa] && opCount[ob] + 1 + same <= map.opLimits[ob]
        opCount[plan.ops[a]]++
        opCount[plan.ops[b]]++
        if (ok) {
          trial.ops[a] = oa
          trial.ops[b] = ob
        }
      }
      from = a < b ? a : b
    } else if (kind < 96) {
      // Reorder while keeping the sheet: swap two turns or rotate turns a..b, and pick for every
      // turn involved an operation that writes the number its new circle already holds.
      let a = rng.nextInt(n)
      let b = rng.nextInt(n)
      if (a === b) return
      if (a > b) {
        const x = a
        a = b
        b = x
      }
      if (kind < 80) {
        trial.cells[a] = plan.cells[b]
        trial.cells[b] = plan.cells[a]
      } else if (rng.nextInt(2) === 0) {
        for (let t = a; t < b; t++) trial.cells[t] = plan.cells[t + 1]
        trial.cells[b] = plan.cells[a]
      } else {
        for (let t = a + 1; t <= b; t++) trial.cells[t] = plan.cells[t - 1]
        trial.cells[a] = plan.cells[b]
      }
      this.keepNumbers(a, b)
      from = a
    } else {
      // Other link variant (no-op unless equal neighbours offer a choice).
      const t = rng.nextInt(n)
      trial.variants[t] = (plan.variants[t] + 1) & 7
      from = t
    }

    const work = this.work
    work.set(this.states.subarray(from * S, from * S + S))
    this.trialMoves.set(this.moves)
    const score = replayPlan(map, rolls, trial, from, work, this.trialStates, this.trialMoves)
    if (Number.isNaN(score)) return
    const delta = score - this.score
    if (delta < 0 && rng.nextFloat() >= Math.exp(delta / temp)) return
    for (let t = from; t < n; t++) {
      if (trial.ops[t] !== plan.ops[t]) {
        opCount[plan.ops[t]]--
        opCount[trial.ops[t]]++
      }
    }
    plan.cells.set(trial.cells)
    plan.ops.set(trial.ops)
    plan.variants.set(trial.variants)
    this.states.set(this.trialStates.subarray((from + 1) * S, (n + 1) * S), (from + 1) * S)
    this.moves.set(this.trialMoves)
    this.score = score
    if (score > this.best) {
      this.best = score
      this.bestMoves.set(this.moves)
    }
  }

  /**
   * For turns a..b of the trial plan (whose circles moved), choose operations that reproduce the
   * number each circle holds on the current final sheet, within the boxes left; a turn whose roll
   * cannot produce it keeps its operation when a box allows, else takes any operation with room.
   */
  private keepNumbers(a: number, b: number): void {
    const { map, rolls, plan, trial, n, S } = this
    const last = n * S
    spare.set(this.opCount)
    for (let t = a; t <= b; t++) spare[plan.ops[t]]--
    for (let t = a; t <= b; t++) {
      const cell = trial.cells[t]
      const want = this.states[last + map.oVal + cell]
      const max = map.cellMax[cell]
      let pick = -1
      for (let op = 0; op < OP_COUNT && pick < 0; op++) {
        if (spare[op] >= map.opLimits[op]) continue
        const v = RESULTS[op * ROLL_COUNT + rolls[t]]
        if ((v > max ? SAD : v) === want) pick = op
      }
      if (pick < 0 && spare[plan.ops[t]] < map.opLimits[plan.ops[t]]) pick = plan.ops[t]
      for (let op = 0; op < OP_COUNT && pick < 0; op++) if (spare[op] < map.opLimits[op]) pick = op
      trial.ops[t] = pick
      spare[pick]++
    }
  }
}

export type AnnealOptions = {
  seed: number
  /** Number of proposals. */
  iterations: number
  /** Start / end temperature in points (geometric schedule). */
  t0?: number
  t1?: number
}

/** Simulated annealing from `start` (a complete legal line); returns the best line seen. */
export function anneal(map: CompiledMap, rolls: Rolls, start: Line, opts: AnnealOptions): Line {
  const rng = new Rng(opts.seed)
  const chain = new PlanChain(map, rolls, start)
  const t0 = opts.t0 ?? 3
  const t1 = opts.t1 ?? 0.2
  const iters = Math.max(1, opts.iterations)
  const decay = (t1 / t0) ** (1 / iters)
  let temp = t0
  for (let it = 0; it < iters; it++, temp *= decay) chain.step(rng, temp)
  return { moves: chain.bestMoves.slice(), score: chain.best }
}

export type TemperOptions = {
  seed: number
  /** Proposals per replica. */
  iterations: number
  /** Number of replicas (temperatures), default 8. */
  replicas?: number
  /** Coldest / hottest temperature in points, default 0.25 / 6. */
  tMin?: number
  tMax?: number
  /** Proposals per replica between two rounds of swaps, default 200. */
  sweep?: number
}

/**
 * Parallel tempering (replica exchange): replicas at geometrically spaced temperatures explore
 * independently and periodically swap configurations with their neighbours, so a good plan found
 * hot can sink to the cold replicas and a cold replica stuck in a basin can climb out. Far better
 * than annealing restarts on this rugged landscape (docs/SOLVER.md). Returns the best line seen.
 */
export function temper(map: CompiledMap, rolls: Rolls, start: Line, opts: TemperOptions): Line {
  const rng = new Rng(opts.seed)
  const k = Math.max(2, opts.replicas ?? 8)
  const tMin = opts.tMin ?? 0.25
  const tMax = opts.tMax ?? 6
  const sweep = Math.max(1, opts.sweep ?? 200)
  const temps = Float64Array.from({ length: k }, (_, i) => tMin * (tMax / tMin) ** (i / (k - 1)))
  const chains: PlanChain[] = []
  for (let i = 0; i < k; i++) chains.push(new PlanChain(map, rolls, start))
  let best = start.score
  let bestMoves = start.moves.slice()
  for (let done = 0; done < opts.iterations; done += sweep) {
    for (let i = 0; i < k; i++) {
      const chain = chains[i]
      const temp = temps[i]
      for (let j = 0; j < sweep; j++) chain.step(rng, temp)
      if (chain.best > best) {
        best = chain.best
        bestMoves = chain.bestMoves.slice()
      }
    }
    for (let i = (done / sweep) & 1; i + 1 < k; i += 2) {
      const a = chains[i]
      const b = chains[i + 1]
      const x = (1 / temps[i] - 1 / temps[i + 1]) * (b.score - a.score)
      if (x >= 0 || rng.nextFloat() < Math.exp(x)) {
        chains[i] = b
        chains[i + 1] = a
      }
    }
  }
  return { moves: bestMoves, score: best }
}
