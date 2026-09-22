import type { RankedMove } from '@trek12/solver'

export type HeatLevel = 'best' | 'tied' | 'near' | 'mid' | 'far'

export type CellHeat = {
  /** Best move writing in this circle. */
  move: number
  level: HeatLevel
  /** Expected points lost vs the best move overall (≥ 0). */
  loss: number
  mean: number
  pSummit: number
  exact: boolean
}

export const HEAT_COLOR: Record<HeatLevel, string> = {
  best: 'var(--heat-best)',
  tied: 'var(--heat-best)',
  near: 'var(--heat-near)',
  mid: 'var(--heat-mid)',
  far: 'var(--heat-far)',
}

/** Loss thresholds (points) between heat levels. */
export const NEAR = 1
export const MID = 3

export function levelFor(loss: number, tied: boolean): HeatLevel {
  if (tied) return 'tied'
  if (loss < NEAR) return 'near'
  if (loss < MID) return 'mid'
  return 'far'
}

/**
 * One entry per circle that has at least one evaluated move: its best move and how much worse it is
 * than the best move overall. `cellOf` extracts the target circle of a move.
 */
export function cellHeats(
  ranking: RankedMove[],
  cellOf: (move: number) => number,
): Map<number, CellHeat> {
  const measured = ranking.filter((m) => m.exact || m.n > 0)
  const heats = new Map<number, CellHeat>()
  if (measured.length === 0) return heats
  const top = measured.reduce((b, m) => (m.mean > b.mean ? m : b), measured[0])
  for (const m of measured) {
    const cell = cellOf(m.move)
    const known = heats.get(cell)
    if (known && known.mean >= m.mean) continue
    const loss = Math.max(0, top.mean - m.mean)
    heats.set(cell, {
      move: m.move,
      level: m.move === top.move ? 'best' : levelFor(loss, m.tied),
      loss,
      mean: m.mean,
      pSummit: m.pSummit,
      exact: m.exact,
    })
  }
  return heats
}
