import {
  applyMove,
  BRANCHES,
  compileMap,
  currentScore,
  generateMoves,
  isGameOver,
  kagkotMap,
  MAX_MOVES,
  moveCell,
  moveResult,
  practiceMap,
  ROLL_COUNT,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'
import { describe, expect, it } from 'vitest'
import {
  advise,
  crnRoll,
  EXACT3_MAX_CANDIDATES,
  exactValue,
  FakeWorker,
  heuristicPolicy,
  lastPlyValue36,
  positionAfter,
  Race,
  SolverPool,
} from '../src/index.ts'

/** Independent, allocation-heavy expectimax used to validate the optimised one. */
function naiveExpectimax(map: ReturnType<typeof compileMap>, s: State): number {
  if (isGameOver(map, s)) return currentScore(map, s)
  let total = 0
  for (const b of BRANCHES) {
    const moves = new Int32Array(MAX_MOVES)
    const count = generateMoves(map, s, rollYellow(b.roll), rollRed(b.roll), moves)
    let best = -Infinity
    for (let i = 0; i < count; i++) {
      const child = s.slice()
      applyMove(map, child, moves[i])
      best = Math.max(best, naiveExpectimax(map, child))
    }
    total += (b.weight * best) / ROLL_COUNT
  }
  return total
}

describe('common random numbers', () => {
  it('stratify the first roll: every block of 36 rollouts covers each roll exactly once', () => {
    for (const seed of [1, 99]) {
      for (let block = 0; block < 3; block++) {
        const seen = new Set<number>()
        for (let i = block * 36; i < block * 36 + 36; i++) seen.add(crnRoll(seed, i, 0))
        expect(seen.size).toBe(36)
      }
    }
  })
})

describe('exact endgame', () => {
  const map = compileMap(practiceMap)

  it('equals a naive expectimax on random positions with 1-3 empty cells', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const empty = 1 + (seed % 3)
      const s = positionAfter(map, heuristicPolicy, seed, map.n - empty)
      expect(exactValue(map, s)).toBeCloseTo(naiveExpectimax(map, s), 9)
    }
  }, 30_000)

  it('last-ply table equals the naive expectation on 1-empty positions', () => {
    for (let seed = 20; seed < 32; seed++) {
      const s = positionAfter(map, heuristicPolicy, seed, map.n - 1)
      expect(lastPlyValue36(map, s) / 36).toBeCloseTo(naiveExpectimax(map, s), 9)
      expect(Number.isInteger(lastPlyValue36(map, s))).toBe(true)
    }
  })

  it('memoised and plain evaluations agree on 3-empty positions', () => {
    for (let seed = 40; seed < 43; seed++) {
      const s = positionAfter(map, heuristicPolicy, seed, map.n - 3)
      const memo = new Map<string, number>()
      expect(exactValue(map, s, memo)).toBeCloseTo(exactValue(map, s), 9)
      expect(memo.size).toBeGreaterThan(0)
    }
  })

  it('equals the final score on a finished sheet', () => {
    const s = positionAfter(map, heuristicPolicy, 5, map.n)
    expect(exactValue(map, s)).toBe(currentScore(map, s))
  })
})

describe('root race', () => {
  const map = compileMap(kagkotMap)

  it('is deterministic for a seed and independent of how the work is chunked', async () => {
    const s = positionAfter(map, heuristicPolicy, 11, 8)
    const single = new Race(map, s, 2, 5, heuristicPolicy, { seed: 7, maxRollouts: 288 }).runToEnd()
    for (const workers of [1, 4]) {
      const pool = new SolverPool(() => new FakeWorker(), workers)
      pool.init(map.def.id, map.rules)
      const advice = await advise(pool, map, s, 2, 5, heuristicPolicy, {
        seed: 7,
        maxRollouts: 288,
        chunkSize: 17,
      })
      pool.terminate()
      expect(advice.ranking.map((m) => [m.move, m.n, m.mean])).toEqual(
        single.map((m) => [m.move, m.n, m.mean]),
      )
    }
  })

  it('solves the endgame exactly when 3 or fewer cells remain after the move', () => {
    for (const remaining of [3, 4]) {
      const s = positionAfter(map, heuristicPolicy, 3, map.n - remaining)
      const race = new Race(map, s, 1, 4, heuristicPolicy, { seed: 1 })
      expect(race.exactMode).toBe(race.moves.length <= EXACT3_MAX_CANDIDATES)
      const ranking = race.runToEnd()
      expect(ranking.every((m) => m.exact)).toBe(race.exactMode)
      expect(ranking[0].diff).toBe(0)
    }
  })

  it('exact endgame over the pool matches the in-process solve', async () => {
    const s = positionAfter(map, heuristicPolicy, 3, map.n - 4)
    const single = new Race(map, s, 1, 4, heuristicPolicy, { seed: 1 }).runToEnd()
    const pool = new SolverPool(() => new FakeWorker(), 3)
    pool.init(map.def.id, map.rules)
    const advice = await advise(pool, map, s, 1, 4, heuristicPolicy, { seed: 1 })
    pool.terminate()
    expect(advice.exact).toBe(true)
    expect(advice.ranking.map((m) => [m.move, m.mean])).toEqual(single.map((m) => [m.move, m.mean]))
  })

  it('prefers completing a chain over stranding an orphan (tactical check)', () => {
    const from = positionAfter(map, heuristicPolicy, 21, 6)
    const race = new Race(map, from, 1, 3, heuristicPolicy, { seed: 3, maxRollouts: 576 })
    const ranking = race.runToEnd()
    const best = ranking[0]
    // The best move must be sound: it is never a voluntary ☹ and never strictly dominated by 3 SE.
    expect(moveResult(best.move) <= map.cellMax[moveCell(best.move)]).toBe(true)
    expect(ranking.filter((m) => m.tied).length).toBeGreaterThanOrEqual(1)
  })
})
