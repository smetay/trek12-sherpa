import { describe, expect, it } from 'vitest'
import { normalizeGlyph, thin } from '../src/glyph.ts'
import {
  binarize,
  connectedComponents,
  createBinary,
  createGray,
  downscale,
  grayFromRgba,
  removeRuledLines,
} from '../src/image.ts'
import { line, paper, Rng } from './draw.ts'

describe('image basics', () => {
  it('converts RGBA to luma and downscales by area', () => {
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ])
    const g = grayFromRgba(rgba, 2, 2)
    expect(Array.from(g.data)).toEqual([76, 150, 29, 255])
    const big = createGray(400, 200, 0)
    for (let i = 0; i < big.data.length; i += 2) big.data[i] = 200
    const { image, scale } = downscale(big, 100)
    expect(image.width).toBe(100)
    expect(image.height).toBe(50)
    expect(scale).toBeCloseTo(0.25)
    expect(Math.abs(image.data[0] - 100)).toBeLessThanOrEqual(1)
  })

  it('binarises pen strokes on unevenly lit paper', () => {
    const rng = new Rng(3)
    const img = paper(300, 200, rng)
    line(img, 20, 100, 280, 100, 3, 70)
    const bin = binarize(img, { radius: 12 })
    let ink = 0
    for (let x = 30; x < 270; x++) ink += bin.data[100 * 300 + x]
    expect(ink).toBeGreaterThan(230)
    let noise = 0
    for (let y = 10; y < 60; y++) for (let x = 0; x < 300; x++) noise += bin.data[y * 300 + x]
    expect(noise).toBeLessThan(150)
  })

  it('removes slanted ruled lines but keeps the strokes that cross them', () => {
    const rng = new Rng(5)
    const img = paper(600, 300, rng)
    line(img, 10, 100, 590, 135, 3, 50) // a ruled line, slanted by ~3.5°
    line(img, 300, 60, 300, 170, 3, 50) // a vertical stroke crossing it
    const bin = binarize(img, { radius: 14 })
    removeRuledLines(bin, 'horizontal', 60, 6)
    const { comps } = connectedComponents(bin)
    const big = comps.filter((c) => c.area > 40)
    expect(big).toHaveLength(1)
    expect(big[0].y1 - big[0].y0).toBeGreaterThan(100) // the stroke survived in one piece
    expect(big[0].x1 - big[0].x0).toBeLessThan(12)
  })

  it('labels 8-connected components with their boxes', () => {
    const b = createBinary(10, 10)
    b.data[0] = 1
    b.data[11] = 1 // diagonal neighbour: same component
    b.data[55] = 1
    const { comps } = connectedComponents(b)
    expect(comps).toHaveLength(2)
    expect(comps[0]).toMatchObject({ x0: 0, y0: 0, x1: 1, y1: 1, area: 2 })
  })
})

describe('glyph normalisation', () => {
  /** A "7" drawn with a given pen on a canvas of a given size. */
  const seven = (size: number, pen: number) => {
    const g = createGray(size, size)
    line(g, 0.2 * size, 0.15 * size, 0.8 * size, 0.15 * size, pen, 0)
    line(g, 0.8 * size, 0.15 * size, 0.4 * size, 0.85 * size, pen, 0)
    const b = createBinary(size, size)
    for (let i = 0; i < g.data.length; i++) b.data[i] = g.data[i] < 128 ? 1 : 0
    return b
  }

  it('thins strokes to one pixel', () => {
    const sk = thin(seven(80, 9))
    let n = 0
    for (const v of sk.data) n += v
    expect(n).toBeGreaterThan(60)
    expect(n).toBeLessThan(140)
  })

  it('makes the classifier input independent of pen width and resolution', () => {
    const a = normalizeGlyph(seven(60, 3)) as Float32Array
    const b = normalizeGlyph(seven(160, 18)) as Float32Array
    let diff = 0
    let mass = 0
    for (let i = 0; i < a.length; i++) {
      diff += Math.abs(a[i] - b[i])
      mass += a[i]
    }
    expect(diff / mass).toBeLessThan(0.35)
    expect(normalizeGlyph(createBinary(5, 5))).toBeNull()
  })
})
