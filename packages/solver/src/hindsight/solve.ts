import type { CompiledMap } from '@trek12/engine'
import type { SolverPool } from '../pool/pool.ts'
import type { Rolls } from './line.ts'
import { type HindsightOptions, type HindsightProgress, HindsightSearch } from './search.ts'

export type SolveHindsightOptions = HindsightOptions & {
  /** Wall-clock budget; the search stops at the end of the round that crosses it. */
  timeBudgetMs?: number
  now?: () => number
  onProgress?: (progress: HindsightProgress) => void
  /** Return true to abort (the result so far is still returned when there is one). */
  shouldStop?: () => boolean
}

/**
 * Runs a `HindsightSearch` with one lane per job spread over the worker pool. Results are anytime:
 * `onProgress` fires after every round with the best line so far.
 */
export async function solveHindsight(
  pool: SolverPool,
  map: CompiledMap,
  rolls: Rolls,
  options: SolveHindsightOptions,
): Promise<HindsightProgress | null> {
  const now = options.now ?? (() => Date.now())
  const start = now()
  const search = new HindsightSearch(map, rolls, { lanes: pool.size, ...options })
  let last: HindsightProgress | null = null
  while (!search.done) {
    if (options.shouldStop?.()) break
    const jobs = search.plan()
    const results = await Promise.all(jobs.map((job) => pool.hindsight(rolls, job)))
    if (options.shouldStop?.()) break
    last = search.ingest(results)
    if (options.timeBudgetMs !== undefined && now() - start >= options.timeBudgetMs) {
      search.done = true
      last = { ...last, done: true }
    }
    options.onProgress?.(last)
  }
  return last
}
