import { decode, glyphProbabilities, type Reading, SAD_VALUE } from './classify.ts'
import { groupGlyphs } from './dicelog.ts'
import { applyH, type Homography, homographyFrom, type Point } from './homography.ts'
import {
  type BinaryImage,
  type Component,
  connectedComponents,
  createBinary,
  createGray,
  downscale,
  extractMask,
  type GrayImage,
  median,
  sampleBilinear,
} from './image.ts'

/** A circle of the sheet in map units (neighbouring centres ~1 apart, printed radius 0.5). */
export type SheetCell = { x: number; y: number; max: number }

/** A user tap: the centre of circle `cell`, in image pixels. */
export type Anchor = { cell: number; at: Point }

/**
 * One circle as read. For an empty circle `value` is null and `confidence` says how sure we are that
 * nothing is written in it.
 */
export type SheetCellRead = Reading & {
  /** Refined circle centre, in image pixels. */
  center: Point
  /** Circle radius in image pixels (local scale). */
  radius: number
}

/** Pixels per map unit of the per-circle canvas (printed radius = 32 px). */
const S = 64
/** Half side of the per-circle canvas, in map units. */
const HALF = 0.85
const SIDE = Math.round(2 * HALF * S)
const C = SIDE / 2

/**
 * Rectifies the neighbourhood of a map point into a SIDE × SIDE canvas (perspective removed). Canvas
 * pixel (u, v) — centre convention of `sampleBilinear` — is map point (cx + (u − C)/S, cy + (v − C)/S).
 */
function cellCanvas(img: GrayImage, H: Homography, cx: number, cy: number): GrayImage {
  const out = createGray(SIDE, SIDE)
  for (let v = 0; v < SIDE; v++) {
    for (let u = 0; u < SIDE; u++) {
      const p = applyH(H, { x: cx + (u - C) / S, y: cy + (v - C) / S })
      out.data[v * SIDE + u] =
        p.x < 0 || p.y < 0 || p.x > img.width - 1 || p.y > img.height - 1
          ? 255
          : Math.round(sampleBilinear(img, p.x, p.y))
    }
  }
  return out
}

const RING_SAMPLES = 48
const RING_COS = new Float64Array(RING_SAMPLES)
const RING_SIN = new Float64Array(RING_SAMPLES)
for (let k = 0; k < RING_SAMPLES; k++) {
  RING_COS[k] = Math.cos((2 * Math.PI * k) / RING_SAMPLES)
  RING_SIN[k] = Math.sin((2 * Math.PI * k) / RING_SAMPLES)
}

/** Darkness of a ring (radius r around (x, y)) relative to the interior just inside it. */
function ringContrast(canvas: GrayImage, x: number, y: number, r: number): number {
  let ring = 0
  let inner = 0
  for (let k = 0; k < RING_SAMPLES; k++) {
    const c = RING_COS[k]
    const s = RING_SIN[k]
    // The darkest of three radii: tolerates a thick or slightly elliptic outline.
    const d0 = sampleBilinear(canvas, x + c * r * 0.94, y + s * r * 0.94)
    const d1 = sampleBilinear(canvas, x + c * r, y + s * r)
    const d2 = sampleBilinear(canvas, x + c * r * 1.06, y + s * r * 1.06)
    ring += Math.min(d0, d1, d2)
    inner += sampleBilinear(canvas, x + c * r * 0.8, y + s * r * 0.8)
  }
  return (inner - ring) / RING_SAMPLES
}

/**
 * Finds the printed ring around the canvas centre: the shift (canvas px) and radius maximising the
 * darkness of the ring relative to the circle's interior. Coarse grid at the nominal radius, then a
 * fine search around the best shift over a few radii.
 */
