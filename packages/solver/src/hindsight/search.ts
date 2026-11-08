import { type CompiledMap, currentScore, mix32 } from '@trek12/engine'
import { temper } from './anneal.ts'
import { beamSearch } from './beam.ts'
import { solveExact } from './exact.ts'
import { type Line, lineStates, type Rolls } from './line.ts'

/** One unit of hindsight work, as sent to a worker. */
export type HindsightJob = {
  /** Start line (complete); empty → the worker builds one by beam search. */
  start: Int32Array
  seed: number
  /** Proposals per replica. */
  iterations: number
  replicas: number
  /** Solve the last `polish` turns of the result exactly (0 = no). */
  polish: number
}

/** Beam width of the starting line (fast, ~0.1 s; the tempering does the real work). */
export const HINDSIGHT_BEAM_WIDTH = 256
/** Last turns re-solved exactly on every result (~0.15 s; 7 would cost seconds). */
export const HINDSIGHT_POLISH = 6

/**
 * Runs one job: beam start if needed, parallel tempering, exact polish of the last turns.
 * Pure and deterministic for a given job — the same code runs in workers and in tests.
 */
export function runHindsightJob(map: CompiledMap, rolls: Rolls, job: HindsightJob): Line {
  let line: Line =
    job.start.length === map.n
      ? { moves: job.start, score: Number.NaN }
      : beamSearch(map, rolls, { width: HINDSIGHT_BEAM_WIDTH, seed: job.seed })
  if (Number.isNaN(line.score)) {
    // Validates the start line sent by the caller.
    const states = lineStates(map, rolls, line.moves)
    line = { moves: line.moves, score: currentScore(map, states[states.length - 1]) }
  }
  if (job.iterations > 0) {
    line = temper(map, rolls, line, {
      seed: job.seed,
      iterations: job.iterations,
      replicas: job.replicas,
    })
  }
  if (job.polish > 0) line = polishTail(map, rolls, line, job.polish)
  return line
}

/** Replaces the last `k` turns of `line` by their exact best completion (never worse). */
export function polishTail(map: CompiledMap, rolls: Rolls, line: Line, k: number): Line {
  const n = map.n
  const from = Math.max(0, n - k)
  const states = lineStates(map, rolls, line.moves)
  const tail = solveExact(map, rolls, states[from])
  if (!tail || tail.score <= line.score) return line
  const moves = line.moves.slice()
  moves.set(tail.moves, from)
  return { moves, score: tail.score }
}

export type HindsightOptions = {
  seed: number
  /** Independent searches run side by side (default 4). */
  lanes?: number
  /** Maximum number of rounds (default 10). */
  rounds?: number
  /** Stop early once the best has not moved for `patience` rounds after `minRounds` (4, 3). */
  minRounds?: number
  patience?: number
  /** Proposals per replica and per round (default 100 000). */
  iterations?: number
  /** Temperatures of each tempering run (default 16). */
  replicas?: number
  /** A line found earlier ("search longer"): even lanes continue from it, odd lanes start fresh. */
  start?: Line
  /**
   * After each round the weakest of the first `elite` lanes restarts from the overall best
   * (default: half of the lanes, rounded down). The other lanes always continue their own search,
   * so that their agreement is evidence, not a copy.
   */
  elite?: number
}

export type HindsightProgress = {
  best: Line
  /** Rounds completed. */
  round: number
  /** Lanes that reached the overall best score by themselves (an adopted line does not count). */
  agreeing: number
  lanes: number
  /** Total proposals evaluated so far. */
  proposals: number
  done: boolean
}

/**
 * The clairvoyant maximum: rounds of parallel tempering in several lanes. Every round, each lane
 * continues from its own best line with a fresh seed; among the elite lanes the weakest then adopts
 * the overall best, while the other lanes stay independent so that their agreement means something. Driven from outside (`plan` → run the jobs anywhere → `ingest`), like the
 * Monte-Carlo race, so it runs identically in workers or in-process.
 */
