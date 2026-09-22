import { applyMove } from '../src/apply.ts'
import { OP_COUNT, OP_DIFF, OP_HIGH, OP_LOW, OP_PROD, OP_SUM, opResult } from '../src/dice.ts'
import { type CompiledMap, compileMap, type MapDef } from '../src/map.ts'
import { practiceMap } from '../src/maps/practice.ts'
import {
  generateMoves,
  MAX_MOVES,
  type Move,
  moveCell,
  moveDown,
  moveOp,
  moveUp,
} from '../src/moves.ts'
import type { Ruleset } from '../src/ruleset.ts'
import { createState, type State, ticksUsed } from '../src/state.ts'

export const practice = (rules?: Partial<Ruleset>): CompiledMap =>
  compileMap(practiceMap, { linkRule: 'mandatory', ...rules })

/** A path graph 0-1-2-…-(n-1); handy for precise link scenarios. */
export function pathMap(n: number, dangerous: number[] = []): MapDef {
  return {
    id: 'path',
    name: 'path',
    rev: 1,
    status: 'practice',
    summit: 50,
    opLimits: [4, 4, 4, 4, 4],
    cells: Array.from({ length: n }, (_, id) => ({
      id,
      x: id,
      y: 0,
      max: dangerous.includes(id) ? 6 : 12,
    })),
    edges: Array.from({ length: n - 1 }, (_, i) => [i, i + 1] as [number, number]),
  }
}

/** A fully specified small map from an edge list. */
export function graphMap(
  cells: { x: number; y: number; max?: number }[],
  edges: [number, number][],
): MapDef {
  return {
    id: 'graph',
    name: 'graph',
    rev: 1,
    status: 'practice',
    summit: 50,
    opLimits: [4, 4, 4, 4, 4],
    cells: cells.map((c, id) => ({ id, x: c.x, y: c.y, max: c.max ?? 12 })),
    edges,
  }
}

const OP_PREFERENCE = [OP_LOW, OP_HIGH, OP_DIFF, OP_PROD, OP_SUM]

/** Some roll (y, r) for which `op` yields `value`, or undefined. */
export function diceFor(op: number, value: number): [number, number] | undefined {
  for (let y = 0; y <= 5; y++)
    for (let r = 1; r <= 6; r++) if (opResult(op, y, r) === value) return [y, r]
  return undefined
}

export type Step = { cell: number; value: number; op?: number; down?: number; up?: number }

export function legalMoves(map: CompiledMap, s: State, y: number, r: number): Move[] {
  const out = new Int32Array(MAX_MOVES)
  const count = generateMoves(map, s, y, r, out)
  return Array.from(out.subarray(0, count))
}

/**
 * Plays a scripted sequence. Each step picks an operation that can still produce the value
 * (or the given one), finds the legal move with the requested links, and applies it.
 */
export function play(map: CompiledMap, steps: Step[], s: State = createState(map)): State {
  steps.forEach((step, i) => {
    const ops = step.op === undefined ? OP_PREFERENCE : [step.op]
    let chosen: { op: number; y: number; r: number } | undefined
    for (const op of ops) {
      if (op < 0 || op >= OP_COUNT || ticksUsed(map, s, op) >= map.opLimits[op]) continue
      const dice = diceFor(op, step.value)
      if (dice) {
        chosen = { op, y: dice[0], r: dice[1] }
        break
      }
    }
    if (!chosen) throw new Error(`step ${i}: no operation left can produce ${step.value}`)
    const wantDown = step.down ?? -1
    const wantUp = step.up ?? -1
    const moves = legalMoves(map, s, chosen.y, chosen.r).filter(
      (m) => moveCell(m) === step.cell && moveOp(m) === chosen.op,
    )
    const exact = moves.find((m) => moveDown(m) === wantDown && moveUp(m) === wantUp)
    const m =
      exact ??
      (step.down === undefined && step.up === undefined && moves.length === 1
        ? moves[0]
        : undefined)
    if (m === undefined) {
      throw new Error(
        `step ${i}: no legal move writes ${step.value} in cell ${step.cell} with links down=${wantDown} up=${wantUp} (candidates: ${moves.map((x) => `d${moveDown(x)}/u${moveUp(x)}`).join(' ') || 'none'})`,
      )
    }
    applyMove(map, s, m)
  })
  return s
}
