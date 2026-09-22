import { describe, expect, it } from 'vitest'
import { OP_DIFF, OP_HIGH, OP_LOW, OP_PROD, OP_SUM } from '../src/dice.ts'
import { compileMap } from '../src/map.ts'
import { isLegalMove, moveCell, moveDown, moveOp, moveResult, moveUp } from '../src/moves.ts'
import { cellValue, createState, EMPTY, legalCellMask, SAD } from '../src/state.ts'
import { diceFor, graphMap, legalMoves, pathMap, play, practice } from './helpers.ts'

const linksOf = (moves: number[]) => moves.map((m) => [moveDown(m), moveUp(m)]).sort()
const at = (moves: number[], cell: number, op?: number) =>
  moves.filter((m) => moveCell(m) === cell && (op === undefined || moveOp(m) === op))

describe('placement', () => {
  it('allows any cell on the first turn, then only cells touching a filled one', () => {
    const map = practice()
    const s = createState(map)
    expect(legalCellMask(map, s)).toBe(map.allMask)
    const first = legalMoves(map, s, 1, 4)
    expect(new Set(first.map(moveCell)).size).toBe(19)

    play(map, [{ cell: 9, value: 3 }], s)
    expect(legalCellMask(map, s)).toBe(map.nbrMask[9])
    const second = legalMoves(map, s, 1, 4)
    expect([...new Set(second.map(moveCell))].sort((a, b) => a - b)).toEqual([4, 5, 8, 10, 13, 14])
  })

  it('offers every available operation and hides an exhausted one', () => {
    const map = practice()
    const s = play(map, [
      { cell: 9, value: 3, op: OP_SUM },
      { cell: 4, value: 5, op: OP_SUM },
      { cell: 5, value: 7, op: OP_SUM },
      { cell: 8, value: 9, op: OP_SUM },
    ])
    const ops = new Set(legalMoves(map, s, 2, 3).map(moveOp))
    expect(ops).toEqual(new Set([OP_LOW, OP_HIGH, OP_DIFF, OP_PROD]))
  })

  it('honours per-map operation limits', () => {
    const def = pathMap(3)
    def.opLimits = [0, 0, 0, 3, 0]
    const map = compileMap(def)
    const s = createState(map)
    expect(new Set(legalMoves(map, s, 2, 3).map(moveOp))).toEqual(new Set([OP_SUM]))
  })

  it('treats a ☹ as a filled circle: later numbers may be written next to it', () => {
    const roll = diceFor(OP_PROD, 30) as [number, number]
    const map = compileMap(pathMap(3))
    const s = createState(map)
    const sadMove = at(legalMoves(map, s, ...roll), 1, OP_PROD)[0]
    expect(moveResult(sadMove)).toBe(30)
    play(map, [{ cell: 1, value: 30, op: OP_PROD }], s)
    expect(cellValue(map, s, 1)).toBe(SAD)
    expect(legalCellMask(map, s)).toBe(0b101)
  })
})

describe('cell limits', () => {
  it('writes 12 in a normal cell but turns 13+ into ☹', () => {
    const map = practice()
    let s = play(map, [{ cell: 9, value: 12 }])
    expect(cellValue(map, s, 9)).toBe(12)
    s = play(map, [{ cell: 9, value: 15, op: OP_PROD }])
    expect(cellValue(map, s, 9)).toBe(SAD)
  })

  it('writes 6 in a dangerous cell but turns 7 into ☹', () => {
    const map = practice() // cells 0-2 are dangerous
    let s = play(map, [{ cell: 1, value: 6 }])
    expect(cellValue(map, s, 1)).toBe(6)
    s = play(map, [{ cell: 1, value: 7, op: OP_SUM }])
    expect(cellValue(map, s, 1)).toBe(SAD)
  })

  it('never links or zones a ☹ cell, and a voluntary over-limit move is legal', () => {
    const map = compileMap(pathMap(3))
    const s = play(map, [
      { cell: 1, value: 30, op: OP_PROD },
      { cell: 0, value: 12 },
    ])
    const moves = at(legalMoves(map, s, 2, 6), 2, OP_PROD) // 12 next to the ☹
    expect(linksOf(moves)).toEqual([[EMPTY, EMPTY]])
    expect(isLegalMove(map, s, 2, 6, moves[0])).toBe(true)
  })
})

