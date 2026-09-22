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

export type SolverResponse =
  | { t: 'ready'; job?: undefined }
  | { t: 'rollouts'; job: number; scores: Int32Array }
  | { t: 'error'; job?: number; message: string }

export type WorkerLike = {
  postMessage(message: SolverRequest): void
  onmessage: ((event: { data: SolverResponse }) => void) | null
  terminate(): void
}
