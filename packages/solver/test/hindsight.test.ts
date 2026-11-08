import {
  applyMove,
  type CompiledMap,
  compileMap,
  createState,
  currentScore,
  generateMoves,
  isGameOver,
  kagkotMap,
  MAX_MOVES,
  type MapDef,
  practiceMap,
  Rng,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import {
  anneal,
  beamSearch,
  childHash,
  diceOf,
  FakeWorker,
  HindsightSearch,
  hashState,
  lineScore,
  lineStates,
  planFromMoves,
  polishTail,
  rollsOf,
  runHindsightJob,
  SolverPool,
  solveExact,
  solveHindsight,
  temper,
  zobristFor,
} from '../src/index.ts'

function randomRolls(seed: number, n: number): Uint8Array {
  const rng = new Rng(seed)
  return Uint8Array.from({ length: n }, () => rng.nextInt(36))
}

/** Independent brute force: every legal line, no memo, no hashing. */
function bruteForce(map: CompiledMap, rolls: Uint8Array, s: State, t: number): number {
  if (isGameOver(map, s)) return currentScore(map, s)
  const moves = new Int32Array(MAX_MOVES)
  const count = generateMoves(map, s, rollYellow(rolls[t]), rollRed(rolls[t]), moves)
  let best = -Infinity
  for (let i = 0; i < count; i++) {
    const child = s.slice()
    applyMove(map, child, moves[i])
    best = Math.max(best, bruteForce(map, rolls, child, t + 1))
  }
  return best
}

/** Small sheets where the exact optimum is cheap: scarce boxes make the operations matter. */
function smallMap(n: number): MapDef {
  const cells = Array.from({ length: n }, (_, id) => ({
    id,
    x: (id % 3) + (Math.floor(id / 3) % 2) * 0.5,
    y: Math.floor(id / 3) * 0.87,
    max: id === 1 ? 6 : 12,
  }))
  const edges: [number, number][] = []
  for (let a = 0; a < n; a++) {
    for (let b = a + 1; b < n; b++) {
      const d = Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y)
      if (d < 1.05) edges.push([a, b])
    }
  }
  return {
    id: `small-${n}`,
    name: `small ${n}`,
    rev: 1,
    status: 'practice',
    summit: 20,
    opLimits: [2, 2, 1, 2, 1],
    cells,
    edges,
  }
}

describe('rolls', () => {
  it('round-trip between dice and roll indices, and reject impossible faces', () => {
    const dice = [
      { y: 5, r: 4 },
      { y: 0, r: 6 },
      { y: 2, r: 1 },
    ]
    expect(diceOf(rollsOf(dice))).toEqual(dice)
    expect(() => rollsOf([{ y: 6, r: 1 }])).toThrow(/turn 1/)
    expect(() => rollsOf([{ y: 0, r: 0 }])).toThrow(RangeError)
  })
})

describe('zobrist hashing', () => {
  it('the incremental hash of a child equals the hash computed from scratch', () => {
    const map = compileMap(kagkotMap)
    const z = zobristFor(map)
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1e9 }), (seed) => {
        const rng = new Rng(seed)
        const s = createState(map)
        const h = new Int32Array(2)
        const scratch = new Int32Array(2)
        const moves = new Int32Array(MAX_MOVES)
        hashState(z, map, s, h)
        while (!isGameOver(map, s)) {
          const count = generateMoves(map, s, rng.nextInt(6), 1 + rng.nextInt(6), moves)
          const m = moves[rng.nextInt(count)]
          childHash(z, map, s, h[0], h[1], m, h)
          applyMove(map, s, m)
          hashState(z, map, s, scratch)
          if (scratch[0] !== h[0] || scratch[1] !== h[1]) return false
        }
        return true
      }),
      { numRuns: 30 },
    )
  })
})

describe('exact solver', () => {
  it('matches an independent brute force on small sheets', () => {
    for (const n of [4, 5]) {
      const map = compileMap(smallMap(n))
      for (let seed = 1; seed <= 6; seed++) {
        const rolls = randomRolls(seed, n)
        const line = solveExact(map, rolls, createState(map))
        expect(line).not.toBeNull()
        expect(line?.score).toBe(bruteForce(map, rolls, createState(map), 0))
        expect(lineScore(map, rolls, line?.moves as Int32Array)).toBe(line?.score)
      }
    }
  })

  it('matches the brute force on the last four turns of a real sheet', () => {
    const map = compileMap(kagkotMap)
    const rolls = randomRolls(7, 19)
    const line = beamSearch(map, rolls, { width: 16, seed: 1 })
    const states = lineStates(map, rolls, line.moves)
    const tail = solveExact(map, rolls, states[15])
    expect(tail?.score).toBe(bruteForce(map, rolls, states[15], 15))
    // Polishing never makes a line worse and yields a legal line.
    const polished = polishTail(map, rolls, line, 4)
    expect(polished.score).toBeGreaterThanOrEqual(line.score)
    expect(lineScore(map, rolls, polished.moves)).toBe(polished.score)
  })

  it('gives up cleanly when the node budget is exceeded', () => {
    const map = compileMap(kagkotMap)
    expect(solveExact(map, randomRolls(3, 19), createState(map), 1000)).toBeNull()
  })
})

