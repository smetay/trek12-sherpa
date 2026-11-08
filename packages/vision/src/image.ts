/**
 * Grayscale and binary images as flat typed arrays, and the low-level operations the readers need:
 * area-average downscaling, Sauvola binarisation, ruled-line removal, connected components.
 */

/** 8-bit grayscale, row-major: 0 = black ink … 255 = white paper. */
export type GrayImage = { width: number; height: number; data: Uint8Array }

/** Binary mask, row-major: 1 = ink, 0 = background. */
export type BinaryImage = { width: number; height: number; data: Uint8Array }

export function createGray(width: number, height: number, fill = 255): GrayImage {
  const data = new Uint8Array(width * height)
  if (fill !== 0) data.fill(fill)
  return { width, height, data }
}

export function createBinary(width: number, height: number): BinaryImage {
  return { width, height, data: new Uint8Array(width * height) }
}

/** Luma (Rec. 601) of RGBA pixels, e.g. from a canvas `ImageData`. Alpha is ignored. */
export function grayFromRgba(rgba: ArrayLike<number>, width: number, height: number): GrayImage {
  const out = createGray(width, height, 0)
  const d = out.data
  for (let i = 0, j = 0; i < d.length; i++, j += 4) {
    d[i] = (rgba[j] * 299 + rgba[j + 1] * 587 + rgba[j + 2] * 114 + 500) / 1000
  }
  return out
}

/**
 * Area-average downscale so that the longest side is at most `maxSide` (no-op when already smaller).
 * Returns the factor applied (≤ 1): working coordinates × (1 / scale) = original coordinates.
 */
export function downscale(img: GrayImage, maxSide: number): { image: GrayImage; scale: number } {
  const longest = Math.max(img.width, img.height)
  if (longest <= maxSide) return { image: img, scale: 1 }
  const scale = maxSide / longest
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))
  const out = createGray(w, h, 0)
  const fx = img.width / w
  const fy = img.height / h
  const src = img.data
  for (let y = 0; y < h; y++) {
    const y0 = y * fy
    const y1 = y0 + fy
    for (let x = 0; x < w; x++) {
      const x0 = x * fx
      const x1 = x0 + fx
      let sum = 0
      let area = 0
      for (let sy = Math.floor(y0); sy < Math.ceil(y1); sy++) {
        const wy = Math.min(y1, sy + 1) - Math.max(y0, sy)
        if (wy <= 0 || sy >= img.height) continue
        const row = sy * img.width
        for (let sx = Math.floor(x0); sx < Math.ceil(x1); sx++) {
          const wx = Math.min(x1, sx + 1) - Math.max(x0, sx)
          if (wx <= 0 || sx >= img.width) continue
          sum += src[row + sx] * wx * wy
          area += wx * wy
        }
      }
      out.data[y * w + x] = area > 0 ? Math.round(sum / area) : 255
    }
  }
  return { image: out, scale: w / img.width }
}

/** Bilinear sample with clamping at the borders. */
export function sampleBilinear(img: GrayImage, x: number, y: number): number {
  const w = img.width
  const h = img.height
  const fx = Math.min(Math.max(x, 0), w - 1)
  const fy = Math.min(Math.max(y, 0), h - 1)
  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const ax = fx - x0
  const ay = fy - y0
  const d = img.data
  const top = d[y0 * w + x0] * (1 - ax) + d[y0 * w + x1] * ax
  const bottom = d[y1 * w + x0] * (1 - ax) + d[y1 * w + x1] * ax
  return top * (1 - ay) + bottom * ay
}

export type SauvolaOptions = {
  /** Half window size in pixels (window = 2·radius + 1). */
  radius: number
  /** Sensitivity; 0.2–0.35 for pen on paper. */
  k?: number
  /** Dynamic range of the standard deviation. */
  r?: number
  /** Pixels lighter than this are never ink (protects blank paper from noise). */
  maxInk?: number
}

/**
 * Sauvola local thresholding with integral images: T = m · (1 + k · (s / R − 1)). Robust to the uneven
 * light and soft shadows of a phone photo; thin pen strokes survive because the window adapts.
 */
