import { describe, expect, it } from 'vitest'
import { applyH, homographyFrom, invertH, type Point, warpQuad } from '../src/homography.ts'
import { createGray } from '../src/image.ts'

const close = (a: Point, b: Point, eps = 1e-6) =>
  expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeLessThan(eps)

describe('homography', () => {
  const from: Point[] = [
    { x: 0, y: 0 },
    { x: 4, y: 0 },
    { x: 4, y: 3 },
    { x: 0, y: 3 },
  ]
  const to: Point[] = [
    { x: 102, y: 87 },
    { x: 610, y: 120 },
    { x: 580, y: 515 },
    { x: 90, y: 470 },
  ]

  it('maps the four correspondences exactly and inverts', () => {
    const H = homographyFrom(from, to)
    from.forEach((p, i) => {
      close(applyH(H, p), to[i], 1e-6)
    })
    const Hi = invertH(H)
    to.forEach((p, i) => {
      close(applyH(Hi, p), from[i], 1e-9)
    })
  })

  it('is a least-squares fit with more than four (noisy) points', () => {
    const H = homographyFrom(from, to)
    const more = [...from, { x: 2, y: 1.5 }, { x: 1, y: 2 }, { x: 3.5, y: 0.5 }]
    const seen = more.map((p, i) => {
      const q = applyH(H, p)
      return { x: q.x + (i % 2 ? 0.8 : -0.8), y: q.y + (i % 3 ? 0.5 : -0.5) }
    })
    const fit = homographyFrom(more, seen)
    for (const p of more) close(applyH(fit, p), applyH(H, p), 2)
  })

  it('rejects degenerate input', () => {
    expect(() => homographyFrom(from.slice(0, 3), to.slice(0, 3))).toThrow()
    const line = [0, 1, 2, 3].map((k) => ({ x: k, y: k }))
    expect(() => homographyFrom(line, to)).toThrow()
  })

  it('rectifies a quad: a dark square drawn in perspective comes out axis-aligned', () => {
    const img = createGray(200, 200)
    const H = homographyFrom(
      [
        { x: 0, y: 0 },
        { x: 1, y: 0 },
        { x: 1, y: 1 },
        { x: 0, y: 1 },
      ],
      [
        { x: 40, y: 30 },
        { x: 170, y: 50 },
        { x: 160, y: 180 },
        { x: 30, y: 160 },
      ],
    )
    // Paint the inner square [0.25, 0.75]² of the unit square through H.
    const Hi = invertH(H)
    for (let y = 0; y < 200; y++)
      for (let x = 0; x < 200; x++) {
        const p = applyH(Hi, { x, y })
        if (p.x > 0.25 && p.x < 0.75 && p.y > 0.25 && p.y < 0.75) img.data[y * 200 + x] = 0
      }
    const quad = [0, 1, 2, 3].map((k) =>
      applyH(
        H,
        [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 1, y: 1 },
          { x: 0, y: 1 },
        ][k],
      ),
    ) as [Point, Point, Point, Point]
    const { image } = warpQuad(img, quad, 100, 100)
    expect(image.data[50 * 100 + 50]).toBeLessThan(40)
    expect(image.data[10 * 100 + 10]).toBeGreaterThan(200)
    expect(image.data[50 * 100 + 30]).toBeLessThan(60)
    expect(image.data[50 * 100 + 20]).toBeGreaterThan(200)
  })
})
