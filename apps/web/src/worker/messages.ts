// Types only: shared between the main thread (DOM lib) and the workers (WebWorker lib).
export type PerfRequest = { mapId: string; policies: string[]; budgetMs: number }
export type PerfResult =
  | { t: 'perf'; policy: string; rollouts: number; perSecond: number; meanScore: number }
  | { t: 'done' }
