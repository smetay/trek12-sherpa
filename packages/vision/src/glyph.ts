import { type BinaryImage, createBinary } from './image.ts'

/** Side of the classifier input (MNIST convention). */
export const GLYPH_SIZE = 28
/** The skeleton is fitted into a box of this side (leaves room for the pen and centring). */
export const GLYPH_BOX = 18
/** Pen radius used to re-draw the skeleton, in glyph pixels. */
export const PEN_RADIUS = 1.3

/**
 * Zhang–Suen thinning: reduces strokes of any width to 1-pixel-wide 8-connected skeletons.
 * Works on a copy padded by one pixel; returns a mask of the input size.
 */
export function thin(mask: BinaryImage): BinaryImage {
  const w = mask.width + 2
  const h = mask.height + 2
  const img = new Uint8Array(w * h)
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) img[(y + 1) * w + x + 1] = mask.data[y * mask.width + x]
  }
  const del = new Int32Array(w * h)
  let changed = true
  while (changed) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      let nd = 0
      for (let y = 1; y < h - 1; y++) {
        for (let x = 1; x < w - 1; x++) {
          const i = y * w + x
          if (img[i] === 0) continue
          const p2 = img[i - w]
          const p3 = img[i - w + 1]
          const p4 = img[i + 1]
          const p5 = img[i + w + 1]
          const p6 = img[i + w]
          const p7 = img[i + w - 1]
          const p8 = img[i - 1]
          const p9 = img[i - w - 1]
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          const a =
            (p2 === 0 && p3 === 1 ? 1 : 0) +
            (p3 === 0 && p4 === 1 ? 1 : 0) +
            (p4 === 0 && p5 === 1 ? 1 : 0) +
            (p5 === 0 && p6 === 1 ? 1 : 0) +
            (p6 === 0 && p7 === 1 ? 1 : 0) +
            (p7 === 0 && p8 === 1 ? 1 : 0) +
            (p8 === 0 && p9 === 1 ? 1 : 0) +
            (p9 === 0 && p2 === 1 ? 1 : 0)
          if (a !== 1) continue
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) continue
          del[nd++] = i
        }
      }
      for (let k = 0; k < nd; k++) img[del[k]] = 0
      if (nd > 0) changed = true
    }
  }
  const out = createBinary(mask.width, mask.height)
  for (let y = 0; y < mask.height; y++) {
    for (let x = 0; x < mask.width; x++) out.data[y * mask.width + x] = img[(y + 1) * w + x + 1]
  }
  return out
}

/** Draws an anti-aliased capsule (segment with round caps) into a float canvas, max-combining. */
export function drawCapsule(
  out: Float32Array,
  size: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
): void {
  const minX = Math.max(0, Math.floor(Math.min(ax, bx) - radius - 1))
  const maxX = Math.min(size - 1, Math.ceil(Math.max(ax, bx) + radius + 1))
  const minY = Math.max(0, Math.floor(Math.min(ay, by) - radius - 1))
  const maxY = Math.min(size - 1, Math.ceil(Math.max(ay, by) + radius + 1))
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  for (let y = minY; y <= maxY; y++) {
    const py = y + 0.5
    for (let x = minX; x <= maxX; x++) {
      const px = x + 0.5
      let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
      t = t < 0 ? 0 : t > 1 ? 1 : t
      const d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
      const v = radius + 0.5 - d
      if (v <= 0) continue
      const i = y * size + x
      const c = v >= 1 ? 1 : v
      if (c > out[i]) out[i] = c
    }
  }
}

/** Forward 8-neighbours (right, down-left, down, down-right) so each skeleton link is drawn once. */
const FORWARD = [1, 0, -1, 1, 0, 1, 1, 1]

/**
 * Turns the binary mask of one handwritten glyph (any size, any pen width) into the classifier input:
 * skeleton → fitted into an 18 × 18 box keeping the aspect ratio → centred by centre of mass in
 * 28 × 28 → re-drawn with a fixed pen. The same function prepares the training images, so photos and
 * the training set meet in the same normalised space (stroke width and resolution no longer matter).
 * Returns null for an empty mask.
 */
export function normalizeGlyph(mask: BinaryImage): Float32Array | null {
  const skel = thin(mask)
  const { width: w, height: h } = skel
  const xs: number[] = []
  const ys: number[] = []
  const index = new Int32Array(w * h).fill(-1)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (skel.data[y * w + x] === 0) continue
      index[y * w + x] = xs.length
      xs.push(x)
      ys.push(y)
    }
  }
  if (xs.length === 0) return null
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  let mx = 0
  let my = 0
  for (let k = 0; k < xs.length; k++) {
    if (xs[k] < x0) x0 = xs[k]
    if (xs[k] > x1) x1 = xs[k]
    if (ys[k] < y0) y0 = ys[k]
    if (ys[k] > y1) y1 = ys[k]
    mx += xs[k]
    my += ys[k]
  }
  mx /= xs.length
  my /= xs.length
  const extent = Math.max(x1 - x0, y1 - y0, 1)
  const s = GLYPH_BOX / extent
  const c = GLYPH_SIZE / 2
  // Centre of mass at the centre, clamped so the glyph stays inside the canvas.
  let ox = c - (mx - x0) * s
  let oy = c - (my - y0) * s
  const margin = 1.5
  ox = Math.min(Math.max(ox, margin), GLYPH_SIZE - margin - (x1 - x0) * s)
  oy = Math.min(Math.max(oy, margin), GLYPH_SIZE - margin - (y1 - y0) * s)
  const px = (k: number) => ox + (xs[k] - x0) * s
  const py = (k: number) => oy + (ys[k] - y0) * s
  const out = new Float32Array(GLYPH_SIZE * GLYPH_SIZE)
  for (let k = 0; k < xs.length; k++) {
    const x = xs[k]
    const y = ys[k]
    let linked = false
    for (let f = 0; f < 8; f += 2) {
      const dx = FORWARD[f]
      const dy = FORWARD[f + 1]
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || nx >= w || ny >= h) continue
      const j = index[ny * w + nx]
      if (j < 0) continue
      drawCapsule(out, GLYPH_SIZE, px(k), py(k), px(j), py(j), PEN_RADIUS)
      linked = true
    }
    if (!linked) drawCapsule(out, GLYPH_SIZE, px(k), py(k), px(k), py(k), PEN_RADIUS)
  }
  return out
}
