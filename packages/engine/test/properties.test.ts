import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { applyMove } from '../src/apply.ts'
import { OP_COUNT, RESULTS, ROLL_COUNT, rollIndex } from '../src/dice.ts'
import { type CompiledMap, compileMap, type MapDef, META_COUNT, META_FILLED } from '../src/map.ts'
import { practiceMap } from '../src/maps/practice.ts'
import { encodeMove, isLegalMove, moveCell, moveDown, moveOp, moveUp } from '../src/moves.ts'
import { Rng } from '../src/rng.ts'
import { scoreBreakdown } from '../src/score.ts'
import { entryFor, newRecord, replay } from '../src/serialize.ts'
import {
  cloneState,
  coreOf,
  createState,
  currentScore,
  EMPTY,
  isGameOver,
  isNumber,
  rebuildDerived,
  type State,
} from '../src/state.ts'
import { legalMoves, pathMap } from './helpers.ts'
import { referenceScore } from './reference-scorer.ts'

type Playout = { map: CompiledMap; states: State[]; rolls: [number, number][]; moves: number[] }

const mapArb = fc.oneof(
  fc.constant<MapDef>(practiceMap),
  fc.integer({ min: 3, max: 12 }).map((n) => pathMap(n, [0])),
)
const rulesArb = fc.record({
  linkRule: fc.constantFrom('mandatory' as const, 'optional' as const),
})

/** Plays a whole game with seeded random rolls and random legal moves, keeping every state. */
function playout(
  def: MapDef,
  rules: { linkRule: 'mandatory' | 'optional' },
  seed: number,
): Playout {
  const map = compileMap(def, rules)
  const rng = new Rng(seed)
  const states: State[] = [createState(map)]
  const rolls: [number, number][] = []
  const moves: number[] = []
  let s = states[0]
  while (!isGameOver(map, s)) {
    const y = rng.nextInt(6)
    const r = 1 + rng.nextInt(6)
    const legal = legalMoves(map, s, y, r)
    expect(legal.length).toBeGreaterThan(0)
    const m = legal[rng.nextInt(legal.length)]
    s = cloneState(s)
    applyMove(map, s, m)
    states.push(s)
    rolls.push([y, r])
    moves.push(m)
  }
  return { map, states, rolls, moves }
}

function linksOf(map: CompiledMap, s: State): [number, number][] {
  const links: [number, number][] = []
  for (let c = 0; c < map.n; c++) if (s[map.oUp + c] !== EMPTY) links.push([c, s[map.oUp + c]])
  return links
}

