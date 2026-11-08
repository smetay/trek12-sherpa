import {
  applyMove,
  type CompiledMap,
  compileMap,
  createState,
  currentScore,
  dunaiMap,
  EMPTY,
  generateMoves,
  kagkotMap,
  MAX_MOVES,
  RESULTS,
  Rng,
  ROLL_COUNT,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'
import { describe, expect, it } from 'vitest'
import {
  FakeWorker,
  heuristicPolicy,
  lineScore,
  positionAfter,
  Race,
  reviewGame,
  SheetReconstructor,
  SolverPool,
  sherpaLine,
} from '../src/index.ts'

function randomRolls(seed: number, n = 19): Uint8Array {
  const rng = new Rng(seed)
  return Uint8Array.from({ length: n }, () => rng.nextInt(36))
}

/** A game played by the heuristic on known rolls: moves and final sheet. */
function playGame(map: CompiledMap, rolls: Uint8Array, seed: number) {
  const rng = new Rng(seed)
  const s = createState(map)
  const moves = new Int32Array(map.n)
  const buf = new Int32Array(MAX_MOVES)
  for (let t = 0; t < map.n; t++) {
    const y = rollYellow(rolls[t])
    const r = rollRed(rolls[t])
    const count = generateMoves(map, s, y, r, buf)
    moves[t] = buf[heuristicPolicy.choose(map, s, y, r, buf, count, rng)]
    applyMove(map, s, moves[t])
  }
  return { moves, final: s, target: sheetOf(map, s) }
}

function sheetOf(map: CompiledMap, s: State): Int8Array {
  return Int8Array.from({ length: map.n }, (_, c) => s[map.oVal + c])
}

describe('sheet reconstruction', () => {
  const map = compileMap(kagkotMap)

  it('accepts every sheet actually played and offers the real move at every turn', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const rolls = randomRolls(seed)
      const game = playGame(map, rolls, seed)
      const rec = new SheetReconstructor(map, rolls, game.target)
      expect(rec.diagnose().feasible).toBe(true)
      expect(rec.countOrders()).toBeGreaterThanOrEqual(1)
      const s = createState(map)
      for (let t = 0; t < map.n; t++) {
        const candidates = rec.candidates(s)
        expect(candidates).toContain(game.moves[t])
        applyMove(map, s, game.moves[t])
      }
    }
  })

  it('every candidate path leads to exactly the target sheet', () => {
    const rolls = randomRolls(40)
    const game = playGame(map, rolls, 40)
    const rec = new SheetReconstructor(map, rolls, game.target)
    const rng = new Rng(5)
    for (let trial = 0; trial < 5; trial++) {
      const s = createState(map)
      for (let t = 0; t < map.n; t++) {
        const candidates = rec.candidates(s)
        expect(candidates.length).toBeGreaterThan(0)
        applyMove(map, s, candidates[rng.nextInt(candidates.length)])
      }
      expect(Array.from(sheetOf(map, s))).toEqual(Array.from(game.target))
    }
  })

  it('names the circle whose number no roll can produce', () => {
    // Find a game with no 5 + 6 roll, so that 11 is impossible.
    let seed = 1
    let rolls = randomRolls(seed)
    const eleven = (rs: Uint8Array) => rs.some((roll) => RESULTS[3 * ROLL_COUNT + roll] === 11)
    while (eleven(rolls)) rolls = randomRolls(++seed)
    const game = playGame(map, rolls, seed)
    const normal = Array.from({ length: map.n }, (_, c) => c).find((c) => map.cellMax[c] === 12)
    const target = game.target.slice()
    target[normal as number] = 11
    const d = new SheetReconstructor(map, rolls, target).diagnose()
    expect(d.feasible).toBe(false)
    expect(d.impossible).toContain(normal)
  })

  it('flags surplus numbers through the matching', () => {
    const rolls = randomRolls(77)
    const game = playGame(map, rolls, 77)
    // Count how many turns can make each value; pick a value made by exactly one turn, write it twice.
    const makers = new Map<number, number>()
    for (const roll of rolls) {
      const vs = new Set<number>()
      for (let op = 0; op < 5; op++) vs.add(RESULTS[op * ROLL_COUNT + roll])
      for (const v of vs) if (v <= 12) makers.set(v, (makers.get(v) ?? 0) + 1)
    }
    const rare = [...makers.entries()].find(([, k]) => k === 1)
    if (!rare) return // extremely unlikely with these rolls; nothing to check
    const target = game.target.slice()
    const normals = Array.from({ length: map.n }, (_, c) => c).filter(
      (c) => map.cellMax[c] >= rare[0],
    )
    target[normals[0]] = rare[0]
    target[normals[1]] = rare[0]
    const d = new SheetReconstructor(map, rolls, target).diagnose()
    expect(d.feasible).toBe(false)
    expect(d.unmatched.length + d.impossible.length).toBeGreaterThan(0)
  })

  it('rejects partial states that contradict the target', () => {
    const rolls = randomRolls(3)
    const game = playGame(map, rolls, 3)
    const rec = new SheetReconstructor(map, rolls, game.target)
    const s = createState(map)
    const buf = new Int32Array(MAX_MOVES)
    const count = generateMoves(map, s, rollYellow(rolls[0]), rollRed(rolls[0]), buf)
    const wrong = Array.from(buf.subarray(0, count)).find(
      (m) => !rec.candidates(s).includes(m) && (m & 31) !== (game.moves[0] & 31),
    )
    if (wrong === undefined) return
    applyMove(map, s, wrong)
    expect(rec.feasibleFrom(s)).toBe(false)
  })
})

