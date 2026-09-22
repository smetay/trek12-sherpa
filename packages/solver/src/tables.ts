import { MAX_VALUE, OP_COUNT, RESULTS, ROLL_COUNT } from '@trek12/engine'

/**
 * REACH[mask * 13 + v] = number of the 36 rolls (0..36) on which at least one operation still
 * available (bit `op` of `mask`) produces the value v (0..12).
 */
export const REACH: Uint8Array = (() => {
  const table = new Uint8Array(32 * (MAX_VALUE + 1))
  for (let mask = 0; mask < 32; mask++) {
    for (let roll = 0; roll < ROLL_COUNT; roll++) {
      let hit = 0
      for (let op = 0; op < OP_COUNT; op++) {
        if ((mask & (1 << op)) === 0) continue
        const v = RESULTS[op * ROLL_COUNT + roll]
        if (v <= MAX_VALUE) hit |= 1 << v
      }
      for (let v = 0; v <= MAX_VALUE; v++) if (hit & (1 << v)) table[mask * (MAX_VALUE + 1) + v]++
    }
  }
  return table
})()

/** Probability (0..1) that a fresh roll can produce `v` with the operations in `mask`. */
export function pReach(mask: number, v: number): number {
  if (v < 0 || v > MAX_VALUE) return 0
  return REACH[mask * (MAX_VALUE + 1) + v] / ROLL_COUNT
}

/** Probability of at least one success in `n` independent tries of probability `p`. */
export function within(p: number, n: number): number {
  if (n <= 0 || p <= 0) return 0
  return 1 - (1 - p) ** n
}
