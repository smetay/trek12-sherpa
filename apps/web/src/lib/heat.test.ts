import type { RankedMove } from '@trek12/solver'
import { describe, expect, it } from 'vitest'
import { cellHeats, levelFor } from './heat.ts'

const rm = (move: number, mean: number, extra: Partial<RankedMove> = {}): RankedMove => ({
  move,
  n: 100,
  mean,
  se: 0.1,
  diff: 0,
  ci: 0.2,
  tied: false,
  alive: true,
  exact: false,
  pSummit: 0.5,
  ...extra,
})

describe('cell heat', () => {
  it('keeps the best move of each circle and grades the loss vs the best overall', () => {
    // moves encode their circle as move % 10 for this test
    const heats = cellHeats(
      [
        rm(11, 70),
        rm(21, 68),
        rm(12, 69.6, { tied: true }),
        rm(13, 68.5),
        rm(14, 65),
        rm(15, 0, { n: 0 }),
      ],
      (m) => m % 10,
    )
    expect(heats.get(1)).toMatchObject({ move: 11, level: 'best', loss: 0 })
    expect(heats.get(2)).toMatchObject({ level: 'tied' })
    expect(heats.get(3)).toMatchObject({ level: 'mid', loss: 1.5 })
    expect(heats.get(4)).toMatchObject({ level: 'far', loss: 5 })
    expect(heats.has(5)).toBe(false) // not evaluated yet
  })

  it('maps losses to levels', () => {
    expect(levelFor(0.4, false)).toBe('near')
    expect(levelFor(2, false)).toBe('mid')
    expect(levelFor(3, false)).toBe('far')
    expect(levelFor(9, true)).toBe('tied')
  })

  it('handles exact rankings and an empty ranking', () => {
    expect(cellHeats([], (m) => m).size).toBe(0)
    const heats = cellHeats(
      [rm(1, 50, { exact: true, n: 0 }), rm(2, 49.5, { exact: true, n: 0 })],
      (m) => m,
    )
    expect(heats.get(2)).toMatchObject({ level: 'near', loss: 0.5, exact: true })
  })
})
