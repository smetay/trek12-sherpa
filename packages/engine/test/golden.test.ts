import { describe, expect, it } from 'vitest'
import { OP_PROD, OP_SUM } from '../src/dice.ts'
import { compileMap, type MapDef } from '../src/map.ts'
import { scoreBreakdown } from '../src/score.ts'
import { currentScore } from '../src/state.ts'
import { graphMap, play, type Step } from './helpers.ts'

/**
 * The two worked examples of the rulebooks (FR p.7 = 88 points, EN p.7 = 76 points), rebuilt on
 * synthetic graphs that reproduce the same chains, zones, bonuses and penalties.
 * The same examples are replayed on the real Kagkot grid once it is digitised (M1b).
 */
const chain = (cells: number[], values: number[]): Step[] =>
  cells.map((cell, i) => ({ cell, value: values[i], ...(i > 0 ? { up: cells[i - 1] } : {}) }))

const pathEdges = (cells: number[]): [number, number][] =>
  cells.slice(1).map((c, i) => [cells[i], c] as [number, number])

describe('rulebook worked examples', () => {
  it('FR example: chains 13+14+5+13 (+20), zones 13+8+4 (+1), one orphan = 88', () => {
    const def: MapDef = graphMap(
      Array.from({ length: 18 }, (_, i) => ({ x: i, y: 0 })),
      [
        ...pathEdges([0, 1, 2, 3, 4, 5, 6, 7]), // 7-6-5-4-3-2-1-0
        [1, 8],
        [8, 9], // two more 6s next to the chain's 6
        [4, 12],
        [12, 11],
        [11, 10], // 1-2-3 chain whose 3 touches the chain's 3
        [7, 13],
        [13, 14], // 12-11
        [13, 15],
        [15, 16], // second 12-11, the 12s touch
        [14, 17], // orphan 7 next to an 11
      ],
    )
    const map = compileMap(def)
    const s = play(map, [
      ...chain([0, 1, 2, 3, 4, 5, 6, 7], [7, 6, 5, 4, 3, 2, 1, 0]).map((st, i) =>
        i === 0 ? { ...st, op: OP_SUM } : st,
      ),
      { cell: 8, value: 6 },
      { cell: 9, value: 6 },
      { cell: 12, value: 3 },
      { cell: 11, value: 2, up: 12 },
      { cell: 10, value: 1, up: 11 },
      { cell: 13, value: 12 },
      { cell: 14, value: 11, up: 13 },
      { cell: 15, value: 12 },
      { cell: 16, value: 11, up: 15 },
      { cell: 17, value: 7, op: OP_SUM },
    ])
    const b = scoreBreakdown(map, s)
    expect(b.chains.map((c) => c.points).sort((x, y) => x - y)).toEqual([5, 13, 13, 14])
    expect(b.longestChain).toBe(8)
    expect(b.chainBonus).toBe(20)
    expect(b.zones.map((z) => z.points).sort((x, y) => x - y)).toEqual([4, 8, 13])
    expect(b.largestZone).toBe(3)
    expect(b.zoneBonus).toBe(1)
    expect(b.orphanCells).toEqual([17])
    expect(b.sadCells).toEqual([])
    expect(b.total).toBe(88)
    expect(currentScore(map, s)).toBe(88)
  })

  it('EN example: lines 14+14+13+3 (+20), zones 13+4 (+1), two ☹ = 76', () => {
    const def: MapDef = graphMap(
      Array.from({ length: 19 }, (_, i) => ({ x: i, y: 0 })),
      [
        ...pathEdges([0, 1, 2, 3, 4, 5, 6, 7]), // 7..0
        [7, 8],
        [8, 9],
        [9, 10], // 12-11-10
        [8, 11],
        [11, 12], // 12-11, the 12s touch
        [10, 13],
        [13, 14], // 2-1 next to the 10
        [13, 15],
        [15, 16], // two more 2s: zone of three 2s
        [16, 17], // orphan 9
        [17, 18], // ☹ (product 15)
      ],
    )
    const map = compileMap(def)
    const s = play(map, [
      { cell: 0, value: 7, op: OP_SUM },
      ...[6, 5, 4, 3, 2, 1, 0].map((value, i) => ({ cell: i + 1, value, up: i })),
      { cell: 8, value: 12 },
      { cell: 9, value: 11, up: 8 },
      { cell: 10, value: 10, op: OP_SUM, up: 9 },
      { cell: 11, value: 12 },
      { cell: 12, value: 11, up: 11 },
      { cell: 13, value: 2 },
      { cell: 14, value: 1, up: 13 },
      { cell: 15, value: 2 },
      { cell: 16, value: 2 },
      { cell: 17, value: 9, op: OP_PROD },
      { cell: 18, value: 15, op: OP_PROD },
    ])
    const b = scoreBreakdown(map, s)
    expect(b.chains.map((c) => c.points).sort((x, y) => x - y)).toEqual([3, 13, 14, 14])
    expect(b.chainBonus).toBe(20)
    expect(b.zones.map((z) => z.points).sort((x, y) => x - y)).toEqual([4, 13])
    expect(b.zoneBonus).toBe(1)
    expect(b.orphanCells).toEqual([17])
    expect(b.sadCells).toEqual([18])
    expect(b.total).toBe(76)
    expect(currentScore(map, s)).toBe(76)
  })
})
