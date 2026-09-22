import { OP_COUNT, RESULTS, ROLL_COUNT, rollIndex } from './dice.ts'
import type { CompiledMap } from './map.ts'
import { EMPTY, isNumber, legalCellMask, opAvailable, type State } from './state.ts'

/**
 * A move is one int32:
 *   bits 0-4   cell            bits 8-12  raw result of the operation (0..30)
 *   bits 5-7   operation       bits 13-17 down-link cell + 1 (0 = none)
 *                              bits 18-22 up-link cell + 1 (0 = none)
 * The result is kept raw: whether it becomes a number or a ☹ depends on the target cell.
 */
export type Move = number

export const NO_MOVE = -1

/** Upper bound on legal moves: 5 ops × 30 cells × (4 down × 4 up) link variants. */
export const MAX_MOVES = 2560

export function encodeMove(
  cell: number,
  op: number,
  result: number,
  down: number,
  up: number,
): Move {
  return cell | (op << 5) | (result << 8) | ((down + 1) << 13) | ((up + 1) << 18)
}

export function moveCell(m: Move): number {
  return m & 31
}
export function moveOp(m: Move): number {
  return (m >> 5) & 7
}
export function moveResult(m: Move): number {
  return (m >> 8) & 31
}
export function moveDown(m: Move): number {
  return ((m >> 13) & 31) - 1
}
export function moveUp(m: Move): number {
  return ((m >> 18) & 31) - 1
}

const downCands = new Int32Array(8)
const upCands = new Int32Array(8)

/**
 * Writes every legal move for roll (y, r) into `out` and returns how many there are.
 * Link variants are distinct moves: writing a 5 next to two eligible 6s yields two moves.
 */
export function generateMoves(
  map: CompiledMap,
  s: State,
  y: number,
  r: number,
  out: Int32Array,
): number {
  const n = map.n
  const { oVal, oUp, oDown, nbrStart, nbrList, cellMax } = map
  const cellMask = legalCellMask(map, s)
  const optional = map.rules.linkRule === 'optional'
  const roll = rollIndex(y, r)
  let count = 0

  for (let op = 0; op < OP_COUNT; op++) {
    if (!opAvailable(map, s, op)) continue
    const result = RESULTS[op * ROLL_COUNT + roll]

    for (let cell = 0; cell < n; cell++) {
      if ((cellMask & (1 << cell)) === 0) continue
      if (result > cellMax[cell]) {
        out[count++] = encodeMove(cell, op, result, EMPTY, EMPTY)
        continue
      }
      let nd = 0
      let nu = 0
      for (let i = nbrStart[cell]; i < nbrStart[cell + 1]; i++) {
        const nb = nbrList[i]
        const nv = s[oVal + nb]
        if (!isNumber(nv)) continue
        if (nv === result - 1 && s[oUp + nb] === EMPTY) downCands[nd++] = nb
        else if (nv === result + 1 && s[oDown + nb] === EMPTY) upCands[nu++] = nb
      }
      if (optional || nd === 0) downCands[nd++] = EMPTY
      if (optional || nu === 0) upCands[nu++] = EMPTY
      for (let i = 0; i < nd; i++) {
        for (let j = 0; j < nu; j++) {
          out[count++] = encodeMove(cell, op, result, downCands[i], upCands[j])
        }
      }
    }
  }
  return count
}

/**
 * Slow, independent legality check used by tests and by replay validation.
 * Mirrors the rules directly instead of the generator's shortcuts.
 */
export function isLegalMove(map: CompiledMap, s: State, y: number, r: number, m: Move): boolean {
  const cell = moveCell(m)
  const op = moveOp(m)
  const result = moveResult(m)
  const down = moveDown(m)
  const up = moveUp(m)
  if (cell < 0 || cell >= map.n || op < 0 || op >= OP_COUNT) return false
  if (!opAvailable(map, s, op)) return false
  if (result !== RESULTS[op * ROLL_COUNT + rollIndex(y, r)]) return false
  if ((legalCellMask(map, s) & (1 << cell)) === 0) return false

  const isNbr = (a: number, b: number) => (map.nbrMask[a] & (1 << b)) !== 0
  if (result > map.cellMax[cell]) return down === EMPTY && up === EMPTY

  // Only numbers link: an empty cell (-1) is not a "0 - 1" and a ☹ (13) is not a "12 + 1".
  const eligibleDown = (c: number) =>
    isNbr(cell, c) &&
    isNumber(s[map.oVal + c]) &&
    s[map.oVal + c] === result - 1 &&
    s[map.oUp + c] === EMPTY
  const eligibleUp = (c: number) =>
    isNbr(cell, c) &&
    isNumber(s[map.oVal + c]) &&
    s[map.oVal + c] === result + 1 &&
    s[map.oDown + c] === EMPTY
  if (down !== EMPTY && !eligibleDown(down)) return false
  if (up !== EMPTY && !eligibleUp(up)) return false

  if (map.rules.linkRule === 'mandatory') {
    let anyDown = false
    let anyUp = false
    for (let i = map.nbrStart[cell]; i < map.nbrStart[cell + 1]; i++) {
      const nb = map.nbrList[i]
      if (eligibleDown(nb)) anyDown = true
      if (eligibleUp(nb)) anyUp = true
    }
    if (anyDown && down === EMPTY) return false
    if (anyUp && up === EMPTY) return false
  }
  return true
}
