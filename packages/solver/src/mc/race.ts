import {
  applyMove,
  type CompiledMap,
  generateMoves,
  MAX_MOVES,
  type Move,
  type State,
} from '@trek12/engine'
import { EXACT_EMPTY_LIMIT, emptyCells, exactRootValues } from '../exact/endgame.ts'
import type { RolloutPolicy } from '../policy/types.ts'
import { crnRolloutScores } from './crn.ts'

export type RaceOptions = {
  seed: number
  /** Rollouts per surviving candidate before the race gives up (default 8192). */
  maxRollouts?: number
  /** Score threshold for P(score >= summit) (default: the map's). */
  summit?: number
}

export type Candidate = {
  move: Move
  /** State right after the move (before the next roll). */
  child: State
  scores: Int32Array
  n: number
  alive: boolean
  /** Exact value when the endgame was solved instead of sampled. */
  exact?: number
}

export type RankedMove = {
  move: Move
  n: number
  mean: number
  se: number
  /** Paired difference vs the best move (≤ 0) and its 95% half-width. */
  diff: number
  ci: number
  /** True when the CI of the difference contains 0: statistically indistinguishable from the best. */
  tied: boolean
  alive: boolean
  exact: boolean
  pSummit: number
}

export type Chunk = { candidate: number; from: number; count: number }

const rootMoves = new Int32Array(MAX_MOVES)

/**
 * Root race: every legal move is a candidate; candidates receive the same CRN rollouts in rounds of
 * 36·2^round, and the ones that are clearly worse than the leader are eliminated (successive halving).
 * The race is driven from outside (`plan` → compute chunks anywhere → `ingest` → `finishRound`), so
 * the same code runs single-threaded, in Node workers or in Web Workers, with identical results.
 */
export class Race {
  readonly candidates: Candidate[] = []
  readonly exactMode: boolean
  round = 0
  done = false
  private readonly maxRollouts: number
  private readonly summit: number
  readonly map: CompiledMap
  readonly state: State
  readonly y: number
  readonly r: number
  readonly policy: RolloutPolicy
  readonly options: RaceOptions

  constructor(
    map: CompiledMap,
    state: State,
    y: number,
    r: number,
    policy: RolloutPolicy,
    options: RaceOptions,
  ) {
    this.map = map
    this.state = state
    this.y = y
    this.r = r
    this.policy = policy
    this.options = options
    this.maxRollouts = options.maxRollouts ?? 8192
    this.summit = options.summit ?? map.def.summit
    const count = generateMoves(map, state, y, r, rootMoves)
    for (let i = 0; i < count; i++) {
      const child = state.slice()
      applyMove(map, child, rootMoves[i])
      this.candidates.push({
        move: rootMoves[i],
        child,
        scores: new Int32Array(64),
        n: 0,
        alive: true,
      })
    }
    this.exactMode = count > 0 && emptyCells(map, this.candidates[0].child) <= EXACT_EMPTY_LIMIT
    if (this.exactMode) {
      const values = exactRootValues(map, state, rootMoves, count)
      this.candidates.forEach((c, i) => {
        c.exact = values[i]
      })
      this.done = true
    }
    if (count <= 1) this.done = true
  }

  /** Number of rollouts each surviving candidate gets in the coming round. */
  roundSize(): number {
    return 36 << this.round
  }

  /** Work for the coming round, in chunks of at most `chunkSize` rollouts. */
  plan(chunkSize = 36): Chunk[] {
    if (this.done) return []
    const size = this.roundSize()
    const chunks: Chunk[] = []
    this.candidates.forEach((c, i) => {
      if (!c.alive) return
      for (let from = c.n; from < c.n + size; from += chunkSize) {
        chunks.push({ candidate: i, from, count: Math.min(chunkSize, c.n + size - from) })
      }
    })
    return chunks
  }

  /** Computes a chunk in-process (used single-threaded and by workers). */
  compute(chunk: Chunk): Int32Array {
    const c = this.candidates[chunk.candidate]
    return crnRolloutScores(
      this.map,
      c.child,
      this.policy,
      this.options.seed,
      chunk.from,
      chunk.count,
    )
  }

  ingest(chunk: Chunk, scores: Int32Array): void {
    const c = this.candidates[chunk.candidate]
    const needed = chunk.from + chunk.count
    if (c.scores.length < needed) {
      const grown = new Int32Array(Math.max(needed, c.scores.length * 2))
      grown.set(c.scores)
      c.scores = grown
    }
    c.scores.set(scores.subarray(0, chunk.count), chunk.from)
  }

