import { SolverPool, type SolverResponse, type WorkerLike } from '@trek12/solver'
import SolverWorker from '../worker/solver.worker.ts?worker'

/** Leaves one core for the UI; iOS under-reports hardwareConcurrency, so never go below 2. */
export function defaultPoolSize(): number {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4
  return Math.max(2, Math.min(4, cores - 1))
}

function wrap(worker: Worker): WorkerLike {
  const like: WorkerLike = {
    postMessage: (message) => worker.postMessage(message),
    onmessage: null,
    terminate: () => worker.terminate(),
  }
  worker.onmessage = (event: MessageEvent<SolverResponse>) => like.onmessage?.({ data: event.data })
  return like
}

export function createSolverPool(size = defaultPoolSize()): SolverPool {
  return new SolverPool(() => wrap(new SolverWorker()), size)
}