function locateRing(canvas: GrayImage): { dx: number; dy: number; r: number; contrast: number } {
  const reach = Math.round(0.24 * S)
  let best = { dx: 0, dy: 0, r: 0.5 * S, contrast: -Infinity }
  for (let dy = -reach; dy <= reach; dy += 4) {
    for (let dx = -reach; dx <= reach; dx += 4) {
      const contrast = ringContrast(canvas, C + dx, C + dy, 0.5 * S)
      if (contrast > best.contrast) best = { dx, dy, r: 0.5 * S, contrast }
    }
  }
  const cx = best.dx
  const cy = best.dy
  for (const rf of [0.42, 0.46, 0.5, 0.54, 0.58]) {
    const r = rf * S
    for (let dy = cy - 3; dy <= cy + 3; dy++) {
      for (let dx = cx - 3; dx <= cx + 3; dx++) {
        const contrast = ringContrast(canvas, C + dx, C + dy, r)
        if (contrast > best.contrast) best = { dx, dy, r, contrast }
      }
    }
  }
  return best
}

/** Ink of the circle's interior (disk of radius `rr` canvas px around (x, y)), outer ring excluded. */
function interiorInk(canvas: GrayImage, x: number, y: number, rr: number): BinaryImage {
  const vals: number[] = []
  for (let v = 0; v < SIDE; v++) {
    for (let u = 0; u < SIDE; u++) {
      if ((u - x) ** 2 + (v - y) ** 2 <= rr * rr) vals.push(canvas.data[v * SIDE + u])
    }
  }
  vals.sort((a, b) => a - b)
  const paper = vals[Math.floor(0.8 * (vals.length - 1))] ?? 255
  const limit = Math.min(paper - 35, paper * 0.72)
  const out = createBinary(SIDE, SIDE)
  for (let v = 0; v < SIDE; v++) {
    for (let u = 0; u < SIDE; u++) {
      if ((u - x) ** 2 + (v - y) ** 2 > rr * rr) continue
      if (canvas.data[v * SIDE + u] < limit) out.data[v * SIDE + u] = 1
    }
  }
  return out
}

type Interpretation = { probs: Float64Array; weight: number }

const add = (dst: Float64Array, src: Float64Array, w: number) => {
  for (let i = 0; i < dst.length; i++) dst[i] += w * src[i]
}

/** Probabilities over values 0–12 and ☹ (index 13) for one glyph read as a single symbol. */
function singleProbs(mask: BinaryImage): Float64Array {
  const out = new Float64Array(SAD_VALUE + 1)
  const p = glyphProbabilities(mask)
  if (p === null) return out
  for (let d = 0; d < 10; d++) out[d] = p[d]
  out[SAD_VALUE] = p[SAD_VALUE]
  return out
}

/** Two glyphs read as a two-digit number: only 10, 11 and 12 exist on a sheet. */
function pairProbs(left: BinaryImage, right: BinaryImage): Float64Array {
  const out = new Float64Array(SAD_VALUE + 1)
  const a = glyphProbabilities(left)
  const b = glyphProbabilities(right)
  if (a === null || b === null) return out
  for (let d = 0; d <= 2; d++) out[10 + d] = a[1] * b[d]
  // Renormalise: the pair is certainly a number, the question is which.
  const z = out[10] + out[11] + out[12]
  if (z > 0) for (let d = 10; d <= 12; d++) out[d] = (out[d] / z) * Math.min(1, z / 0.25)
  return out
}

/** Splits a mask at the emptiest column of its middle part (two digits written touching). */
function splitWide(mask: BinaryImage): [BinaryImage, BinaryImage] | null {
  const { width: w, height: h } = mask
  let bestX = -1
  let bestInk = Infinity
  for (let x = Math.floor(0.3 * w); x <= Math.ceil(0.7 * w); x++) {
    let ink = 0
    for (let y = 0; y < h; y++) ink += mask.data[y * w + x]
    if (ink < bestInk) {
      bestInk = ink
      bestX = x
    }
  }
  if (bestX <= 0 || bestX >= w - 1) return null
  const part = (x0: number, x1: number) => {
    const out = createBinary(x1 - x0, h)
    for (let y = 0; y < h; y++)
      for (let x = x0; x < x1; x++) out.data[y * out.width + x - x0] = mask.data[y * w + x]
    return out
  }
  return [part(0, bestX), part(bestX + 1, w)]
}

