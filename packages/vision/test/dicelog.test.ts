import { describe, expect, it } from 'vitest'
import { readDiceLog } from '../src/dicelog.ts'
import { downscale } from '../src/image.ts'
import { paper, Rng } from './draw.ts'
import { syntheticDiceLog } from './fixtures.ts'

const ROLLS: ([number, number] | null)[] = [
  [5, 4],
  [1, 6],
  [5, 5],
  [0, 5],
  [1, 5],
  [2, 4],
  [3, 3],
  [4, 1],
  [2, 2],
  [0, 6],
  [3, 6],
  ...Array.from({ length: 8 }, () => null),
]
const written = ROLLS.filter((r) => r !== null) as [number, number][]

function score(rows: ReturnType<typeof readDiceLog>['rows'], want: [number, number][]) {
  let ok = 0
  rows.forEach((row, i) => {
    if (row.yellow.value === want[i]?.[0]) ok++
    if (row.red.value === want[i]?.[1]) ok++
  })
  return ok
}

describe('readDiceLog', () => {
  it('reads every written roll, top to bottom, and skips the empty rows', () => {
    for (const seed of [7, 8]) {
      const { image } = syntheticDiceLog(seed, ROLLS)
      const read = readDiceLog(image)
      expect(read.rows).toHaveLength(written.length)
      expect(score(read.rows, written)).toBeGreaterThanOrEqual(2 * written.length - 2)
      for (const row of read.rows) {
        expect(row.yellow.box).not.toBeNull()
        expect(row.red.box).not.toBeNull()
        // The yellow die is left of the red one, in original pixels.
        expect((row.yellow.box?.x ?? 0) < (row.red.box?.x ?? 0)).toBe(true)
      }
    }
  })

  it('works on a downscaled photo and inside a quad', () => {
    const { image } = syntheticDiceLog(7, ROLLS)
    const small = downscale(image, 640).image
    expect(readDiceLog(small).rows).toHaveLength(written.length)
    const quad = [
      { x: 5, y: 190 },
      { x: 890, y: 185 },
      { x: 895, y: 1195 },
      { x: 2, y: 1190 },
    ] as const
    const read = readDiceLog(image, [quad[0], quad[1], quad[2], quad[3]])
    expect(read.rows).toHaveLength(written.length)
    // Boxes are reported in the original image, not in the rectified quad.
    expect(read.rows[0].yellow.box?.y ?? 0).toBeGreaterThan(200)
  })

  it('separates dice written right next to the separator', () => {
    const read = readDiceLog(syntheticDiceLog(11, ROLLS, { compact: true }).image)
    expect(read.rows).toHaveLength(written.length)
    expect(score(read.rows, written)).toBeGreaterThanOrEqual(2 * written.length - 2)
  })

  it('falls back to column clustering without a separator line', () => {
    const { image } = syntheticDiceLog(9, ROLLS, { separator: false })
    const read = readDiceLog(image)
    expect(read.warnings).toContain('no-separator')
    expect(read.rows).toHaveLength(written.length)
    expect(score(read.rows, written)).toBeGreaterThanOrEqual(2 * written.length - 3)
  })

  it("reports each row's position among the ruled lines, revealing skipped lines", () => {
    const rolls: ([number, number] | null)[] = [[5, 4], [1, 6], null, [0, 5], [1, 5], null, [3, 3]]
    const read = readDiceLog(syntheticDiceLog(4, rolls).image)
    expect(read.rows.map((r) => r.slot)).toEqual([0, 1, 3, 4, 6])
  })

  it('returns nothing (with a warning) on blank paper', () => {
    const read = readDiceLog(paper(600, 800, new Rng(1)))
    expect(read.rows).toEqual([])
    expect(read.warnings).toContain('no-digits')
  })
})
