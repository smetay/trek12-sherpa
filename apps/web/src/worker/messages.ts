// Types only: shared between the main thread (DOM lib) and the worker (WebWorker lib).
export type PingMessage = { t: 'ping'; sent: number }
export type PongMessage = { t: 'pong'; sent: number; engineVersion: string }