/** Reads the interior of one rectified circle: empty, one symbol, or a two-digit number. */
function readInterior(canvas: GrayImage, x: number, y: number, r: number, max: number): Reading {
  const rr = 0.76 * r
  const ink = interiorInk(canvas, x, y, rr)
  const { labels, comps } = connectedComponents(ink)
  const minArea = 0.004 * Math.PI * rr * rr
  // Closest approach of each component to the centre: remnants of a thick printed outline (even a
  // complete annulus) stay in the outer band, while a written symbol reaches further in.
  const closest = new Float64Array(comps.length + 1).fill(Infinity)
  for (let v = 0; v < SIDE; v++) {
    for (let u = 0; u < SIDE; u++) {
      const l = labels[v * SIDE + u]
      if (l === 0) continue
      const d = (u - x) ** 2 + (v - y) ** 2
      if (d < closest[l]) closest[l] = d
    }
  }
  // A drawn ☹ outline sits around 0.5 R: only what stays beyond ~2/3 R is taken for the printed ring.
  const band = (0.66 * r) ** 2
  const kept: Component[] = comps.filter((c) => c.area >= minArea && closest[c.label] <= band)
  const inkArea = kept.reduce((n, c) => n + c.area, 0)
  if (inkArea < 0.012 * Math.PI * rr * rr) {
    return { value: null, confidence: inkArea === 0 ? 1 : 0.8, alternatives: [] }
  }
  const glyphs = groupGlyphs(kept, 0.6 * r).sort((a, b) => a.cx - b.cx)
  const maskOf = (labelsList: number[], x0: number, y0: number, x1: number, y1: number) =>
    extractMask(labels, SIDE, new Set(labelsList), x0, y0, x1, y1)
  const all = maskOf(
    kept.map((c) => c.label),
    Math.min(...kept.map((c) => c.x0)),
    Math.min(...kept.map((c) => c.y0)),
    Math.max(...kept.map((c) => c.x1)),
    Math.max(...kept.map((c) => c.y1)),
  )
  const interpretations: Interpretation[] = []
  const big = glyphs.filter((g) => g.area >= 0.15 * inkArea)
  const maskOfGlyph = (g: (typeof glyphs)[number]) => maskOf(g.labels, g.x0, g.y0, g.x1, g.y1)
  if (glyphs.length === 1) {
    interpretations.push({ probs: singleProbs(all), weight: 1 })
    if (max >= 10 && all.width > 1.15 * all.height) {
      const halves = splitWide(all)
      if (halves) interpretations.push({ probs: pairProbs(halves[0], halves[1]), weight: 0.6 })
    }
  } else if (big.length === 2 && max >= 10) {
    // Two symbols side by side: a two-digit number (or, rarely, a ☹ drawn in two pieces).
    interpretations.push({ probs: pairProbs(maskOfGlyph(big[0]), maskOfGlyph(big[1])), weight: 1 })
    interpretations.push({ probs: singleProbs(all), weight: 0.15 })
  } else {
    // A symbol in several pieces (a ☹, a broken digit), or noise next to a digit.
    interpretations.push({ probs: singleProbs(all), weight: 1 })
    if (max >= 10 && big.length >= 2) {
      const [a, b] = [...big]
        .sort((p, q) => q.area - p.area)
        .slice(0, 2)
        .sort((p, q) => p.cx - q.cx)
      interpretations.push({ probs: pairProbs(maskOfGlyph(a), maskOfGlyph(b)), weight: 0.3 })
    }
  }
  const total = new Float64Array(SAD_VALUE + 1)
  for (const it of interpretations) add(total, it.probs, it.weight)
  const allowed: number[] = []
  for (let v = 0; v <= Math.min(max, 12); v++) allowed.push(v)
  allowed.push(SAD_VALUE)
  return decode(total, allowed)
}

