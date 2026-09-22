import { describe, expect, it } from 'vitest'
import { compileMap, validateMap } from '../src/map.ts'
import { dhaulagiriMap, dunaiMap, kagkotMap, MAPS, practiceMap } from '../src/maps/index.ts'

describe('shipped maps', () => {
  it.each(MAPS.map((m) => [m.id, m] as const))('%s passes the validator', (_, def) => {
    expect(validateMap(def)).toEqual([])
    expect(() => compileMap(def)).not.toThrow()
  })

  it('has unique ids and 19 cells everywhere', () => {
    expect(new Set(MAPS.map((m) => m.id)).size).toBe(MAPS.length)
    for (const m of MAPS) expect(m.cells).toHaveLength(19)
  })

  it.each([
    [dunaiMap, 65, 32, 0],
    [kagkotMap, 70, 27, 4],
    [dhaulagiriMap, 75, 23, 6],
    [practiceMap, 70, 42, 3],
  ])('$id: summit, edge count and dangerous circles', (def, summit, edges, dangerous) => {
    expect(def.summit).toBe(summit)
    expect(def.edges).toHaveLength(edges)
    expect(def.cells.filter((c) => c.max === 6)).toHaveLength(dangerous)
    expect(def.cells.every((c) => c.max === 6 || c.max === 12)).toBe(true)
  })

  it('Dhaulagiri: the summit circle is dangerous and has a single neighbour', () => {
    const map = compileMap(dhaulagiriMap)
    expect(dhaulagiriMap.cells[0].max).toBe(6)
    expect(map.nbrStart[1] - map.nbrStart[0]).toBe(1)
  })
})
