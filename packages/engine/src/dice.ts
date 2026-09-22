/**
 * Dice and operations.
 *
 * Trek 12 rolls a yellow die (faces 0–5) and a red die (faces 1–6): 36 equiprobable outcomes.
 * Every operation is symmetric in the two dice, so outcomes with the same unordered pair of
 * faces are indistinguishable — the 36 rolls collapse to 26 distinct chance branches.
 */

export const OP_LOW = 0
export const OP_HIGH = 1
export const OP_DIFF = 2
export const OP_SUM = 3
export const OP_PROD = 4
export const OP_COUNT = 5

export type Op = 0 | 1 | 2 | 3 | 4

export const OP_NAMES = ['low', 'high', 'diff', 'sum', 'prod'] as const
export type OpName = (typeof OP_NAMES)[number]

export const YELLOW_MIN = 0
export const YELLOW_MAX = 5
export const RED_MIN = 1
export const RED_MAX = 6
export const ROLL_COUNT = 36

/** Largest value an operation can produce (5 × 6). */
export const MAX_RESULT = 30

export function isYellowFace(y: number): boolean {
  return Number.isInteger(y) && y >= YELLOW_MIN && y <= YELLOW_MAX
}

export function isRedFace(r: number): boolean {
  return Number.isInteger(r) && r >= RED_MIN && r <= RED_MAX
}

/** Index in 0..35 of the roll (yellow y, red r). */
export function rollIndex(y: number, r: number): number {
  return y * 6 + (r - 1)
}

export function rollYellow(roll: number): number {
  return (roll / 6) | 0
}

export function rollRed(roll: number): number {
  return (roll % 6) + 1
}

export function opResult(op: number, y: number, r: number): number {
  switch (op) {
    case OP_LOW:
      return y < r ? y : r
    case OP_HIGH:
      return y > r ? y : r
    case OP_DIFF:
      return y > r ? y - r : r - y
    case OP_SUM:
      return y + r
    case OP_PROD:
      return y * r
    default:
      throw new RangeError(`unknown operation ${op}`)
  }
}

/** `RESULTS[op * ROLL_COUNT + roll]` — result of every operation for every roll. */
export const RESULTS: Int8Array = (() => {
  const table = new Int8Array(OP_COUNT * ROLL_COUNT)
  for (let op = 0; op < OP_COUNT; op++) {
    for (let roll = 0; roll < ROLL_COUNT; roll++) {
      table[op * ROLL_COUNT + roll] = opResult(op, rollYellow(roll), rollRed(roll))
    }
  }
  return table
})()

export type Branch = {
  /** Representative roll index (0..35). */
  roll: number
  /** Probability numerator over 36 (1 or 2). */
  weight: number
}

/** The 26 distinct chance branches, weights summing to 36. */
export const BRANCHES: readonly Branch[] = (() => {
  const seen = new Map<string, Branch>()
  for (let roll = 0; roll < ROLL_COUNT; roll++) {
    const key = Array.from({ length: OP_COUNT }, (_, op) => RESULTS[op * ROLL_COUNT + roll]).join(
      ',',
    )
    const existing = seen.get(key)
    if (existing) existing.weight++
    else seen.set(key, { roll, weight: 1 })
  }
  return [...seen.values()]
})()

export const BRANCH_COUNT = BRANCHES.length