export function binarize(img: GrayImage, options: SauvolaOptions): BinaryImage {
  const { width: w, height: h, data } = img
  const k = options.k ?? 0.25
  const R = options.r ?? 128
  const maxInk = options.maxInk ?? 235
  const rad = Math.max(1, Math.round(options.radius))
  const W = w + 1
  const sum = new Float64Array(W * (h + 1))
  const sq = new Float64Array(W * (h + 1))
  for (let y = 0; y < h; y++) {
    let rs = 0
    let rq = 0
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x]
      rs += v
      rq += v * v
      sum[(y + 1) * W + x + 1] = sum[y * W + x + 1] + rs
      sq[(y + 1) * W + x + 1] = sq[y * W + x + 1] + rq
    }
  }
  const out = createBinary(w, h)
  for (let y = 0; y < h; y++) {
    const ya = Math.max(0, y - rad)
    const yb = Math.min(h, y + rad + 1)
    for (let x = 0; x < w; x++) {
      const v = data[y * w + x]
      if (v > maxInk) continue
      const xa = Math.max(0, x - rad)
      const xb = Math.min(w, x + rad + 1)
      const n = (yb - ya) * (xb - xa)
      const s1 = sum[yb * W + xb] - sum[ya * W + xb] - sum[yb * W + xa] + sum[ya * W + xa]
      const s2 = sq[yb * W + xb] - sq[ya * W + xb] - sq[yb * W + xa] + sq[ya * W + xa]
      const m = s1 / n
      const sd = Math.sqrt(Math.max(0, s2 / n - m * m))
      const t = m * (1 + k * (sd / R - 1))
      if (v < t) out.data[y * w + x] = 1
    }
  }
  return out
}

export type Component = {
  /** Label in the label image (1-based). */
  label: number
  x0: number
  y0: number
  /** Inclusive. */
  x1: number
  y1: number
  area: number
  cx: number
  cy: number
}

/** 8-connected components of the ink. `labels[i]` is 0 for background. */
export function connectedComponents(bin: BinaryImage): { labels: Int32Array; comps: Component[] } {
  const { width: w, height: h, data } = bin
  const labels = new Int32Array(w * h)
  const comps: Component[] = []
  const stack = new Int32Array(w * h)
  let next = 1
  for (let start = 0; start < w * h; start++) {
    if (data[start] === 0 || labels[start] !== 0) continue
    const label = next++
    let sp = 0
    stack[sp++] = start
    labels[start] = label
    let x0 = w
    let y0 = h
    let x1 = -1
    let y1 = -1
    let area = 0
    let sx = 0
    let sy = 0
    while (sp > 0) {
      const p = stack[--sp]
      const px = p % w
      const py = (p - px) / w
      area++
      sx += px
      sy += py
      if (px < x0) x0 = px
      if (px > x1) x1 = px
      if (py < y0) y0 = py
      if (py > y1) y1 = py
      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy
        if (ny < 0 || ny >= h) continue
        for (let dx = -1; dx <= 1; dx++) {
          const nx = px + dx
          if (nx < 0 || nx >= w || (dx === 0 && dy === 0)) continue
          const q = ny * w + nx
          if (data[q] !== 0 && labels[q] === 0) {
            labels[q] = label
            stack[sp++] = q
          }
        }
      }
    }
    comps.push({ label, x0, y0, x1, y1, area, cx: sx / area, cy: sy / area })
  }
  return { labels, comps }
}

/** Removes components smaller than `minArea` pixels, in place. */
export function removeSpecks(bin: BinaryImage, minArea: number): void {
  const { labels, comps } = connectedComponents(bin)
  const small = new Uint8Array(comps.length + 1)
  for (const c of comps) if (c.area < minArea) small[c.label] = 1
  for (let i = 0; i < labels.length; i++) if (small[labels[i]]) bin.data[i] = 0
}

/** Slopes tried when looking for ruled lines (tan of the angle; up to ±8.5°). */
const LINE_SLOPES = [-0.15, -0.12, -0.09, -0.06, -0.03, 0, 0.03, 0.06, 0.09, 0.12, 0.15]

/**
 * Marks the pixels of long straight runs of ink, along any of a few slopes: a hand-drawn ruled line
 * on a photo is rarely axis-aligned. The image is first dilated across the line direction by one
 * pixel so that a line keeps a continuous run within one slope step.
 */
