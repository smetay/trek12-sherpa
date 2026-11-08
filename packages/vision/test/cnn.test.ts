import { describe, expect, it } from 'vitest'
import { classifyGlyph, decode, glyphModel } from '../src/classify.ts'
import { base64Decode, base64Encode, dequantize, forward, quantize } from '../src/cnn.ts'
import { createBinary, createGray } from '../src/image.ts'
import { drawStrokes, FACE, FONT, Rng } from './draw.ts'

/** Draws a glyph of the test font and returns its ink mask. */
function glyphMask(
  strokes: [number, number][][],
  seed: number,
  pen = 4,
  aspect = 0.62,
): ReturnType<typeof createBinary> {
  const g = createGray(90, 110)
  drawStrokes(g, strokes, 45, 55, 80, pen, new Rng(seed), 1, aspect)
  const b = createBinary(90, 110)
  for (let i = 0; i < g.data.length; i++) b.data[i] = g.data[i] < 128 ? 1 : 0
  return b
}

describe('model serialisation', () => {
  it('round-trips base64 and int8 quantisation', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 7])
    for (let n = 0; n <= bytes.length; n++) {
      expect(Array.from(base64Decode(base64Encode(bytes.subarray(0, n))))).toEqual(
        Array.from(bytes.subarray(0, n)),
      )
    }
    const shape = { c1: 1, c2: 1, hidden: 1, classes: 2 }
    const t = [25, 1, 25, 1, 16, 1, 2, 2].map((n, k) =>
      Float32Array.from({ length: n }, (_, i) => Math.sin(i + k) * (k + 1)),
    )
    const { scales, bytes: q } = quantize(t)
    const back = dequantize(shape, scales, q)
    const max = Math.max(...Array.from(t[2]).map(Math.abs))
    back.c2w.forEach((v, i) => {
      expect(Math.abs(v - t[2][i])).toBeLessThanOrEqual(max / 127)
    })
  })

  it('ships a model whose output is a probability distribution', () => {
    const m = glyphModel()
    expect(m.classes).toBe(11)
    const p = forward(m, new Float32Array(784))
    expect(p.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5)
  })
})

describe('constrained decoding', () => {
  it('renormalises over the allowed values and flags implausible glyphs', () => {
    const probs = new Float32Array(14)
    probs[7] = 0.7 // a European "1" often looks like a 7 …
    probs[1] = 0.25
    probs[4] = 0.05
    const r = decode(probs, [0, 1, 2, 3, 4, 5]) // … but a yellow die has no 7
    expect(r.value).toBe(1)
    expect(r.alternatives[0].p).toBeCloseTo(0.25 / 0.3)
    expect(r.confidence).toBeLessThan(r.alternatives[0].p) // most belief went to a forbidden class
  })
})

describe('glyph classifier (procedural handwriting it was never trained on)', () => {
  it('reads the digits of the test font', () => {
    let ok = 0
    let total = 0
    for (let seed = 1; seed <= 6; seed++) {
      for (let d = 0; d <= 9; d++) {
        const r = classifyGlyph(
          glyphMask(FONT[d], seed * 31 + d),
          [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 13],
        )
        if (r.value === d) ok++
        total++
      }
    }
    expect(ok / total).toBeGreaterThanOrEqual(0.9)
  })

  it('recognises a drawn ☹', () => {
    for (let seed = 1; seed <= 4; seed++) {
      const r = classifyGlyph(glyphMask(FACE, seed, 3, 1), [0, 1, 2, 3, 4, 5, 6, 13])
      expect(r.value).toBe(13)
    }
  })
})