  /** Marks the round as complete (every planned chunk ingested) and eliminates hopeless candidates. */
  finishRound(): void {
    const size = this.roundSize()
    for (const c of this.candidates) if (c.alive) c.n += size
    this.round++

    const alive = this.candidates.filter((c) => c.alive)
    if (alive.length <= 1) {
      this.done = true
      return
    }
    const leader = alive.reduce((best, c) => (mean(c) > mean(best) ? c : best), alive[0])
    // Eliminate: the leader beats the candidate by more than 3 SE on paired rollouts.
    for (const c of alive) {
      if (c === leader) continue
      const { d, se } = pairedDiff(c, leader)
      if (d + 3 * se < 0) c.alive = false
    }
    // Keep at most half of the field (min 3) so the race converges even when everything is close.
    const survivors = this.candidates.filter((c) => c.alive).sort((a, b) => mean(b) - mean(a))
    const cap = Math.max(3, Math.ceil(alive.length / 2))
    survivors.slice(cap).forEach((c) => {
      c.alive = false
    })

    const still = this.candidates.filter((c) => c.alive)
    if (still.length <= 1) this.done = true
    else if (leader.n >= this.maxRollouts) this.done = true
    else {
      const second = still.filter((c) => c !== leader).reduce((b, c) => (mean(c) > mean(b) ? c : b))
      const { d, se } = pairedDiff(second, leader)
      if (leader.n >= 252 && se > 0 && -d / se >= 3) this.done = true
      else if (
        still.every(
          (c) =>
            c === leader || Math.abs(pairedDiff(c, leader).d) + 2 * pairedDiff(c, leader).se < 0.25,
        )
      ) {
        this.done = true
      }
    }
  }

  /** Runs the whole race in-process. */
  runToEnd(): RankedMove[] {
    while (!this.done) {
      for (const chunk of this.plan(this.roundSize())) this.ingest(chunk, this.compute(chunk))
      this.finishRound()
    }
    return this.ranking()
  }

  ranking(): RankedMove[] {
    const cs = this.candidates
    if (this.exactMode) {
      const best = Math.max(...cs.map((c) => c.exact ?? -Infinity))
      return cs
        .map((c) => ({
          move: c.move,
          n: 0,
          mean: c.exact ?? 0,
          se: 0,
          diff: (c.exact ?? 0) - best,
          ci: 0,
          tied: (c.exact ?? 0) === best,
          alive: true,
          exact: true,
          pSummit: 0,
        }))
        .sort((a, b) => b.mean - a.mean)
    }
    const measured = cs.filter((c) => c.n > 0)
    const best = measured.reduce((b, c) => (mean(c) > mean(b) ? c : b), measured[0])
    return cs
      .map((c) => {
        const { d, se } = c === best || c.n === 0 ? { d: 0, se: 0 } : pairedDiff(c, best)
        const ci = 1.96 * se
        let above = 0
        for (let i = 0; i < c.n; i++) if (c.scores[i] >= this.summit) above++
        return {
          move: c.move,
          n: c.n,
          mean: c.n > 0 ? mean(c) : Number.NaN,
          se: c.n > 1 ? Math.sqrt(variance(c) / c.n) : 0,
          diff: d,
          ci,
          tied: c === best || (c.n > 0 && ci >= -d),
          alive: c.alive,
          exact: false,
          pSummit: c.n > 0 ? above / c.n : 0,
        }
      })
      .sort((a, b) => (Number.isNaN(b.mean) ? -1 : Number.isNaN(a.mean) ? 1 : b.mean - a.mean))
  }
}

function mean(c: Candidate): number {
  let sum = 0
  for (let i = 0; i < c.n; i++) sum += c.scores[i]
  return sum / c.n
}

function variance(c: Candidate): number {
  const m = mean(c)
  let acc = 0
  for (let i = 0; i < c.n; i++) acc += (c.scores[i] - m) ** 2
  return acc / (c.n - 1)
}

/** Mean and standard error of (a − b) over the rollouts both candidates have. */
function pairedDiff(a: Candidate, b: Candidate): { d: number; se: number } {
  const n = Math.min(a.n, b.n)
  if (n === 0) return { d: 0, se: 0 }
  let sum = 0
  let sumSq = 0
  for (let i = 0; i < n; i++) {
    const d = a.scores[i] - b.scores[i]
    sum += d
    sumSq += d * d
  }
  const d = sum / n
  const v = n > 1 ? (sumSq - n * d * d) / (n - 1) : 0
  return { d, se: Math.sqrt(Math.max(0, v) / n) }
}