export function findLineRuns(
  bin: BinaryImage,
  orientation: 'horizontal' | 'vertical',
  minLength: number,
): BinaryImage {
  const { width: w, height: h } = bin
  const horizontal = orientation === 'horizontal'
  const dil = createBinary(w, h)
  const src = bin.data
  const d = dil.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (src[i] === 0) continue
      d[i] = 1
      if (horizontal) {
        if (y > 0) d[i - w] = 1
        if (y < h - 1) d[i + w] = 1
      } else {
        if (x > 0) d[i - 1] = 1
        if (x < w - 1) d[i + 1] = 1
      }
    }
  }
  const runs = createBinary(w, h)
  const r = runs.data
  // Along a line, t runs over x (horizontal) or y (vertical); the cross coordinate is c0 + shift[t].
  const along = horizontal ? w : h
  const across = horizontal ? h : w
  const strideT = horizontal ? 1 : w
  const strideC = horizontal ? w : 1
  const shift = new Int32Array(along)
  const cells = new Int32Array(along)
  for (const slope of LINE_SLOPES) {
    for (let t = 0; t < along; t++) shift[t] = Math.round(slope * t)
    const lo = Math.min(0, shift[along - 1])
    const hi = Math.max(0, shift[along - 1])
    for (let c0 = -hi; c0 < across - lo; c0++) {
      let start = -1
      for (let t = 0; t <= along; t++) {
        let on = false
        if (t < along) {
          const c = c0 + shift[t]
          if (c >= 0 && c < across) {
            const i = t * strideT + c * strideC
            cells[t] = i
            on = d[i] === 1
          }
        }
        if (on) {
          if (start < 0) start = t
        } else if (start >= 0) {
          if (t - start >= minLength) for (let u = start; u < t; u++) r[cells[u]] = 1
          start = -1
        }
      }
    }
  }
  return runs
}

/** 2 × 2 max-pooling of a binary image (any ink in the block). */
export function poolBinary(bin: BinaryImage): BinaryImage {
  const w = Math.ceil(bin.width / 2)
  const h = Math.ceil(bin.height / 2)
  const out = createBinary(w, h)
  for (let y = 0; y < bin.height; y++) {
    const row = (y >> 1) * w
    for (let x = 0; x < bin.width; x++)
      if (bin.data[y * bin.width + x]) out.data[row + (x >> 1)] = 1
  }
  return out
}

/**
 * `findLineRuns` on a half-resolution copy (4× cheaper), returned at half resolution: pixel (x, y)
 * of the input maps to (x >> 1, y >> 1).
 */
export function findLineRunsHalf(
  bin: BinaryImage,
  orientation: 'horizontal' | 'vertical',
  minLength: number,
): BinaryImage {
  return findLineRuns(poolBinary(bin), orientation, Math.max(2, Math.round(minLength / 2)))
}

/**
 * Finds long, thin ruled lines (horizontal or vertical, slanted by up to ~8°) and erases them, keeping
 * the pixels where a pen stroke crosses the line (ink extent across the line larger than
 * `maxThickness`). Returns the erased-line mask.
 */
export function removeRuledLines(
  bin: BinaryImage,
  orientation: 'horizontal' | 'vertical',
  minLength: number,
  maxThickness: number,
  halfRuns?: BinaryImage,
): BinaryImage {
  const { width: w, height: h } = bin
  const horizontal = orientation === 'horizontal'
  const runs = halfRuns ?? findLineRunsHalf(bin, orientation, minLength)
  const rw = runs.width
  const erased = createBinary(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (bin.data[i] === 0 || runs.data[(y >> 1) * rw + (x >> 1)] === 0) continue
      let extent = 1
      if (horizontal) {
        for (let yy = y - 1; yy >= 0 && bin.data[yy * w + x] === 1; yy--) extent++
        for (let yy = y + 1; yy < h && bin.data[yy * w + x] === 1; yy++) extent++
      } else {
        for (let xx = x - 1; xx >= 0 && bin.data[y * w + xx] === 1; xx--) extent++
        for (let xx = x + 1; xx < w && bin.data[y * w + xx] === 1; xx++) extent++
      }
      if (extent <= maxThickness) erased.data[i] = 1
    }
  }
  for (let i = 0; i < w * h; i++) if (erased.data[i]) bin.data[i] = 0
  return erased
}

/** Copies the ink of the given component labels inside a box into a fresh mask. */
export function extractMask(
  labels: Int32Array,
  width: number,
  keep: ReadonlySet<number>,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): BinaryImage {
  const w = x1 - x0 + 1
  const h = y1 - y0 + 1
  const out = createBinary(w, h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (keep.has(labels[(y + y0) * width + x + x0])) out.data[y * w + x] = 1
    }
  }
  return out
}

/** Median of a numeric list (0 for an empty list). */
export function median(values: number[]): number {
  if (values.length === 0) return 0
  const s = [...values].sort((a, b) => a - b)
  return s[s.length >> 1]
}
