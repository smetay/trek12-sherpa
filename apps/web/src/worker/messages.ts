import type { Anchor, DiceLogRead, GrayImage, Quad, SheetCell, SheetCellRead } from '@trek12/vision'

// Types only: shared between the main thread (DOM lib) and the workers (WebWorker lib).
export type PerfRequest = { mapId: string; policies: string[]; budgetMs: number }
export type PerfResult =
  | { t: 'perf'; policy: string; rollouts: number; perSecond: number; meanScore: number }
  | { t: 'done' }

export type VisionRequest =
  | {
      t: 'dice'
      image: GrayImage
      quad?: Quad
    }
  | {
      t: 'sheet'
      image: GrayImage
      cells: SheetCell[]
      anchors: Anchor[]
    }
export type VisionResponse =
  | { t: 'dice'; read: DiceLogRead }
  | { t: 'sheet'; cells: SheetCellRead[] }
  | { t: 'error'; message: string }
