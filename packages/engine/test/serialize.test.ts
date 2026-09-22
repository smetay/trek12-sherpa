import { describe, expect, it } from 'vitest'
import { applyMove } from '../src/apply.ts'
import { Rng } from '../src/rng.ts'
import {
  entryFor,
  findMove,
  type GameRecord,
  isGameRecord,
  newRecord,
  ReplayError,
  replay,
} from '../src/serialize.ts'
import { coreOf, createState, currentScore, isGameOver } from '../src/state.ts'
import { legalMoves, practice } from './helpers.ts'

function randomGame(seed: number) {
  const map = practice()
  const rng = new Rng(seed)
  const s = createState(map)
  const record = newRecord(map)
  while (!isGameOver(map, s)) {
    const y = rng.nextInt(6)
    const r = 1 + rng.nextInt(6)
    const moves = legalMoves(map, s, y, r)
    const m = moves[rng.nextInt(moves.length)]
    record.history.push(entryFor(m, y, r))
    applyMove(map, s, m)
  }
  return { map, s, record }
}

describe('game records', () => {
  it('survive a JSON round trip and replay to the same state', () => {
    const { map, s, record } = randomGame(7)
    const parsed: unknown = JSON.parse(JSON.stringify(record))
    expect(isGameRecord(parsed)).toBe(true)
    const replayed = replay(map, parsed as GameRecord)
    expect(Array.from(coreOf(map, replayed))).toEqual(Array.from(coreOf(map, s)))
    expect(currentScore(map, replayed)).toBe(currentScore(map, s))
  })

  it('reject a record for another map or ruleset', () => {
    const { map, record } = randomGame(8)
    expect(() => replay(map, { ...record, mapRev: 99 })).toThrow(ReplayError)
    expect(() =>
      replay(map, { ...record, ruleset: { ...record.ruleset, linkRule: 'optional' } }),
    ).toThrow(/ruleset/)
  })

  it('reject a tampered entry and report the turn', () => {
    const { map, record } = randomGame(9)
    const bad = JSON.parse(JSON.stringify(record)) as GameRecord
    bad.history[5] = { ...bad.history[5], cell: 18 - bad.history[5].cell, down: 3 }
    let error: unknown
    try {
      replay(map, bad)
    } catch (e) {
      error = e
    }
    expect(error).toBeInstanceOf(ReplayError)
    expect((error as ReplayError).turn).toBe(5)
  })

  it('validate the shape of untrusted input', () => {
    expect(isGameRecord(null)).toBe(false)
    expect(isGameRecord({ version: 2 })).toBe(false)
    expect(
      isGameRecord({
        version: 1,
        mapId: 'practice',
        mapRev: 1,
        ruleset: { linkRule: 'mandatory' },
        history: [{ y: 6, r: 1, op: 0, cell: 0, down: -1, up: -1 }],
      }),
    ).toBe(false) // yellow die has no 6
  })

  it('findMove returns the move for an entry and NO_MOVE otherwise', () => {
    const map = practice()
    const s = createState(map)
    expect(findMove(map, s, { y: 1, r: 4, op: 1, cell: 9, down: -1, up: -1 })).not.toBe(-1)
    expect(findMove(map, s, { y: 1, r: 4, op: 1, cell: 9, down: 3, up: -1 })).toBe(-1)
  })
})
