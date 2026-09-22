/**
 * @trek12/solver — decides which move to recommend.
 *
 * Environment-agnostic: the same code runs inside a Web Worker, a Node worker_thread
 * and an in-process fake worker in tests. No DOM, no Node APIs (tsconfig `types: []`).
 */
export { ENGINE_VERSION } from '@trek12/engine'

export const SOLVER_VERSION = '0.3.0'

export * from './exact/endgame.ts'
export * from './mc/advisor.ts'
export * from './mc/crn.ts'
export * from './mc/race.ts'
export * from './policy/greedy.ts'
export * from './policy/heuristic.ts'
export * from './policy/mc.ts'
export * from './policy/random.ts'
export * from './policy/registry.ts'
export * from './policy/types.ts'
export * from './pool/handler.ts'
export * from './pool/pool.ts'
export * from './pool/protocol.ts'
export * from './simulate.ts'
export * from './tables.ts'
