import { describe, expect, it } from 'vitest'
import {
  BRANCH_COUNT,
  BRANCHES,
  OP_COUNT,
  OP_DIFF,
  OP_HIGH,
  OP_LOW,
  OP_PROD,
  OP_SUM,
  opResult,
  RESULTS,
  ROLL_COUNT,
  rollIndex,
  rollRed,
  rollYellow,
} from '../src/dice.ts'

const countRolls = (op: number, pred: (v: number) => boolean) => {
  let n = 0
  for (let roll = 0; roll < ROLL_COUNT; roll++) if (pred(RESULTS[op * ROLL_COUNT + roll])) n++
  return n
}

const producers = (value: number) => {
  const ops = new Set<number>()
  for (let op = 0; op < OP_COUNT; op++) if (countRolls(op, (v) => v === value) > 0) ops.add(op)
  return [...ops]
}

describe('dice tables', () => {
  it('indexes all 36 rolls with yellow 0-5 and red 1-6', () => {
    const seen = new Set<number>()
    for (let y = 0; y <= 5; y++) {
      for (let r = 1; r <= 6; r++) {
        const roll = rollIndex(y, r)
        expect(rollYellow(roll)).toBe(y)
        expect(rollRed(roll)).toBe(r)
        seen.add(roll)
      }
    }
    expect(seen.size).toBe(ROLL_COUNT)
  })

  it('computes each operation, with a non-negative difference', () => {
    expect(opResult(OP_LOW, 1, 4)).toBe(1)
    expect(opResult(OP_HIGH, 1, 4)).toBe(4)
    expect(opResult(OP_DIFF, 1, 4)).toBe(3)
    expect(opResult(OP_DIFF, 4, 4)).toBe(0)
    expect(opResult(OP_SUM, 1, 4)).toBe(5)
    expect(opResult(OP_PROD, 1, 4)).toBe(4)
    expect(opResult(OP_PROD, 5, 6)).toBe(30)
  })

  it('has the expected ranges per operation', () => {
    const range = (op: number) => {
      const vals = Array.from(RESULTS.subarray(op * ROLL_COUNT, (op + 1) * ROLL_COUNT))
      return [Math.min(...vals), Math.max(...vals)]
    }
    expect(range(OP_LOW)).toEqual([0, 5])
    expect(range(OP_HIGH)).toEqual([1, 6])
    expect(range(OP_DIFF)).toEqual([0, 6])
    expect(range(OP_SUM)).toEqual([1, 11])
    expect(range(OP_PROD)).toEqual([0, 30])
  })

  it('only the product can exceed 12, on exactly 9 of 36 rolls', () => {
    for (const op of [OP_LOW, OP_HIGH, OP_DIFF, OP_SUM])
      expect(countRolls(op, (v) => v > 12)).toBe(0)
    expect(countRolls(OP_PROD, (v) => v > 12)).toBe(9)
  })

  it('12 comes only from the product (3 rolls); 7 and 11 only from the sum', () => {
    expect(producers(12)).toEqual([OP_PROD])
    expect(countRolls(OP_PROD, (v) => v === 12)).toBe(3)
    expect(producers(7)).toEqual([OP_SUM])
    expect(producers(11)).toEqual([OP_SUM])
    expect(countRolls(OP_SUM, (v) => v === 11)).toBe(1)
  })

  it('collapses the 36 rolls into 26 weighted chance branches', () => {
    expect(BRANCH_COUNT).toBe(26)
    expect(BRANCHES.reduce((sum, b) => sum + b.weight, 0)).toBe(ROLL_COUNT)
    for (const b of BRANCHES) expect([1, 2]).toContain(b.weight)
    // Every branch has a distinct result vector.
    const keys = new Set(
      BRANCHES.map((b) =>
        Array.from({ length: OP_COUNT }, (_, op) => RESULTS[op * ROLL_COUNT + b.roll]).join(),
      ),
    )
    expect(keys.size).toBe(26)
  })
})