/**
 * Reads a photographed, filled ascent sheet. `cells` are the sheet's circles in map units; `anchors`
 * (≥ 4, not collinear) give where some circle centres are in the photo. Every circle is rectified
 * from the photo, re-centred on its printed ring, then its interior is read: null (empty), 0–12, or
 * 13 for ☹. The alignment is refined once from all the rings found before reading.
 */
export function readSheet(
  image: GrayImage,
  cells: readonly SheetCell[],
  anchors: readonly Anchor[],
): SheetCellRead[] {
  if (anchors.length < 4) throw new Error('readSheet needs at least 4 anchors')
  const mapPts = anchors.map((a) => ({ x: cells[a.cell].x, y: cells[a.cell].y }))
  // Sample the circles from an image of about the canvas resolution: bilinear sampling of a much
  // larger photo would skip thin pen strokes. Results are scaled back to the caller's pixels.
  const H0 = homographyFrom(
    mapPts,
    anchors.map((a) => a.at),
  )
  let ppu = 0
  for (const c of cells) {
    const a = applyH(H0, c)
    const b = applyH(H0, { x: c.x + 1, y: c.y })
    ppu += Math.hypot(b.x - a.x, b.y - a.y) / cells.length
  }
  const factor = ppu > 1.6 * S ? (1.25 * S) / ppu : 1
  if (factor < 1) {
    const small = downscale(image, Math.round(Math.max(image.width, image.height) * factor))
    const f = small.scale
    const read = readSheet(
      small.image,
      cells,
      anchors.map((a) => ({ cell: a.cell, at: { x: a.at.x * f, y: a.at.y * f } })),
    )
    return read.map((r) => ({
      ...r,
      center: { x: r.center.x / f, y: r.center.y / f },
      radius: r.radius / f,
    }))
  }
  let H = H0
  // Pass 1: locate every ring, then refit the homography on the confident ones.
  const found = cells.map((c) => {
    const canvas = cellCanvas(image, H, c.x, c.y)
    const ring = locateRing(canvas)
    return { canvas, ring }
  })
  const contrasts = found.map((f) => f.ring.contrast)
  const good = median(contrasts) * 0.5
  const from: Point[] = []
  const to: Point[] = []
  found.forEach((f, i) => {
    if (f.ring.contrast < Math.max(8, good)) return
    from.push({ x: cells[i].x, y: cells[i].y })
    to.push(applyH(H, { x: cells[i].x + f.ring.dx / S, y: cells[i].y + f.ring.dy / S }))
  })
  if (from.length >= 6) {
    try {
      H = homographyFrom(from, to)
      found.forEach((f, i) => {
        f.canvas = cellCanvas(image, H, cells[i].x, cells[i].y)
        f.ring = locateRing(f.canvas)
      })
    } catch {
      // Degenerate refit: keep the anchor homography.
    }
  }
  return cells.map((cell, i) => {
    const { canvas, ring } = found[i]
    const ok = ring.contrast >= 8
    const x = C + (ok ? ring.dx : 0)
    const y = C + (ok ? ring.dy : 0)
    const r = ok ? ring.r : 0.5 * S
    const reading = readInterior(canvas, x, y, r, cell.max)
    const center = applyH(H, { x: cell.x + (x - C) / S, y: cell.y + (y - C) / S })
    const edge = applyH(H, { x: cell.x + (x - C + r) / S, y: cell.y + (y - C) / S })
    const edge2 = applyH(H, { x: cell.x + (x - C) / S, y: cell.y + (y - C + r) / S })
    const radius =
      (Math.hypot(edge.x - center.x, edge.y - center.y) +
        Math.hypot(edge2.x - center.x, edge2.y - center.y)) /
      2
    return { ...reading, center, radius }
  })
}
