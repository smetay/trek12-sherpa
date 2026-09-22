/**
 * @trek12/solver — decides which move to recommend.
 *
 * Environment-agnostic: the same code runs inside a Web Worker, a Node worker_thread
 * and an in-process fake worker in tests. No DOM, no Node APIs (tsconfig `types: []`).
 */
export { ENGINE_VERSION } from '@trek12/engine'

export const SOLVER_VERSION = '0.0.0'
