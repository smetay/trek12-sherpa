import {
  applyMove,
  type CompiledMap,
  createState,
  currentScore,
  type Move,
  mix32,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'
import type { Rolls } from '../hindsight/line.ts'
import { type AdviseOptions, advise } from '../mc/advisor.ts'
import type { RankedMove } from '../mc/race.ts'
import type { RolloutPolicy } from '../policy/types.ts'
import type { SolverPool } from '../pool/pool.ts'
import { SheetReconstructor, type TargetSheet } from './reconstruct.ts'

/** What was played: the exact moves (game recorded in the app) or only the finished paper sheet. */
export type ReviewSource =
  | { kind: 'moves'; moves: ArrayLike<number> }
  | {
      kind: 'sheet'
      target: TargetSheet
      /** Moves the player says they played, by turn (null: let the review infer it). */
      choices?: readonly (Move | null)[]
    }

export type TurnReview = {
  turn: number
  roll: number
  /** The move played (inferred from the sheet when `alternatives` is not empty). */
  played: Move
  best: Move
  bestMean: number
  playedMean: number
  /** Expected points lost by the move played vs the best one (≥ 0). */
  loss: number
  /** 95 % half-width of the paired difference (0 when solved exactly). */
  ci: number
  /** Statistically indistinguishable from the best move. */
  tied: boolean
  exact: boolean
  /** Other moves the paper sheet allows at this turn (the order of play was ambiguous). */
  alternatives: Move[]
  /** The player chose `played` explicitly (vs inferred). */
  confirmed: boolean
  /** Ranked moves of the turn, best first (for the turn view). */
  ranking: { move: Move; mean: number; tied: boolean }[]
}

export type ReviewOptions = Omit<AdviseOptions, 'seed' | 'pinned' | 'onProgress'> & {
  seed?: number
  /** Called after every analysed turn (anytime display). */
  onTurn?: (review: TurnReview) => void
  /**
   * Turns already reviewed, kept as they are (their moves are replayed, not re-analysed): pass the
   * previous review cut just before the first turn whose choice changed.
   */
  reuse?: readonly TurnReview[]
}

function compact(ranking: RankedMove[]): TurnReview['ranking'] {
  return ranking
    .filter((m) => m.exact || m.n > 0)
    .map((m) => ({ move: m.move, mean: m.mean, tied: m.tied }))
}

/**
 * Post-game review: replays the game turn by turn and asks the Monte-Carlo advisor — which, like
 * the player, does not know the future rolls — how much each decision cost in expected points.
 * The moves played are pinned in the race so their value is measured as precisely as the leader's.
 *
 * For a paper sheet the order of play is reconstructed on the fly: when several circles could have
 * been filled at a turn, the review gives the player the benefit of the doubt and keeps the one the
 * advisor rates highest (unless the player said otherwise), flagging the turn as inferred.
 */
export async function reviewGame(
  pool: SolverPool,
  map: CompiledMap,
  rolls: Rolls,
  source: ReviewSource,
  policy: RolloutPolicy,
  options: ReviewOptions,
): Promise<TurnReview[]> {
  const rec = source.kind === 'sheet' ? new SheetReconstructor(map, rolls, source.target) : null
  if (rec && !rec.feasibleFrom(createState(map))) {
    throw new Error('no order of play produces this sheet with these dice')
  }
  const s = createState(map)
  const out: TurnReview[] = []
  for (let t = 0; t < map.n; t++) {
    if (options.shouldStop?.()) break
    const roll = rolls[t]
    const kept = options.reuse?.[t]
    if (kept && kept.roll === roll) {
      out.push(kept)
      options.onTurn?.(kept)
      applyMove(map, s, kept.played)
      continue
    }
    let candidates: Move[]
    let chosen: Move | null = null
    if (source.kind === 'moves') {
      candidates = [source.moves[t]]
      chosen = source.moves[t]
    } else {
      candidates = (rec as SheetReconstructor).candidates(s)
      if (candidates.length === 0) throw new Error(`turn ${t + 1}: the sheet cannot be continued`)
      const wanted = source.choices?.[t] ?? null
      if (wanted !== null && candidates.includes(wanted)) chosen = wanted
    }
    const advice = await advise(pool, map, s, rollYellow(roll), rollRed(roll), policy, {
      ...options,
      seed: mix32(options.seed ?? 0x5e1f, t, roll),
      pinned: candidates,
    })
    if (options.shouldStop?.()) break
    const ranking = advice.ranking.filter((m) => m.exact || m.n > 0)
    if (ranking.length === 0) {
      // A single legal move: nothing to decide, nothing measured.
      const only = candidates[0]
      const forced: TurnReview = {
        turn: t,
        roll,
        played: only,
        best: only,
        bestMean: Number.NaN,
        playedMean: Number.NaN,
        loss: 0,
        ci: 0,
        tied: true,
        exact: advice.exact,
        alternatives: [],
        confirmed: true,
        ranking: [],
      }
      out.push(forced)
      options.onTurn?.(forced)
      applyMove(map, s, only)
      continue
    }
    const best = ranking[0]
    const byMove = new Map(ranking.map((m) => [m.move, m]))
    let played = chosen
    if (played === null) {
      // Benefit of the doubt: the best-rated move compatible with the sheet.
      played = candidates[0]
      let bestMean = -Infinity
      for (const m of candidates) {
        const mean = byMove.get(m)?.mean ?? -Infinity
        if (mean > bestMean) {
          bestMean = mean
          played = m
        }
      }
    }
    const p = byMove.get(played)
    const playedMean = p?.mean ?? Number.NaN
    const review: TurnReview = {
      turn: t,
      roll,
      played,
      best: best.move,
      bestMean: best.mean,
      playedMean,
      loss: Math.max(0, best.mean - playedMean),
      ci: p?.ci ?? 0,
      tied: p ? p.tied || p.move === best.move : false,
      exact: advice.exact,
      alternatives: candidates.filter((m) => m !== played),
      confirmed: source.kind === 'moves' || chosen !== null,
      ranking: compact(advice.ranking),
    }
    out.push(review)
    options.onTurn?.(review)
    applyMove(map, s, played)
  }
  return out
}

export type SherpaLine = { moves: Move[]; score: number; states: State[] }

/**
 * The advisor's own game on the same dice, deciding each turn without knowing the next rolls —
 * the fair benchmark for a player (unlike the clairvoyant maximum).
 */
export async function sherpaLine(
  pool: SolverPool,
  map: CompiledMap,
  rolls: Rolls,
  policy: RolloutPolicy,
  options: Omit<AdviseOptions, 'seed'> & {
    seed?: number
    onTurn?: (turn: number, move: Move) => void
  },
): Promise<SherpaLine> {
  const s = createState(map)
  const moves: Move[] = []
  const states: State[] = [s.slice()]
  for (let t = 0; t < map.n; t++) {
    if (options.shouldStop?.()) break
    const roll = rolls[t]
    const advice = await advise(pool, map, s, rollYellow(roll), rollRed(roll), policy, {
      ...options,
      seed: mix32(options.seed ?? 0x5e1f, t, roll),
    })
    const best = advice.ranking.find((m) => m.exact || m.n > 0)?.move ?? advice.onlyMove
    if (best === undefined) break
    applyMove(map, s, best)
    moves.push(best)
    states.push(s.slice())
    options.onTurn?.(t, best)
  }
  return { moves, score: currentScore(map, s), states }
}