describe('rope links', () => {
  it('forces the single eligible link and offers no unlinked variant', () => {
    const map = compileMap(pathMap(3))
    const s = play(map, [{ cell: 0, value: 4 }])
    const moves = at(legalMoves(map, s, 0, 5), 1, OP_HIGH) // 5 next to the 4
    expect(linksOf(moves)).toEqual([[0, EMPTY]])
  })

  it('does not link to a neighbour whose slot is already taken', () => {
    const map = compileMap(pathMap(3))
    const s = play(map, [
      { cell: 1, value: 4 },
      { cell: 0, value: 5, down: 1 },
    ])
    const moves = at(legalMoves(map, s, 0, 5), 2, OP_HIGH) // another 5 next to the 4, whose UP is taken
    expect(linksOf(moves)).toEqual([[EMPTY, EMPTY]])
  })

  it('offers exactly one move per eligible neighbour when two 6s compete for a 5', () => {
    // 0 is adjacent to 1 and 2; 1 and 2 are not adjacent to each other.
    const map = compileMap(
      graphMap(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        [
          [0, 1],
          [0, 2],
          [1, 2],
        ],
      ),
    )
    const s = play(map, [
      { cell: 1, value: 6 },
      { cell: 2, value: 6 },
    ])
    const moves = at(legalMoves(map, s, 5, 5), 0, OP_HIGH)
    expect(linksOf(moves)).toEqual([
      [EMPTY, 1],
      [EMPTY, 2],
    ])
  })

  it('merges two chains when both a v-1 and a v+1 neighbour are eligible', () => {
    const tri = compileMap(
      graphMap(
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        [
          [0, 1],
          [1, 2],
          [0, 2],
        ],
      ),
    )
    const s = play(tri, [
      { cell: 0, value: 5 },
      { cell: 2, value: 7, op: OP_SUM },
    ])
    const moves = at(legalMoves(tri, s, 0, 6), 1, OP_HIGH)
    expect(linksOf(moves)).toEqual([[0, 2]])
  })

  it('enumerates 2 x 3 link variants', () => {
    // X = 0 is adjacent to A..E = 1..5, which form a path 1-2-3-4-5 so they can be placed in order.
    const map = compileMap(
      graphMap(
        Array.from({ length: 6 }, (_, i) => ({ x: i, y: 0 })),
        [
          [0, 1],
          [0, 2],
          [0, 3],
          [0, 4],
          [0, 5],
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
      ),
    )
    const s = play(map, [
      { cell: 1, value: 4 },
      { cell: 2, value: 4 },
      { cell: 3, value: 6 },
      { cell: 4, value: 6 },
      { cell: 5, value: 6 },
    ])
    const moves = at(legalMoves(map, s, 5, 5), 0, OP_HIGH)
    expect(moves).toHaveLength(6)
    expect(linksOf(moves)).toEqual([
      [1, 3],
      [1, 4],
      [1, 5],
      [2, 3],
      [2, 4],
      [2, 5],
    ])
  })

  it('never treats an empty neighbour as a 0-1 or a ☹ neighbour as a 12+1', () => {
    const map = compileMap(pathMap(3))
    const s = play(map, [{ cell: 0, value: 3 }])
    const zeroMoves = at(legalMoves(map, s, 0, 1), 1, OP_LOW) // 0 next to the 3 and next to an empty cell
    expect(linksOf(zeroMoves)).toEqual([[EMPTY, EMPTY]])
    expect(isLegalMove(map, s, 0, 1, zeroMoves[0])).toBe(true)
    const s2 = play(map, [{ cell: 1, value: 30, op: OP_PROD }])
    const twelveMoves = at(legalMoves(map, s2, 2, 6), 0, OP_PROD) // 12 next to a ☹
    expect(linksOf(twelveMoves)).toEqual([[EMPTY, EMPTY]])
    expect(isLegalMove(map, s2, 2, 6, twelveMoves[0])).toBe(true)
  })

  it('leaves adjacent consecutive numbers unlinked forever when no slot was free', () => {
    const map = compileMap(pathMap(4))
    const s = play(map, [
      { cell: 1, value: 6 },
      { cell: 2, value: 7, op: OP_SUM },
      { cell: 3, value: 8 },
      { cell: 0, value: 7, op: OP_SUM }, // next to the 6 whose UP is taken
    ])
    expect(s[map.oUp + 0]).toBe(EMPTY)
    expect(s[map.oDown + 0]).toBe(EMPTY)
  })

  it('adds no-link variants under the optional link rule', () => {
    const map = compileMap(pathMap(3), { linkRule: 'optional' })
    const s = play(map, [{ cell: 0, value: 4 }])
    expect(linksOf(at(legalMoves(map, s, 0, 5), 1, OP_HIGH))).toEqual([
      [EMPTY, EMPTY],
      [0, EMPTY],
    ])
  })
})

describe('isLegalMove', () => {
  it('agrees with the generator on generated moves and rejects tampered ones', () => {
    const map = practice()
    const s = play(map, [
      { cell: 9, value: 5 },
      { cell: 4, value: 6 },
    ])
    for (const m of legalMoves(map, s, 2, 4)) expect(isLegalMove(map, s, 2, 4, m)).toBe(true)
    const forced = at(legalMoves(map, s, 2, 4), 5, OP_HIGH)[0] // 4 next to the 5: up-link forced
    expect(moveUp(forced)).toBe(9)
    const unlinked = forced & ~(31 << 18)
    expect(isLegalMove(map, s, 2, 4, unlinked)).toBe(false)
    expect(isLegalMove(map, s, 2, 5, forced)).toBe(false) // different dice, different result
  })
})