describe('pinned candidates', () => {
  it('a pinned move is measured as long as the leader', () => {
    const map = compileMap(dunaiMap)
    const s = positionAfter(map, heuristicPolicy, 3, 9)
    const race = new Race(map, s, 2, 5, heuristicPolicy, { seed: 4, maxRollouts: 576 })
    // Pin the worst-looking move after a first race.
    const first = race.runToEnd()
    const worst = first[first.length - 1].move
    const pinnedRace = new Race(map, s, 2, 5, heuristicPolicy, {
      seed: 4,
      maxRollouts: 576,
      pinned: [worst],
    })
    const ranking = pinnedRace.runToEnd()
    const leader = ranking[0]
    const pinned = ranking.find((m) => m.move === worst)
    expect(pinned?.n).toBe(leader.n)
    expect(pinned?.alive).toBe(true)
  })
})

describe('post-game review', () => {
  const map = compileMap(kagkotMap)
  const fast = { maxRollouts: 36, timeBudgetMs: undefined }

  it('reviews a recorded game: one entry per turn, losses ≥ 0, the best move costs nothing', async () => {
    const rolls = randomRolls(5)
    const game = playGame(map, rolls, 5)
    const pool = new SolverPool(() => new FakeWorker(), 2)
    pool.init(map.def.id, map.rules)
    const seen: number[] = []
    const reviews = await reviewGame(
      pool,
      map,
      rolls,
      { kind: 'moves', moves: game.moves },
      heuristicPolicy,
      {
        ...fast,
        onTurn: (r) => seen.push(r.turn),
      },
    )
    pool.terminate()
    expect(reviews.length).toBe(19)
    expect(seen).toEqual(Array.from({ length: 19 }, (_, t) => t))
    reviews.forEach((r, t) => {
      expect(r.played).toBe(game.moves[t])
      expect(r.loss).toBeGreaterThanOrEqual(0)
      expect(r.confirmed).toBe(true)
      expect(r.alternatives).toEqual([])
      if (r.played === r.best) expect(r.loss).toBe(0)
    })
    // The last turns are solved exactly.
    expect(reviews[18].exact).toBe(true)
  }, 90_000)

  it('reviews a paper sheet: the reconstructed order rebuilds the sheet; choices are honoured', async () => {
    const rolls = randomRolls(6)
    const game = playGame(map, rolls, 6)
    const pool = new SolverPool(() => new FakeWorker(), 2)
    pool.init(map.def.id, map.rules)
    const reviews = await reviewGame(
      pool,
      map,
      rolls,
      { kind: 'sheet', target: game.target },
      heuristicPolicy,
      fast,
    )
    const s = createState(map)
    for (const r of reviews) applyMove(map, s, r.played)
    expect(Array.from(sheetOf(map, s))).toEqual(Array.from(game.target))
    // Force the real move at the first ambiguous turn: the review must follow it.
    const ambiguous = reviews.find((r) => r.alternatives.length > 0)
    if (ambiguous) {
      const choices: (number | null)[] = Array(19).fill(null)
      const other = ambiguous.alternatives[0]
      choices[ambiguous.turn] = other
      const again = await reviewGame(
        pool,
        map,
        rolls,
        { kind: 'sheet', target: game.target, choices },
        heuristicPolicy,
        fast,
      )
      expect(again[ambiguous.turn].played).toBe(other)
      expect(again[ambiguous.turn].confirmed).toBe(true)
    }
    pool.terminate()
  }, 90_000)

  it('rejects a sheet these dice cannot produce', async () => {
    const rolls = randomRolls(8)
    const target = new Int8Array(19).fill(12)
    const pool = new SolverPool(() => new FakeWorker(), 1)
    pool.init(map.def.id, map.rules)
    await expect(
      reviewGame(pool, map, rolls, { kind: 'sheet', target }, heuristicPolicy, fast),
    ).rejects.toThrow(/no order/)
    pool.terminate()
  })

  it("plays the Sherpa's own game on the same dice", async () => {
    const rolls = randomRolls(9)
    const pool = new SolverPool(() => new FakeWorker(), 2)
    pool.init(map.def.id, map.rules)
    const line = await sherpaLine(pool, map, rolls, heuristicPolicy, { seed: 1, maxRollouts: 36 })
    pool.terminate()
    expect(line.moves.length).toBe(19)
    expect(lineScore(map, rolls, Int32Array.from(line.moves))).toBe(line.score)
    expect(currentScore(map, line.states[19])).toBe(line.score)
    expect(line.states[0][map.oVal]).toBe(EMPTY)
  }, 90_000)
})
