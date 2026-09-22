import { describe, expect, it } from 'vitest'
import { compileMap, type MapDef, validateMap } from '../src/map.ts'
import { practiceMap } from '../src/maps/practice.ts'
import { pathMap } from './helpers.ts'

const realish = (patch: Partial<MapDef> = {}): MapDef => ({
  // A 2x2 square of touching circles, as a "draft" so geometry checks apply.
  id: 'square',
  name: 'Square',
  rev: 1,
  status: 'draft',
  summit: 40,
  opLimits: [1, 1, 1, 1, 1],
  cells: [
    { id: 0, x: 0, y: 0, max: 12 },
    { id: 1, x: 1, y: 0, max: 12 },
    { id: 2, x: 0, y: 1, max: 6 },
    { id: 3, x: 1, y: 1, max: 12 },
  ],
  edges: [
    [0, 1],
    [0, 2],
    [1, 3],
    [2, 3],
  ],
  ...patch,
})

describe('validateMap', () => {
  it('accepts the practice map and a small real-looking map', () => {
    expect(validateMap(practiceMap)).toEqual([])
    expect(validateMap(realish())).toEqual([])
  })

  it('rejects non-contiguous ids, bad limits and self-loops', () => {
    const errors = validateMap(
      realish({
        cells: realish().cells.map((c) => (c.id === 2 ? { ...c, id: 7 } : c)),
        opLimits: [1, 1, 1, 0, 0],
        edges: [
          [0, 1],
          [1, 1],
        ],
      }),
    )
    expect(errors.join('\n')).toMatch(/cell 2 must have id 2/)
    expect(errors.join('\n')).toMatch(/sum of opLimits/)
    expect(errors.join('\n')).toMatch(/self-loop/)
  })

  it('rejects duplicate edges, dangling edges and disconnected graphs', () => {
    expect(
      validateMap(
        realish({
          edges: [
            [0, 1],
            [1, 0],
            [0, 2],
            [1, 3],
            [2, 3],
          ],
        }),
      ).join(),
    ).toMatch(/twice/)
    expect(
      validateMap(
        realish({
          edges: [
            [0, 9],
            [0, 2],
            [1, 3],
            [2, 3],
          ],
        }),
      ).join(),
    ).toMatch(/missing cell/)
    expect(
      validateMap(
        realish({
          edges: [
            [0, 1],
            [2, 3],
          ],
        }),
      ).join(),
    ).toMatch(/not connected/)
  })

  it('rejects more than 6 neighbours', () => {
    const star: MapDef = {
      ...realish(),
      cells: Array.from({ length: 8 }, (_, id) => ({ id, x: id, y: 0, max: 12 })),
      edges: Array.from({ length: 7 }, (_, i) => [0, i + 1] as [number, number]),
      opLimits: [4, 4, 4, 4, 4],
      status: 'practice',
    }
    expect(validateMap(star).join()).toMatch(/cell 0 has 7 neighbours/)
  })

  it('flags close circles that are not adjacent, unless listed as nonAdjacentPairs', () => {
    const missing = realish({
      edges: [
        [0, 1],
        [0, 2],
        [1, 3],
      ],
    })
    expect(validateMap(missing).join()).toMatch(/cells 2-3 are close but not adjacent/)
    expect(validateMap({ ...missing, nonAdjacentPairs: [[2, 3]] })).toEqual([])
  })

  it('flags edges whose length is far from the median', () => {
    const stretched = realish({
      cells: realish().cells.map((c) => (c.id === 3 ? { ...c, x: 4, y: 4 } : c)),
    })
    expect(validateMap(stretched).join()).toMatch(/edge .* has length/)
  })

  it('skips geometry checks for practice maps', () => {
    const p = pathMap(5)
    p.cells[4].x = 100
    expect(validateMap(p)).toEqual([])
  })
})

describe('compileMap', () => {
  it('builds sorted CSR neighbours, masks and the state layout', () => {
    const map = compileMap(practiceMap)
    expect(map.n).toBe(19)
    expect(map.allMask).toBe((1 << 19) - 1)
    const nbrs = (c: number) =>
      Array.from(map.nbrList.subarray(map.nbrStart[c], map.nbrStart[c + 1]))
    expect(nbrs(9)).toEqual([4, 5, 8, 10, 13, 14])
    expect(nbrs(0)).toEqual([1, 3, 4])
    expect(map.nbrMask[0]).toBe((1 << 1) | (1 << 3) | (1 << 4))
    expect(Array.from(map.cellMax.subarray(0, 4))).toEqual([6, 6, 6, 12])
    expect(map.stateSize).toBe(6 * 19 + 5 + 9)
  })

  it('throws on an invalid map', () => {
    expect(() => compileMap(realish({ edges: [] }))).toThrow(/invalid map/)
  })
})