describe('random playouts keep the engine invariants', () => {
  const prop = (check: (p: Playout) => void) =>
    fc.assert(
      fc.property(mapArb, rulesArb, fc.integer(), (def, rules, seed) => {
        check(playout(def, rules, seed))
      }),
    )

  it('links are symmetric, between adjacent cells, and step by exactly +1', () => {
    prop(({ map, states }) => {
      for (const s of states) {
        for (let c = 0; c < map.n; c++) {
          const up = s[map.oUp + c]
          if (up === EMPTY) continue
          expect(s[map.oDown + up]).toBe(c)
          expect(s[map.oVal + up]).toBe(s[map.oVal + c] + 1)
          expect(map.nbrMask[c] & (1 << up)).not.toBe(0)
          expect(isNumber(s[map.oVal + c])).toBe(true)
        }
      }
    })
  })

  it('filled cells stay connected and ticks add up to the filled count', () => {
    prop(({ map, states }) => {
      for (const s of states) {
        const filled = new Set<number>()
        for (let c = 0; c < map.n; c++) if (s[map.oVal + c] !== EMPTY) filled.add(c)
        if (filled.size > 0) {
          const [start] = filled
          const seen = new Set([start])
          const stack = [start]
          while (stack.length) {
            const c = stack.pop() as number
            for (let i = map.nbrStart[c]; i < map.nbrStart[c + 1]; i++) {
              const nb = map.nbrList[i]
              if (filled.has(nb) && !seen.has(nb)) {
                seen.add(nb)
                stack.push(nb)
              }
            }
          }
          expect(seen.size).toBe(filled.size)
        }
        let ticks = 0
        for (let op = 0; op < OP_COUNT; op++) {
          expect(s[map.oTicks + op]).toBeLessThanOrEqual(map.opLimits[op])
          ticks += s[map.oTicks + op]
        }
        expect(ticks).toBe(filled.size)
        expect(s[map.oMeta + META_FILLED]).toBe(filled.size)
      }
    })
  })

  it('incremental score == from-scratch breakdown == independent reference scorer', () => {
    prop(({ map, states }) => {
      for (const s of states) {
        const breakdown = scoreBreakdown(map, s)
        const ref = referenceScore({
          values: Array.from(s.subarray(map.oVal, map.oVal + map.n)),
          links: linksOf(map, s),
          edges: map.def.edges,
        })
        expect(currentScore(map, s)).toBe(breakdown.total)
        expect(breakdown.total).toBe(ref.total)
        expect(breakdown.longestChain).toBe(ref.longest)
        expect(breakdown.largestZone).toBe(ref.largest)
        expect(breakdown.orphanCells.length).toBe(ref.orphans)
        expect(breakdown.sadCells.length).toBe(ref.sad)
      }
    })
  })

  it('derived data rebuilt from the core equals the incrementally maintained data', () => {
    prop(({ map, states }) => {
      for (const s of states) {
        const rebuilt = cloneState(s)
        rebuildDerived(map, rebuilt)
        // META, ZSIZE (at roots) and the zone partition must agree; zone labels may differ.
        expect(Array.from(rebuilt.subarray(map.oMeta, map.oMeta + META_COUNT))).toEqual(
          Array.from(s.subarray(map.oMeta, map.oMeta + META_COUNT)),
        )
        for (let a = 0; a < map.n; a++) {
          if (s[map.oZid + a] !== -1) {
            expect(s[map.oZsize + s[map.oZid + a]]).toBe(
              rebuilt[map.oZsize + rebuilt[map.oZid + a]],
            )
          }
          for (let b = 0; b < map.n; b++) {
            const same = s[map.oZid + a] !== -1 && s[map.oZid + a] === s[map.oZid + b]
            const sameRebuilt =
              rebuilt[map.oZid + a] !== -1 && rebuilt[map.oZid + a] === rebuilt[map.oZid + b]
            expect(same).toBe(sameRebuilt)
          }
          // Chain ends agree (interior END entries are unspecified).
          const isEnd = s[map.oUp + a] === EMPTY || s[map.oDown + a] === EMPTY
          if (isNumber(s[map.oVal + a]) && isEnd)
            expect(s[map.oEnd + a]).toBe(rebuilt[map.oEnd + a])
        }
      }
    })
  })

  it('the generator is complete and sound against the brute-force legality check', () => {
    prop(({ map, states, rolls }) => {
      // Brute force is ~5k candidates per turn: sample four turns per game.
      const last = states.length - 2
      const turns = [...new Set([0, Math.floor(last / 3), Math.floor((2 * last) / 3), last])]
      for (const turn of turns) {
        const s = states[turn]
        const [y, r] = rolls[turn]
        const generated = new Set(legalMoves(map, s, y, r))
        for (const m of generated) expect(isLegalMove(map, s, y, r, m)).toBe(true)
        // Every conceivable move: any cell, any op, links among neighbours or none.
        let legalCount = 0
        for (let cell = 0; cell < map.n; cell++) {
          const options = [EMPTY]
          for (let i = map.nbrStart[cell]; i < map.nbrStart[cell + 1]; i++)
            options.push(map.nbrList[i])
          for (let op = 0; op < OP_COUNT; op++) {
            const result = RESULTS[op * ROLL_COUNT + rollIndex(y, r)]
            for (const down of options) {
              for (const up of options) {
                const m = encodeMove(cell, op, result, down, up)
                const legal = isLegalMove(map, s, y, r, m)
                if (legal) legalCount++
                expect(generated.has(m)).toBe(legal)
              }
            }
          }
        }
        expect(legalCount).toBe(generated.size)
      }
    })
  })

  it('the game always ends with every cell filled, and the record replays to the final state', () => {
    prop(({ map, states, rolls, moves }) => {
      const last = states[states.length - 1]
      expect(states.length).toBe(map.n + 1)
      for (let c = 0; c < map.n; c++) expect(last[map.oVal + c]).not.toBe(EMPTY)
      const record = newRecord(map)
      record.history = moves.map((m, i) => entryFor(m, rolls[i][0], rolls[i][1]))
      const replayed = replay(map, record)
      expect(Array.from(coreOf(map, replayed))).toEqual(Array.from(coreOf(map, last)))
    })
  })

  it('renumbering the cells does not change the score (metamorphic)', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (seed, permSeed) => {
        const { map, states, rolls, moves } = playout(practiceMap, { linkRule: 'mandatory' }, seed)
        // Random permutation of cell ids.
        const rng = new Rng(permSeed)
        const perm = Array.from({ length: map.n }, (_, i) => i)
        for (let i = perm.length - 1; i > 0; i--) {
          const j = rng.nextInt(i + 1)
          ;[perm[i], perm[j]] = [perm[j], perm[i]]
        }
        const inv = new Array<number>(map.n)
        perm.forEach((p, i) => {
          inv[p] = i
        })
        const permuted: MapDef = {
          ...practiceMap,
          cells: practiceMap.cells
            .map((c) => ({ ...c, id: perm[c.id] }))
            .sort((a, b) => a.id - b.id)
            .map((c) => ({
              ...c,
              x: practiceMap.cells[inv[c.id]].x,
              y: practiceMap.cells[inv[c.id]].y,
              max: practiceMap.cells[inv[c.id]].max,
            })),
          edges: practiceMap.edges.map(([a, b]) => [perm[a], perm[b]] as [number, number]),
        }
        const pmap = compileMap(permuted)
        const record = newRecord(pmap)
        moves.forEach((m, i) => {
          const d = moveDown(m)
          const u = moveUp(m)
          record.history.push({
            y: rolls[i][0],
            r: rolls[i][1],
            op: moveOp(m),
            cell: perm[moveCell(m)],
            down: d === EMPTY ? EMPTY : perm[d],
            up: u === EMPTY ? EMPTY : perm[u],
          })
        })
        const replayed = replay(pmap, record)
        expect(currentScore(pmap, replayed)).toBe(currentScore(map, states[states.length - 1]))
      }),
    )
  })
})