describe('beam search', () => {
  it('returns a legal line whose score is the engine count, deterministically', () => {
    const map = compileMap(practiceMap)
    const rolls = randomRolls(11, 19)
    const a = beamSearch(map, rolls, { width: 32, seed: 5 })
    const b = beamSearch(map, rolls, { width: 32, seed: 5 })
    expect(Array.from(a.moves)).toEqual(Array.from(b.moves))
    expect(lineScore(map, rolls, a.moves)).toBe(a.score)
  })

  it('a wider beam is never much worse and usually better', () => {
    const map = compileMap(kagkotMap)
    let narrow = 0
    let wide = 0
    for (let seed = 1; seed <= 4; seed++) {
      const rolls = randomRolls(100 + seed, 19)
      narrow += beamSearch(map, rolls, { width: 4, seed }).score
      wide += beamSearch(map, rolls, { width: 128, seed }).score
    }
    expect(wide).toBeGreaterThan(narrow)
  })

  it('can start from a partial sheet', () => {
    const map = compileMap(kagkotMap)
    const rolls = randomRolls(12, 19)
    const full = beamSearch(map, rolls, { width: 16, seed: 1 })
    const states = lineStates(map, rolls, full.moves)
    const rest = beamSearch(map, rolls, { width: 16, seed: 2, start: states[10] })
    expect(rest.moves.length).toBe(9)
    const moves = Int32Array.from([...full.moves.subarray(0, 10), ...rest.moves])
    expect(lineScore(map, rolls, moves)).toBe(rest.score)
  })
})

describe('plan search (annealing, tempering)', () => {
  const map = compileMap(kagkotMap)

  it('plans round-trip to the same moves', () => {
    const rolls = randomRolls(21, 19)
    const line = beamSearch(map, rolls, { width: 16, seed: 1 })
    const plan = planFromMoves(map, rolls, line.moves)
    expect(Array.from(plan.cells)).toEqual(Array.from(line.moves, (m) => m & 31))
  })

  it('never return worse than the start, always legal, deterministic', () => {
    const rolls = randomRolls(22, 19)
    const start = beamSearch(map, rolls, { width: 16, seed: 1 })
    const a = anneal(map, rolls, start, { seed: 3, iterations: 20_000 })
    const b = temper(map, rolls, start, { seed: 3, iterations: 4_000, replicas: 4 })
    const b2 = temper(map, rolls, start, { seed: 3, iterations: 4_000, replicas: 4 })
    for (const line of [a, b]) {
      expect(line.score).toBeGreaterThanOrEqual(start.score)
      expect(lineScore(map, rolls, line.moves)).toBe(line.score)
    }
    expect(Array.from(b.moves)).toEqual(Array.from(b2.moves))
  })

  it('tempering finds the exact optimum on small sheets', () => {
    for (const n of [5, 6]) {
      const small = compileMap(smallMap(n))
      for (let seed = 1; seed <= 5; seed++) {
        const rolls = randomRolls(seed * 13, n)
        const exact = solveExact(small, rolls, createState(small)) as { score: number }
        const found = runHindsightJob(small, rolls, {
          start: new Int32Array(0),
          seed,
          iterations: 3000,
          replicas: 6,
          polish: 0,
        })
        expect(found.score).toBe(exact.score)
      }
    }
  })
})

describe('hindsight search', () => {
  const map = compileMap(kagkotMap)
  const rolls = randomRolls(31, 19)
  const opts = { seed: 9, lanes: 2, rounds: 2, minRounds: 2, iterations: 1500, replicas: 4 }

  it('is deterministic and reports agreement between lanes', () => {
    const a = new HindsightSearch(map, rolls, opts).runToEnd()
    const b = new HindsightSearch(map, rolls, opts).runToEnd()
    expect(a.best.score).toBe(b.best.score)
    expect(Array.from(a.best.moves)).toEqual(Array.from(b.best.moves))
    expect(a.round).toBe(2)
    expect(a.agreeing).toBeGreaterThanOrEqual(1)
    expect(lineScore(map, rolls, a.best.moves)).toBe(a.best.score)
  })

  it('gives the same result through a worker pool', async () => {
    const pool = new SolverPool(() => new FakeWorker(), 2)
    pool.init(map.def.id, map.rules)
    const rounds: number[] = []
    const viaPool = await solveHindsight(pool, map, rolls, {
      ...opts,
      onProgress: (p) => rounds.push(p.best.score),
    })
    pool.terminate()
    const inProcess = new HindsightSearch(map, rolls, opts).runToEnd()
    expect(viaPool?.best.score).toBe(inProcess.best.score)
    expect(rounds.length).toBe(2)
    expect(rounds[1]).toBeGreaterThanOrEqual(rounds[0])
  })

  it('counts only lanes that found the best score by themselves (copies are not evidence)', () => {
    // One elite lane (lane 0): it adopts the best line whenever it is behind.
    const search = new HindsightSearch(map, rolls, { seed: 1, lanes: 3, elite: 1, rounds: 9 })
    const line = (score: number) => ({ moves: new Int32Array(19), score })
    expect(search.ingest([line(80), line(100), line(90)]).agreeing).toBe(1)
    expect(search.plan()[0].start).toBe(search.best?.moves)
    // Lane 0 returns the adopted 100 unchanged (no evidence); lane 2 reaches 100 on its own.
    expect(search.ingest([line(100), line(95), line(100)]).agreeing).toBe(2)
    // Without elitism every lane stays independent.
    const free = new HindsightSearch(map, rolls, { seed: 1, lanes: 2, elite: 0 })
    free.ingest([line(70), line(60)])
    expect(free.plan()[1].start).not.toBe(free.best?.moves)
  })

  it('refuses an incomplete roll sequence', () => {
    expect(() => new HindsightSearch(map, rolls.subarray(0, 10), opts)).toThrow(RangeError)
  })
})
