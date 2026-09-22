import { applyMove } from './apply.ts'
import { isRedFace, isYellowFace, OP_COUNT } from './dice.ts'
import type { CompiledMap } from './map.ts'
import { generateMoves, MAX_MOVES, type Move, moveCell, moveDown, moveOp, moveUp } from './moves.ts'
import { isRuleset, type Ruleset, sameRuleset } from './ruleset.ts'
import { createState, type State } from './state.ts'

/** One turn as played: the roll and the choice. The value and any ☹ are re-derived on replay. */
export type HistoryEntry = {
  y: number
  r: number
  op: number
  cell: number
  /** Linked neighbours, -1 for none. */
  down: number
  up: number
}

export type GameRecord = {
  version: 1
  mapId: string
  mapRev: number
  ruleset: Ruleset
  history: HistoryEntry[]
}

export class ReplayError extends Error {
  /** Index of the offending history entry, or -1 when the record itself does not match the map. */
  readonly turn: number

  constructor(message: string, turn: number) {
    super(message)
    this.name = 'ReplayError'
    this.turn = turn
  }
}

export function entryFor(move: Move, y: number, r: number): HistoryEntry {
  return { y, r, op: moveOp(move), cell: moveCell(move), down: moveDown(move), up: moveUp(move) }
}

export function newRecord(map: CompiledMap): GameRecord {
  return {
    version: 1,
    mapId: map.def.id,
    mapRev: map.def.rev,
    ruleset: { ...map.rules },
    history: [],
  }
}

const isInt = (v: unknown): v is number => Number.isInteger(v)

export function isHistoryEntry(value: unknown): value is HistoryEntry {
  if (typeof value !== 'object' || value === null) return false
  const e = value as Record<string, unknown>
  return (
    isInt(e.y) &&
    isYellowFace(e.y) &&
    isInt(e.r) &&
    isRedFace(e.r) &&
    isInt(e.op) &&
    e.op >= 0 &&
    e.op < OP_COUNT &&
    isInt(e.cell) &&
    isInt(e.down) &&
    isInt(e.up)
  )
}

export function isGameRecord(value: unknown): value is GameRecord {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return (
    rec.version === 1 &&
    typeof rec.mapId === 'string' &&
    isInt(rec.mapRev) &&
    isRuleset(rec.ruleset) &&
    Array.isArray(rec.history) &&
    rec.history.every(isHistoryEntry)
  )
}

const scratch = new Int32Array(MAX_MOVES)

/** Finds the legal move matching an entry, or NO_MOVE. */
export function findMove(map: CompiledMap, s: State, e: HistoryEntry): Move {
  const count = generateMoves(map, s, e.y, e.r, scratch)
  for (let i = 0; i < count; i++) {
    const m = scratch[i]
    if (
      moveCell(m) === e.cell &&
      moveOp(m) === e.op &&
      moveDown(m) === e.down &&
      moveUp(m) === e.up
    ) {
      return m
    }
  }
  return -1
}

/**
 * Rebuilds the state by replaying a record. Every entry is validated against the rules, so a
 * corrupted or hand-edited record is rejected with the offending turn index.
 */
export function replay(map: CompiledMap, record: GameRecord): State {
  if (record.mapId !== map.def.id || record.mapRev !== map.def.rev) {
    throw new ReplayError(
      `record is for map ${record.mapId}@${record.mapRev}, not ${map.def.id}@${map.def.rev}`,
      -1,
    )
  }
  if (!sameRuleset(record.ruleset, map.rules)) {
    throw new ReplayError('record ruleset differs from the compiled map ruleset', -1)
  }
  const s = createState(map)
  record.history.forEach((e, turn) => {
    const m = findMove(map, s, e)
    if (m === -1) throw new ReplayError(`turn ${turn + 1}: move is not legal`, turn)
    applyMove(map, s, m)
  })
  return s
}
