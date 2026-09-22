import type { Ruleset } from '@trek12/engine'
import { createHandler } from './handler.ts'
import type { SolverRequest, SolverResponse, WorkerLike } from './protocol.ts'

/**
 * A small pool of solver workers. Requests are queued and handed to idle workers; a stale or
 * dead worker is replaced by `spawn()` and its request re-sent (requests are pure, so retrying is
 * safe). Works with Web Workers, Node worker_threads wrappers, or `FakeWorker` in tests.
 */
export class SolverPool {
  private readonly workers: { worker: WorkerLike; busy: boolean }[] = []
  private readonly queue: { req: SolverRequest; resolve: (r: SolverResponse) => void }[] = []
  private readonly inFlight = new Map<
    number,
    { resolve: (r: SolverResponse) => void; slot: number; req: SolverRequest }
  >()
  private nextJob = 1
  private initMessage: SolverRequest | null = null
  private readonly spawn: () => WorkerLike
  readonly size: number

  constructor(spawn: () => WorkerLike, size: number) {
    this.spawn = spawn
    this.size = size
    for (let i = 0; i < size; i++) this.workers.push(this.attach(i, spawn()))
  }

  private attach(slot: number, worker: WorkerLike): { worker: WorkerLike; busy: boolean } {
    const entry = { worker, busy: false }
    worker.onmessage = (event) => this.onMessage(slot, event.data)
    if (this.initMessage) worker.postMessage(this.initMessage)
    return entry
  }

  private onMessage(slot: number, res: SolverResponse): void {
    if (res.t === 'ready') return
    if (res.job === undefined) return
    const pending = this.inFlight.get(res.job)
    if (!pending) return
    this.inFlight.delete(res.job)
    this.workers[slot].busy = false
    pending.resolve(res)
    this.pump()
  }

  private pump(): void {
    for (const entry of this.workers) {
      if (entry.busy) continue
      const next = this.queue.shift()
      if (!next) return
      entry.busy = true
      const slot = this.workers.indexOf(entry)
      const job = next.req.t === 'init' ? 0 : next.req.job
      this.inFlight.set(job, { resolve: next.resolve, slot, req: next.req })
      entry.worker.postMessage(next.req)
    }
  }

  /** Sends the map to every worker; later spawned replacements get it too. */
  init(mapId: string, ruleset: Ruleset): void {
    this.initMessage = { t: 'init', mapId, ruleset }
    for (const entry of this.workers) entry.worker.postMessage(this.initMessage)
  }

  rollouts(
    core: Int32Array,
    seed: number,
    from: number,
    count: number,
    policy: string,
  ): Promise<Int32Array> {
    const job = this.nextJob++
    return new Promise((resolve, reject) => {
      this.queue.push({
        req: { t: 'rollouts', job, core, seed, from, count, policy },
        resolve: (res) => {
          if (res.t === 'rollouts') resolve(res.scores)
          else reject(new Error(res.t === 'error' ? res.message : 'unexpected response'))
        },
      })
      this.pump()
    })
  }

  /** Solves `moves` exactly from the root state `core`; the worker shares one memo across them. */
  exact(core: Int32Array, moves: Int32Array): Promise<Float64Array> {
    const job = this.nextJob++
    return new Promise((resolve, reject) => {
      this.queue.push({
        req: { t: 'exact', job, core, moves },
        resolve: (res) => {
          if (res.t === 'exact') resolve(res.values)
          else reject(new Error(res.t === 'error' ? res.message : 'unexpected response'))
        },
      })
      this.pump()
    })
  }

  /** Drops queued work and replaces busy workers so a cancelled decision stops consuming CPU. */
  cancelAll(): void {
    this.queue.length = 0
    for (const [job, pending] of this.inFlight) {
      const entry = this.workers[pending.slot]
      entry.worker.terminate()
      this.workers[pending.slot] = this.attach(pending.slot, this.spawn())
      this.inFlight.delete(job)
      pending.resolve({ t: 'error', job, message: 'cancelled' })
    }
  }

  terminate(): void {
    this.cancelAll()
    for (const entry of this.workers) entry.worker.terminate()
  }
}

/** In-process worker for tests and single-threaded fallbacks: same handler, asynchronous delivery. */
export class FakeWorker implements WorkerLike {
  onmessage: ((event: { data: SolverResponse }) => void) | null = null
  private readonly handle = createHandler()
  private alive = true

  postMessage(message: SolverRequest): void {
    Promise.resolve().then(() => {
      if (!this.alive) return
      const res = this.handle(message)
      this.onmessage?.({ data: res })
    })
  }

  terminate(): void {
    this.alive = false
  }
}
