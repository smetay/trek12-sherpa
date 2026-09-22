/**
 * @trek12/solver — decides which move to recommend.
 *
 * Environment-agnostic: the same code runs inside a Web Worker, a Node worker_thread
 * and an in-process fake worker in tests. No DOM, no Node APIs (tsconfig `types: []`).
 */
export { ENGINE_VERSION } from '@trek12/engine'

export const SOLVER_VERSION = '0.1.0'

export * from './policy/greedy.ts'
export * from './policy/heuristic.ts'
export * from './policy/random.ts'
export * from './policy/types.ts'
export * from './simulate.ts'
export * from './tables.ts'

import { greedyPolicy } from './policy/greedy.ts'
import { heuristicPolicy } from './policy/heuristic.ts'
import { randomPolicy } from './policy/random.ts'
import type { RolloutPolicy } from './policy/types.ts'

export const POLICIES: readonly RolloutPolicy[] = [randomPolicy, greedyPolicy, heuristicPolicy]

export function getPolicy(name: string): RolloutPolicy | undefined {
  return POLICIES.find((p) => p.name === name)
}
