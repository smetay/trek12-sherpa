import type { PingMessage, PongMessage } from '../worker/messages.ts'
import PingWorker from '../worker/ping.worker.ts?worker'

export type PingResult = { roundTripMs: number; engineVersion: string }

/** Round-trips one message through a dedicated worker; proves module workers + workspace bundling work. */
export function pingWorker(): Promise<PingResult> {
  return new Promise((resolve, reject) => {
    const worker = new PingWorker()
    const sent = performance.now()

    worker.onmessage = (event: MessageEvent<PongMessage>) => {
      worker.terminate()
      resolve({ roundTripMs: performance.now() - sent, engineVersion: event.data.engineVersion })
    }
    worker.onerror = (event) => {
      worker.terminate()
      reject(new Error(event.message || 'worker error'))
    }

    const message: PingMessage = { t: 'ping', sent }
    worker.postMessage(message)
  })
}
