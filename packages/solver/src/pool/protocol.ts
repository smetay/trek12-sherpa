import type { Ruleset } from '@trek12/engine'

/** Messages between the main thread and solver workers (Web Worker, worker_threads or in-process fake). */
export type SolverRequest =
  | { t: 'init'; mapId: string; ruleset: Ruleset }
  | {
      t: 'rollouts'
      job: number
      /** Serialised core (VAL, UP, DOWN, TICKS) of the state *after* the root move. */
      core: Int32Array
      seed: number
      from: number
      count: number
      policy: string
    }
  | {
      t: 'exact'
      job: number
      /** Serialised core of the state *before* the root moves. */
      core: Int32Array
      /** Root moves to solve exactly. */
      moves: Int32Array
    }
  | {
      t: 'hindsight'
      job: number
      /** Roll index of every turn (the whole game is known). */
      rolls: Uint8Array
      /** Start line (moves of every turn) or empty for a fresh beam-search start. */
      start: Int32Array
      seed: number
      iterations: number
      replicas: number
      polish: number
    }

export type SolverResponse =
  | { t: 'ready'; job?: undefined }
  | { t: 'rollouts'; job: number; scores: Int32Array }
  | { t: 'exact'; job: number; values: Float64Array }
  | { t: 'hindsight'; job: number; moves: Int32Array; score: number }
  | { t: 'error'; job?: number; message: string }

export type WorkerLike = {
  postMessage(message: SolverRequest): void
  onmessage: ((event: { data: SolverResponse }) => void) | null
  terminate(): void
}
