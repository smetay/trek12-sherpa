import { describe, expect, it } from 'vitest'
import { readSheet } from '../src/sheet.ts'
import { syntheticSheet } from './fixtures.ts'

/** A 19-circle hexagon (radius 2), top row dangerous — the shape of a real sheet, not a real one. */
const CELLS = (() => {
  const out: { x: number; y: number; max: number }[] = []
  const rows = [3, 4, 5, 4, 3]
  rows.forEach((n, r) => {
    for (let k = 0; k < n; k++) {
      out.push({ x: k - (n - 1) / 2, y: (r - 2) * 0.866, max: r === 0 ? 6 : 12 })
    }
  })
  return out
})()

const VALUES: (number | null)[] = [
  5,
  13,
  2,
  10,
  7,
  11,
  12,
  null,
  3,
  8,
  6,
  9,
  0,
  4,
  12,
  null,
  1,
  13,
  5,
]

describe('readSheet', () => {
  it('reads empty circles, digits, two-digit numbers and ☹ through a perspective photo', () => {
    for (const seed of [3, 4]) {
      const { image, toImage } = syntheticSheet(seed, CELLS, VALUES)
      // Four taps, a little off-centre like a finger would be.
      const anchors = [0, 2, 16, 18].map((cell, k) => {
        const p = toImage(CELLS[cell])
        return { cell, at: { x: p.x + (k % 2 ? 6 : -5), y: p.y + (k < 2 ? 4 : -6) } }
      })
      const read = readSheet(image, CELLS, anchors)
      expect(read).toHaveLength(CELLS.length)
      let ok = 0
      read.forEach((r, i) => {
        if (VALUES[i] === null) expect(r.value).toBeNull()
        if (r.value === VALUES[i]) ok++
        // Centres are found on the printed rings, whatever the tap error.
        const truth = toImage(CELLS[i])
        expect(Math.hypot(r.center.x - truth.x, r.center.y - truth.y)).toBeLessThan(
          0.12 * r.radius * 2,
        )
        // Values above a circle's limit cannot be written there.
        if (r.value !== null && r.value !== 13) expect(r.value).toBeLessThanOrEqual(CELLS[i].max)
      })
      expect(ok).toBeGreaterThanOrEqual(CELLS.length - 2)
    }
  })

  it('ignores very thick printed outlines', () => {
    const { image, toImage } = syntheticSheet(5, CELLS, VALUES, { dangerPen: 14 })
    const anchors = [0, 2, 16, 18].map((cell) => ({ cell, at: toImage(CELLS[cell]) }))
    const read = readSheet(image, CELLS, anchors)
    // The top row is dangerous (thick outline): its values must still come out.
    expect(read.slice(0, 3).map((r) => r.value)).toEqual(VALUES.slice(0, 3))
  })

  it('reads a high-resolution photo as well (pen strokes are not lost to sampling)', () => {
    const { image, toImage } = syntheticSheet(3, CELLS, VALUES)
    // Upscale ×3 (nearest): circles of ~250 px, 3-px pen strokes become 9 px but the canvas would
    // otherwise sample one pixel in five.
    const big = {
      width: image.width * 3,
      height: image.height * 3,
      data: new Uint8Array(image.width * image.height * 9),
    }
    for (let y = 0; y < big.height; y++)
      for (let x = 0; x < big.width; x++)
        big.data[y * big.width + x] =
          image.data[Math.floor(y / 3) * image.width + Math.floor(x / 3)]
    const anchors = [0, 2, 16, 18].map((cell) => {
      const p = toImage(CELLS[cell])
      return { cell, at: { x: 3 * p.x, y: 3 * p.y } }
    })
    const read = readSheet(big, CELLS, anchors)
    const ok = read.filter((r, i) => r.value === VALUES[i]).length
    expect(ok).toBeGreaterThanOrEqual(CELLS.length - 2)
    const truth = toImage(CELLS[7])
    expect(Math.hypot(read[7].center.x - 3 * truth.x, read[7].center.y - 3 * truth.y)).toBeLessThan(
      15,
    )
  })

  it('needs four anchors', () => {
    const { image } = syntheticSheet(1, CELLS, VALUES)
    expect(() => readSheet(image, CELLS, [])).toThrow()
  })
})
