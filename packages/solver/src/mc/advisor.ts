import { type CompiledMap, coreOf, type State } from '@trek12/engine'
import type { RolloutPolicy } from '../policy/types.ts'
import type { SolverPool } from '../pool/pool.ts'
import { Race, type RaceOptions, type RankedMove } from './race.ts'

export type AdviseOptions = RaceOptions & {
  /** Wall-clock budget; the race stops at the end of the round that crosses it. */
  timeBudgetMs?: number
  now?: () => number
  /** Called after every round with the current ranking (anytime results for the UI). */
  onProgress?: (ranking: RankedMove[], round: number) => void
  /** Return true to abort (e.g. the user changed the dice). */
  shouldStop?: () => boolean
  /** Rollouts per worker message. */
  chunkSize?: number
}

export type Advice = {
  ranking: RankedMove[]
  rounds: number
  rolloutsPerCandidate: number
  exact: boolean
  elapsedMs: number
}

/**
 * Runs a root race with the rollouts spread over a worker pool. Results are bit-identical to the
 * single-threaded `Race.runToEnd()` because every rollout index is computed from (seed, index).
 */
export async function advise(
  pool: SolverPool,
  map: CompiledMap,
  state: State,
  y: number,
  r: number,
  policy: RolloutPolicy,
  options: AdviseOptions,
): Promise<Advice> {
  const now = options.now ?? (() => Date.now())
  const start = now()
  const race = new Race(map, state, y, r, policy, options)
  const chunkSize = options.chunkSize ?? 36
  const cores = race.candidates.map((c) => coreOf(map, c.child))

  while (!race.done) {
    if (options.shouldStop?.()) break
    const chunks = race.plan(chunkSize)
    const results = await Promise.all(
      chunks.map((chunk) =>
        pool.rollouts(cores[chunk.candidate], options.seed, chunk.from, chunk.count, policy.name),
      ),
    )
    if (options.shouldStop?.()) break
    for (let i = 0; i < chunks.length; i++) race.ingest(chunks[i], results[i])
    race.finishRound()
    options.onProgress?.(race.ranking(), race.round)
    if (options.timeBudgetMs !== undefined && now() - start >= options.timeBudgetMs) break
  }
  const alive = race.candidates.find((c) => c.alive) ?? race.candidates[0]
  return {
    ranking: race.ranking(),
    rounds: race.round,
    rolloutsPerCandidate: race.exactMode ? 0 : (alive?.n ?? 0),
    exact: race.exactMode,
    elapsedMs: now() - start,
  }
}
