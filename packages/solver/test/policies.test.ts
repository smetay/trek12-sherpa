import {
  applyMove,
  compileMap,
  createState,
  generateMoves,
  isGameOver,
  isLegalMove,
  kagkotMap,
  MAX_MOVES,
  practiceMap,
  Rng,
} from '@trek12/engine'
import { describe, expect, it } from 'vitest'
import {
  greedyPolicy,
  heuristicPolicy,
  POLICIES,
  randomPolicy,
  simulateGame,
  stats,
} from '../src/index.ts'
import { pReach, REACH } from '../src/tables.ts'

describe('reachability table', () => {
  it('matches known facts: 12 only via the product, 7 only via the sum, 11 on one roll', () => {
    expect(pReach(0b11111, 12)).toBeCloseTo(3 / 36)
    expect(pReach(0b01111, 12)).toBe(0) // product exhausted
    expect(pReach(0b10111, 7)).toBe(0) // sum exhausted
    expect(pReach(0b11111, 11)).toBeCloseTo(1 / 36)
    expect(pReach(0, 3)).toBe(0)
    expect(REACH.length).toBe(32 * 13)
  })
})

describe('policies', () => {
  const map = compileMap(practiceMap)
  const moves = new Int32Array(MAX_MOVES)

  it.each(POLICIES.map((p) => [p.name, p] as const))(
    '%s only ever picks legal moves',
    (_, policy) => {
      const rng = new Rng(3)
      const s = createState(map)
      while (!isGameOver(map, s)) {
        const y = rng.nextInt(6)
        const r = 1 + rng.nextInt(6)
        const count = generateMoves(map, s, y, r, moves)
        const idx = policy.choose(map, s, y, r, moves, count, rng)
        expect(idx).toBeGreaterThanOrEqual(0)
        expect(idx).toBeLessThan(count)
        expect(isLegalMove(map, s, y, r, moves[idx])).toBe(true)
        applyMove(map, s, moves[idx])
      }
    },
  )

  it('simulations are deterministic for a seed', () => {
    expect(simulateGame(map, heuristicPolicy, 42)).toBe(simulateGame(map, heuristicPolicy, 42))
    expect(simulateGame(map, randomPolicy, 7)).toBe(simulateGame(map, randomPolicy, 7))
  })

  it('greedy beats random and the heuristic beats greedy on paired seeds (Kagkot)', () => {
    const real = compileMap(kagkotMap)
    const n = 300
    const mean = (policy: typeof randomPolicy) =>
      stats(Array.from({ length: n }, (_, g) => simulateGame(real, policy, 1000 + g))).mean
    const r = mean(randomPolicy)
    const g = mean(greedyPolicy)
    const h = mean(heuristicPolicy)
    expect(g).toBeGreaterThan(r + 15)
    expect(h).toBeGreaterThan(g)
  })
})
