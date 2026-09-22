import { describe, expect, it } from 'vitest'
import { OP_PROD, OP_SUM } from '../src/dice.ts'
import { compileMap } from '../src/map.ts'
import { scoreBreakdown } from '../src/score.ts'
import { bonusFor, chainPoints, currentScore, zonePoints } from '../src/state.ts'
import { graphMap, pathMap, play, practice } from './helpers.ts'

describe('bonus table', () => {
  it('matches the printed table and grows by 5 beyond 9', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 19].map(bonusFor)).toEqual([
      0, 0, 0, 1, 3, 6, 10, 15, 20, 25, 30, 35, 75,
    ])
  })
  it('scores chains and zones per the rulebook formulas', () => {
    expect(chainPoints(4, 7)).toBe(10) // 4-5-6-7: 7 + 3
    expect(chainPoints(5, 5)).toBe(0) // a lone number is not a chain
    expect(zonePoints(6, 3)).toBe(8)
    expect(zonePoints(6, 1)).toBe(0)
  })
})

describe('incremental scoring', () => {
  const path = () => compileMap(pathMap(6))

  it('scores a growing chain: +v+1/+2 to start, +2 on top, +1 at the bottom', () => {
    const map = path()
    const s = play(map, [{ cell: 2, value: 5 }])
    expect(currentScore(map, s)).toBe(-3) // orphan
    play(map, [{ cell: 3, value: 6 }], s) // 5-6 = 7, rescues the orphan
    expect(currentScore(map, s)).toBe(7)
    play(map, [{ cell: 4, value: 7, op: OP_SUM }], s) // 5-6-7 = 9 + bonus(3)=1
    expect(currentScore(map, s)).toBe(10)
    play(map, [{ cell: 1, value: 4 }], s) // 4-5-6-7 = 10 + bonus(4)=3
    expect(currentScore(map, s)).toBe(13)
  })

  it('merging two real chains through v changes the chain sum by 3 - v', () => {
    // Path 0-1-2-3-4 plus a 1-3 shortcut so 8 can be written before the gap cell 2.
    const map = compileMap(
      graphMap(
        Array.from({ length: 5 }, (_, i) => ({ x: i, y: 0 })),
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [1, 3],
        ],
      ),
    )
    const s = play(map, [
      { cell: 0, value: 5 },
      { cell: 1, value: 6 },
      { cell: 3, value: 8 },
      { cell: 4, value: 9, op: OP_SUM },
    ])
    const chainSum = (st: typeof s) =>
      scoreBreakdown(map, st).chains.reduce((a, c) => a + c.points, 0)
    expect(chainSum(s)).toBe(7 + 10)
    const before = currentScore(map, s)
    play(map, [{ cell: 2, value: 7, op: OP_SUM, down: 1, up: 3 }], s)
    expect(scoreBreakdown(map, s).chains).toEqual([
      { cells: [0, 1, 2, 3, 4], min: 5, max: 9, points: 13 },
    ])
    expect(chainSum(s)).toBe(17 + (3 - 7))
    expect(currentScore(map, s) - before).toBe(3 - 7 + bonusFor(5))
  })

  it('bridging two zones of v changes the zone sum by 2 - v', () => {
    // Cycle 0-1-2-3-4-5-0.
    const map = compileMap(
      graphMap(
        Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 })),
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
          [5, 0],
        ],
      ),
    )
    const s = play(map, [
      { cell: 0, value: 4 },
      { cell: 1, value: 4 },
      { cell: 2, value: 8 },
      { cell: 3, value: 4 },
      { cell: 4, value: 4 },
    ])
    expect(scoreBreakdown(map, s).zones.map((z) => z.points)).toEqual([5, 5])
    const before = currentScore(map, s)
    play(map, [{ cell: 5, value: 4 }], s) // bridges both zones: one zone of five 4s = 8, bonus(5)=6
    expect(scoreBreakdown(map, s).zones.map((z) => z.points)).toEqual([8])
    expect(currentScore(map, s) - before).toBe(2 - 4 + bonusFor(5))
  })

  it('a zone of 0s scores its size minus one', () => {
    const map = path()
    const s = play(map, [
      { cell: 0, value: 0 },
      { cell: 1, value: 0 },
      { cell: 2, value: 0 },
    ])
    expect(scoreBreakdown(map, s).zones).toEqual([{ cells: [0, 1, 2], value: 0, points: 2 }])
    expect(currentScore(map, s)).toBe(2 + bonusFor(3))
  })

  it('counts a cell in both a chain and a zone, and never as an orphan', () => {
    // 0-1-2 path plus 3 hanging off 1.
    const map = compileMap(
      graphMap(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
          { x: 1, y: 1 },
        ],
        [
          [0, 1],
          [1, 2],
          [1, 3],
        ],
      ),
    )
    const s = play(map, [
      { cell: 0, value: 4 },
      { cell: 1, value: 5 },
      { cell: 3, value: 5 },
    ])
    const b = scoreBreakdown(map, s)
    expect(b.chains).toEqual([{ cells: [0, 1], min: 4, max: 5, points: 6 }])
    expect(b.zones).toEqual([{ cells: [1, 3], value: 5, points: 6 }])
    expect(b.orphanCells).toEqual([])
    expect(b.total).toBe(12)
  })

  it('pays each size bonus once, on the single longest chain / largest zone', () => {
    const map = path()
    const s = play(map, [
      { cell: 0, value: 1 },
      { cell: 1, value: 2 },
      { cell: 2, value: 3 },
      { cell: 3, value: 9, op: OP_SUM },
      { cell: 4, value: 10, op: OP_SUM },
      { cell: 5, value: 11, op: OP_SUM },
    ])
    const b = scoreBreakdown(map, s)
    expect(b.chains.map((c) => c.points)).toEqual([5, 13])
    expect(b.longestChain).toBe(3)
    expect(b.chainBonus).toBe(1)
    expect(b.total).toBe(5 + 13 + 1)
    expect(currentScore(map, s)).toBe(b.total)
  })

  it('charges 3 per orphan, refunds it when the orphan is rescued, and never double-counts ☹', () => {
    const map = path()
    const s = play(map, [{ cell: 2, value: 9, op: OP_SUM }])
    expect(currentScore(map, s)).toBe(-3)
    play(map, [{ cell: 3, value: 30, op: OP_PROD }], s) // ☹
    expect(currentScore(map, s)).toBe(-6)
    play(map, [{ cell: 1, value: 9, op: OP_SUM }], s) // zone of two 9s = 10, orphan rescued
    expect(currentScore(map, s)).toBe(10 - 3)
    const b = scoreBreakdown(map, s)
    expect(b.sadCells).toEqual([3])
    expect(b.orphanCells).toEqual([])
    expect(b.penalty).toBe(3)
  })

  it('scores an all-☹ sheet at -3 per cell', () => {
    const def = pathMap(19)
    def.opLimits = [0, 0, 0, 0, 19]
    const map = compileMap(def)
    const s = play(
      map,
      Array.from({ length: 19 }, (_, cell) => ({ cell, value: 30, op: OP_PROD })),
    )
    expect(currentScore(map, s)).toBe(-57)
    expect(scoreBreakdown(map, s).total).toBe(-57)
  })

  it('keeps the practice map consistent between incremental and from-scratch scoring', () => {
    const map = practice()
    const s = play(map, [
      { cell: 9, value: 6 },
      { cell: 4, value: 6 },
      { cell: 5, value: 7, op: OP_SUM, down: 9 }, // two eligible 6s: pick the one in cell 9
      { cell: 10, value: 8 },
      { cell: 14, value: 8 },
      { cell: 13, value: 9, op: OP_SUM },
    ])
    expect(currentScore(map, s)).toBe(scoreBreakdown(map, s).total)
  })
})