export class HindsightSearch {
  readonly map: CompiledMap
  readonly rolls: Rolls
  readonly lanes: number
  readonly maxRounds: number
  readonly minRounds: number
  readonly patience: number
  readonly iterations: number
  readonly replicas: number
  readonly seed: number
  round = 0
  done = false
  best: Line | null = null
  private laneBest: (Line | null)[]
  /** Best score each lane reached by itself (an adopted line does not count). */
  private found: number[]
  /** Score of the line a lane adopted from another one (elitism), or -Infinity. */
  private adopted: number[]
  readonly elite: number
  private stale = 0
  private proposals = 0

  constructor(map: CompiledMap, rolls: Rolls, options: HindsightOptions) {
    if (rolls.length < map.n) throw new RangeError(`need ${map.n} rolls, got ${rolls.length}`)
    this.map = map
    this.rolls = rolls
    this.lanes = Math.max(1, options.lanes ?? 4)
    this.maxRounds = Math.max(1, options.rounds ?? 10)
    this.minRounds = options.minRounds ?? 4
    this.patience = options.patience ?? 3
    this.iterations = options.iterations ?? 100_000
    this.replicas = options.replicas ?? 16
    this.seed = options.seed
    const start = options.start
    this.laneBest = Array.from({ length: this.lanes }, (_, lane) =>
      start && lane % 2 === 0 ? start : null,
    )
    if (start) this.best = start
    this.elite = Math.min(this.lanes, options.elite ?? Math.floor(this.lanes / 2))
    this.found = Array.from({ length: this.lanes }, () => -Infinity)
    this.adopted = Array.from({ length: this.lanes }, (_, lane) =>
      start && lane % 2 === 0 ? start.score : -Infinity,
    )
  }

  /** Jobs of the coming round, one per lane. */
  plan(): HindsightJob[] {
    if (this.done) return []
    const polish = this.round + 1 >= this.minRounds ? HINDSIGHT_POLISH : 0
    return this.laneBest.map((line, lane) => ({
      start: line ? line.moves : new Int32Array(0),
      seed: mix32(this.seed, lane, this.round),
      iterations: this.iterations,
      replicas: this.replicas,
      polish,
    }))
  }

  /** Installs the results of a round (one line per lane, in order). */
  ingest(results: Line[]): HindsightProgress {
    const before = this.best?.score ?? -Infinity
    results.forEach((line, lane) => {
      const own = this.laneBest[lane]
      if (!own || line.score >= own.score) this.laneBest[lane] = line
      if (line.score > this.adopted[lane]) this.found[lane] = Math.max(this.found[lane], line.score)
      if (!this.best || line.score > this.best.score) this.best = line
    })
    this.proposals += this.lanes * this.iterations * this.replicas
    this.round++
    const best = this.best as Line
    this.stale = best.score > before ? 0 : this.stale + 1
    // Elitism among the first `elite` lanes: the weakest restarts from the overall best.
    const agreeing = this.agreeing()
    if (this.elite > 0) {
      let worst = 0
      for (let l = 1; l < this.elite; l++) {
        if ((this.laneBest[l]?.score ?? -1) < (this.laneBest[worst]?.score ?? -1)) worst = l
      }
      if ((this.laneBest[worst]?.score ?? -1) < best.score) {
        this.laneBest[worst] = best
        this.adopted[worst] = best.score
      }
    }
    if (this.round >= this.maxRounds) this.done = true
    else if (this.round >= this.minRounds && this.stale >= this.patience) this.done = true
    return this.progress(agreeing)
  }

  /** Lanes that reached the overall best score by their own search. */
  private agreeing(): number {
    const top = this.best?.score
    return this.found.filter((f) => f === top).length
  }

  progress(agreeing = this.agreeing()): HindsightProgress {
    return {
      best: this.best as Line,
      round: this.round,
      agreeing,
      lanes: this.lanes,
      proposals: this.proposals,
      done: this.done,
    }
  }

  /** Runs the whole search in-process (bench, tests). */
  runToEnd(): HindsightProgress {
    let last = this.progress()
    while (!this.done) {
      last = this.ingest(this.plan().map((job) => runHindsightJob(this.map, this.rolls, job)))
    }
    return last
  }
}
