import {
  applyMove,
  currentScore,
  EMPTY,
  META_FILLED,
  moveCell,
  moveOp,
  moveResult,
  OP_COUNT,
  OP_DIFF,
  OP_HIGH,
  OP_LOW,
  OP_PROD,
  OP_SUM,
  type State,
} from '@trek12/engine'
import { pReach, within } from '../tables.ts'
import type { RolloutPolicy } from './types.ts'

/** Feature weights; every feature is expressed in expected points. */
export type HeuristicWeights = {
  rescue: number
  chainEnd: number
  zone: number
  ticks: number
  danger: number
  noise: number
}

export const DEFAULT_WEIGHTS: HeuristicWeights = {
  rescue: 0.8,
  chainEnd: 0.6,
  zone: 0.5,
  ticks: 1.0,
  danger: 0.8,
  noise: 0.0,
}

const TICK_BASE = new Float64Array(OP_COUNT)
TICK_BASE[OP_SUM] = 1.5
TICK_BASE[OP_PROD] = 1.0
TICK_BASE[OP_HIGH] = 0.7
TICK_BASE[OP_LOW] = 0.7
TICK_BASE[OP_DIFF] = 0.6
/** Cost multiplier by ticks left *after* the move (0 = the operation is now exhausted). */
const TICK_LEFT = [1.5, 0.7, 0.3, 0, 0, 0, 0, 0, 0, 0]

function availMask(map: Parameters<RolloutPolicy['choose']>[0], s: State, usedOp: number): number {
  let mask = 0
  for (let op = 0; op < OP_COUNT; op++) {
    const used = s[map.oTicks + op] + (op === usedOp ? 1 : 0)
    if (used < map.opLimits[op]) mask |= 1 << op
  }
  return mask
}

export function makeHeuristicPolicy(
  weights: HeuristicWeights = DEFAULT_WEIGHTS,
  name = 'heuristic',
): RolloutPolicy {
  let scratch: State | null = null
  return {
    name,
    choose(map, s, _y, _r, moves, count, rng) {
      if (scratch === null || scratch.length !== s.length) scratch = new Int32Array(s.length)
      const { oVal, oUp, oDown, nbrStart, nbrList } = map
      const before = currentScore(map, s)
      const turnsLeft = map.n - s[map.oMeta + META_FILLED] - 1 // after this move
      let best = -Infinity
      let bestIdx = 0
      let ties = 1
      for (let i = 0; i < count; i++) {
        const m = moves[i]
        const cell = moveCell(m)
        const op = moveOp(m)
        const v = moveResult(m)
        scratch.set(s)
        applyMove(map, scratch, m)
        let value = currentScore(map, scratch) - before

        const mask = availMask(map, s, op)
        // Tick scarcity: spending a rare operation early costs future flexibility.
        const left = map.opLimits[op] - s[map.oTicks + op] - 1
        value -= weights.ticks * TICK_BASE[op] * TICK_LEFT[left] * (turnsLeft / map.n)

        if (v <= map.cellMax[cell]) {
          // Empty neighbours of the new cell, and whether it ended up an orphan.
          let emptyNbrs = 0
          for (let k = nbrStart[cell]; k < nbrStart[cell + 1]; k++)
            if (scratch[oVal + nbrList[k]] === EMPTY) emptyNbrs++
          const tries = Math.min(emptyNbrs, turnsLeft)
          const linked = scratch[oUp + cell] !== EMPTY || scratch[oDown + cell] !== EMPTY
          const zoned = scratch[map.oZsize + scratch[map.oZid + cell]] > 1
          if (!linked && !zoned) {
            // Orphan for now: expected refund if a v-1, v or v+1 shows up while a neighbour is free.
            const p = pReach(mask, v - 1) + pReach(mask, v) + pReach(mask, v + 1)
            value += weights.rescue * 3 * within(Math.min(1, p), tries)
          }
          // Open chain ends: +2 for a v+1 above, +1 for a v-1 below, if a free neighbour exists.
          if (tries > 0) {
            if (scratch[oUp + cell] === EMPTY)
              value += weights.chainEnd * 2 * within(pReach(mask, v + 1), tries)
            if (scratch[oDown + cell] === EMPTY)
              value += weights.chainEnd * 1 * within(pReach(mask, v - 1), tries)
            value += weights.zone * within(pReach(mask, v), tries)
          }
          // Danger: writing a big number next to dangerous cells is fine; leaving dangerous cells for
          // the end when only big operations remain is not — approximated by remaining small-value reach.
          let dangerousEmpty = 0
          for (let c = 0; c < map.n; c++)
            if (map.cellMax[c] < 12 && scratch[oVal + c] === EMPTY) dangerousEmpty++
          if (dangerousEmpty > 0 && turnsLeft > 0) {
            let pSmall = 0
            for (let x = 0; x <= 6; x++) pSmall += pReach(mask, x)
            value -= weights.danger * 3 * (dangerousEmpty / turnsLeft) * (1 - Math.min(1, pSmall))
          }
        }
        if (weights.noise > 0) value += weights.noise * (rng.nextFloat() - 0.5)
        // Ties are broken uniformly at random: always taking the first candidate would
        // systematically favour the lowest operation and cell indices.
        if (value > best) {
          best = value
          bestIdx = i
          ties = 1
        } else if (value === best && rng.nextInt(++ties) === 0) {
          bestIdx = i
        }
      }
      return bestIdx
    },
  }
}

export const heuristicPolicy = makeHeuristicPolicy()
