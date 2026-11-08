import { classifyGlyph, NO_READING, type Reading } from './classify.ts'
import { applyH, type Homography, type Point, type Quad, quadSize, warpQuad } from './homography.ts'
import {
  type BinaryImage,
  binarize,
  type Component,
  connectedComponents,
  downscale,
  extractMask,
  findLineRunsHalf,
  type GrayImage,
  median,
  removeRuledLines,
} from './image.ts'

/** Axis-aligned box in ORIGINAL image pixels. */
export type Box = { x: number; y: number; w: number; h: number }

export type DigitRead = Reading & { box: Box | null }

export type DiceLogRow = {
  yellow: DigitRead
  red: DigitRead
  /**
   * Position of the row among the ruled lines, counted from the first row read (0, 1, 2…), or null
   * on unruled paper. A jump (0, 1, 3) reveals a skipped or unreadable line.
   */
  slot: number | null
}

export type DiceLogRead = {
  /** One entry per roll, top to bottom. */
  rows: DiceLogRow[]
  /** Machine-readable notes: 'no-separator', 'no-digits', 'unpaired'. */
  warnings: string[]
}

export const YELLOW_VALUES: readonly number[] = [0, 1, 2, 3, 4, 5]
export const RED_VALUES: readonly number[] = [1, 2, 3, 4, 5, 6]

/** Longest side of the working image (the photo is downscaled to this before analysis). */
export const WORK_SIDE = 1200

/** A handwritten glyph: one or several ink components read together. */
export type Glyph = {
  labels: number[]
  x0: number
  y0: number
  x1: number
  y1: number
  cx: number
  cy: number
  area: number
}

const gw = (g: Glyph) => g.x1 - g.x0 + 1
const gh = (g: Glyph) => g.y1 - g.y0 + 1

/**
 * Groups ink components into glyphs: a component whose centre lies inside another's box (an "É"
 * accent, the bar of a "5" written in two strokes) or that sits right above/below another with a
 * strong horizontal overlap joins it.
 */
export function groupGlyphs(comps: Component[], unit: number): Glyph[] {
  const parent = comps.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (let i = 0; i < comps.length; i++) {
    const a = comps[i]
    for (let j = i + 1; j < comps.length; j++) {
      const b = comps[j]
      const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) + 1
      const narrow = Math.min(a.x1 - a.x0, b.x1 - b.x0) + 1
      const gapY = Math.max(a.y0, b.y0) - Math.min(a.y1, b.y1)
      const inside =
        (b.cx >= a.x0 && b.cx <= a.x1 && b.cy >= a.y0 && b.cy <= a.y1) ||
        (a.cx >= b.x0 && a.cx <= b.x1 && a.cy >= b.y0 && a.cy <= b.y1)
      if (inside || (ox >= 0.5 * narrow && gapY <= 0.3 * unit)) parent[find(i)] = find(j)
    }
  }
  const groups = new Map<number, Glyph>()
  for (let i = 0; i < comps.length; i++) {
    const c = comps[i]
    const r = find(i)
    const g = groups.get(r)
    if (!g) {
      groups.set(r, {
        labels: [c.label],
        x0: c.x0,
        y0: c.y0,
        x1: c.x1,
        y1: c.y1,
        cx: c.cx * c.area,
        cy: c.cy * c.area,
        area: c.area,
      })
    } else {
      g.labels.push(c.label)
      g.x0 = Math.min(g.x0, c.x0)
      g.y0 = Math.min(g.y0, c.y0)
      g.x1 = Math.max(g.x1, c.x1)
      g.y1 = Math.max(g.y1, c.y1)
      g.cx += c.cx * c.area
      g.cy += c.cy * c.area
      g.area += c.area
    }
  }
  return [...groups.values()].map((g) => ({ ...g, cx: g.cx / g.area, cy: g.cy / g.area }))
}

/**
 * Words: chains of glyphs on the same text line separated by less than one glyph height. With a
 * separator, glyphs on opposite sides of it are never chained.
 */
function words(glyphs: Glyph[], unit: number, side?: (g: Glyph) => number): Glyph[][] {
  const parent = glyphs.map((_, i) => i)
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]]
      i = parent[i]
    }
    return i
  }
  for (let i = 0; i < glyphs.length; i++) {
    for (let j = i + 1; j < glyphs.length; j++) {
      const a = glyphs[i]
      const b = glyphs[j]
      const oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
      if (oy < 0.4 * Math.min(gh(a), gh(b))) continue
      const gapX = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1)
      if (side && Math.sign(side(a)) !== Math.sign(side(b))) continue
      if (gapX <= 0.9 * unit) parent[find(i)] = find(j)
    }
  }
  const out = new Map<number, Glyph[]>()
  glyphs.forEach((g, i) => {
    const r = find(i)
    const list = out.get(r)
    if (list) list.push(g)
    else out.set(r, [g])
  })
  return [...out.values()]
}

/** One glyph from several (a digit written in two separate strokes). */
function mergeGlyphs(list: Glyph[]): Glyph {
  const area = list.reduce((n, g) => n + g.area, 0)
  return {
    labels: list.flatMap((g) => g.labels),
    x0: Math.min(...list.map((g) => g.x0)),
    y0: Math.min(...list.map((g) => g.y0)),
    x1: Math.max(...list.map((g) => g.x1)),
    y1: Math.max(...list.map((g) => g.y1)),
    cx: list.reduce((n, g) => n + g.cx * g.area, 0) / area,
    cy: list.reduce((n, g) => n + g.cy * g.area, 0) / area,
    area,
  }
}

/**
 * Candidate die values: lone glyphs, or a pair of glyphs narrow enough to be one digit written in two
 * strokes. Longer words (titles, two-digit row numbers, "DÉ") are not dice.
 */
function loneGlyphs(ws: Glyph[][], unit: number, below: number): Glyph[] {
  const out: Glyph[] = []
  for (const word of ws) {
    let g: Glyph | null = null
    if (word.length === 1) g = word[0]
    else if (word.length === 2) {
      const m = mergeGlyphs(word)
      if (gw(m) <= 1.1 * unit) g = m
    }
    if (g && g.cy > below) out.push(g)
  }
  return out
}

type Line = { c: number; slope: number; score: number }

/**
 * Candidate vertical lines (x = c + slope·y) from the long vertical ink runs: a Hough-style vote over
 * a few slopes, then non-maximum suppression.
 */
function verticalLines(runs: BinaryImage, minVotes: number): Line[] {
  const { width: w, height: h } = runs
  const slopes = [-0.1, -0.08, -0.06, -0.04, -0.02, 0, 0.02, 0.04, 0.06, 0.08, 0.1]
  const span = w + 2 * Math.ceil(0.1 * h)
  const off = Math.ceil(0.1 * h)
  const votes = slopes.map(() => new Int32Array(span))
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (runs.data[y * w + x] === 0) continue
      for (let s = 0; s < slopes.length; s++) {
        const c = Math.round(x - slopes[s] * y) + off
        if (c >= 0 && c < span) votes[s][c]++
      }
    }
  }
  const found: Line[] = []
  for (let s = 0; s < slopes.length; s++) {
    for (let c = 0; c < span; c++) {
      // Smooth over 3 columns: a slanted line spreads over neighbouring bins.
      const v = votes[s][c] + (c > 0 ? votes[s][c - 1] : 0) + (c < span - 1 ? votes[s][c + 1] : 0)
      if (v >= minVotes) found.push({ c: c - off, slope: slopes[s], score: v })
    }
  }
  found.sort((a, b) => b.score - a.score)
  const kept: Line[] = []
  for (const l of found) {
    const near = kept.some(
      (k) => Math.abs(k.c + k.slope * (h / 2) - (l.c + l.slope * (h / 2))) < 12,
    )
    if (!near) kept.push(l)
    if (kept.length >= 8) break
  }
  return kept
}

/** 1-D clusters of sorted values, split where the gap exceeds `gap`. */
function clusters1d(items: { v: number; g: Glyph }[], gap: number): { v: number; g: Glyph }[][] {
  const sorted = [...items].sort((a, b) => a.v - b.v)
  const out: { v: number; g: Glyph }[][] = []
  for (const it of sorted) {
    const last = out[out.length - 1]
    if (last && it.v - last[last.length - 1].v <= gap) last.push(it)
    else out.push([it])
  }
  return out
}

const centreOf = (list: { v: number }[]) => median(list.map((i) => i.v))

/**
 * Reads a handwritten dice log: one line per roll, the yellow die on the left of a vertical
 * separator and the red die on its right (row numbers on the far left and title lines are ignored).
 * `quad` optionally restricts the analysis to a region (perspective-corrected).
 */
export function readDiceLog(image: GrayImage, quad?: Quad): DiceLogRead {
  // --- Working image and the map back to original pixels -------------------------------------
  let work: GrayImage
  let toSource: (p: Point) => Point
  if (quad) {
    // Area-downscale first so the rectification never skips thin pen strokes.
    const size = quadSize(quad)
    const f = Math.min(1, WORK_SIDE / Math.max(size.width, size.height))
    const ds = f < 1 ? downscale(image, Math.round(Math.max(image.width, image.height) * f)) : null
    const k = ds ? ds.scale : 1
    const q = quad.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad
    const qs = quadSize(q)
    const wq = warpQuad(ds ? ds.image : image, q, qs.width, qs.height)
    work = wq.image
    const H: Homography = wq.toSource
    toSource = (p) => {
      const s = applyH(H, p)
      return { x: s.x / k, y: s.y / k }
    }
  } else {
    const ds = downscale(image, WORK_SIDE)
    work = ds.image
    toSource = (p) => ({ x: p.x / ds.scale, y: p.y / ds.scale })
  }
  const W = work.width
  const H = work.height
  const side = Math.max(W, H)
  const px = side / 1000 // one "pixel" at the reference resolution

  // --- Ink ------------------------------------------------------------------------------------
  const bin = binarize(work, { radius: Math.max(8, Math.round(side / 50)), k: 0.25 })
  const thick = Math.max(3, Math.round(6 * px))
  const hLines = removeRuledLines(bin, 'horizontal', Math.round(W / 10), thick)
  // Vertical runs (half resolution) serve twice: to find the column separator, then to erase it.
  const vRuns = findLineRunsHalf(bin, 'vertical', Math.round(H / 12))
  removeRuledLines(bin, 'vertical', Math.round(H / 12), thick, vRuns)
  const { labels, comps: all } = connectedComponents(bin)
  const comps = all.filter((c) => {
    const w = c.x1 - c.x0 + 1
    const h = c.y1 - c.y0 + 1
    return c.area >= 10 * px * px && w < W / 5 && h < H / 6
  })
  const unitGuess = median(
    comps.filter((c) => c.y1 - c.y0 + 1 >= 12 * px).map((c) => c.y1 - c.y0 + 1),
  )
  if (unitGuess === 0) return { rows: [], warnings: ['no-digits'] }
  let glyphs = groupGlyphs(comps, unitGuess)
  const unit = median(glyphs.filter((g) => gh(g) >= 0.5 * unitGuess).map(gh)) || unitGuess
  glyphs = glyphs.filter(
    (g) =>
      gh(g) >= 0.45 * unit &&
      gh(g) <= 2.5 * unit &&
      gw(g) <= 2.5 * unit &&
      // Paper edges and shadows: blobs far denser than pen strokes.
      g.area <= 0.55 * gw(g) * gh(g),
  )

  // --- Text (title, column headers) -----------------------------------------------------------
  const ws = words(glyphs, unit)
  let headerBottom = -1
  for (const word of ws) {
    if (word.length < 3) continue
    const bottom = Math.max(...word.map((g) => g.y1))
    if (bottom < 0.45 * H && bottom > headerBottom) headerBottom = bottom
  }
  // First guess of the die values, to find the separator; refined once it is known.
  let singles = loneGlyphs(ws, unit, headerBottom)
  if (singles.length === 0) return { rows: [], warnings: ['no-digits'] }

  // --- Columns ----------------------------------------------------------------------------------
  const warnings: string[] = []
  let yellow: Glyph[] = []
  let red: Glyph[] = []
  const lines = verticalLines(vRuns, Math.round(H / 10)).map((l) => ({ ...l, c: 2 * l.c }))
  let best: { line: Line; score: number } | null = null
  for (const line of lines) {
    let left = 0
    let right = 0
    for (const g of singles) {
      const d = g.cx - (line.c + line.slope * g.cy)
      if (d < -0.6 * unit && d > -10 * unit) left++
      if (d > 0.6 * unit && d < 10 * unit) right++
    }
    // Columns on both sides, and a well-drawn line (paper edges and shadows vote weakly).
    const score = Math.min(left, right) * Math.sqrt(line.score)
    if (Math.min(left, right) >= 1 && (best === null || score > best.score)) best = { line, score }
  }
  const minMembers = (cl: { v: number }[][]) =>
    Math.max(1, Math.round(0.3 * Math.max(...cl.map((c) => c.length))))
  if (best) {
    const { line } = best
    // Two glyphs written close to the separator, one on each side, are two dice, not a word.
    const side = (g: Glyph) => g.cx - (line.c + line.slope * g.cy)
    singles = loneGlyphs(words(glyphs, unit, side), unit, headerBottom)
    const dist = singles.map((g) => ({ v: g.cx - (line.c + line.slope * g.cy), g }))
    const leftCl = clusters1d(
      dist.filter((d) => d.v < 0),
      1.6 * unit,
    )
    const rightCl = clusters1d(
      dist.filter((d) => d.v > 0),
      1.6 * unit,
    )
    if (leftCl.length > 0) {
      const m = minMembers(leftCl)
      const near = leftCl.filter((c) => c.length >= m).sort((a, b) => centreOf(b) - centreOf(a))[0]
      yellow = near.map((d) => d.g)
    }
    if (rightCl.length > 0) {
      const m = minMembers(rightCl)
      const near = rightCl.filter((c) => c.length >= m).sort((a, b) => centreOf(a) - centreOf(b))[0]
      red = near.map((d) => d.g)
    }
  } else {
    warnings.push('no-separator')
    const cl = clusters1d(
      singles.map((g) => ({ v: g.cx, g })),
      1.6 * unit,
    )
    const m = minMembers(cl)
    const cols = cl.filter((c) => c.length >= m).sort((a, b) => centreOf(a) - centreOf(b))
    if (cols.length >= 2) {
      yellow = cols[cols.length - 2].map((d) => d.g)
      red = cols[cols.length - 1].map((d) => d.g)
    }
  }
  // A value is about as tall as the other values of its column.
  const plausible = (col: Glyph[]) => {
    const h = median(col.map(gh))
    return col.filter((g) => gh(g) >= 0.55 * h && gh(g) <= 1.8 * h)
  }
  yellow = plausible(yellow).sort((a, b) => a.cy - b.cy)
  red = plausible(red).sort((a, b) => a.cy - b.cy)
  if (yellow.length === 0 && red.length === 0)
    return { rows: [], warnings: [...warnings, 'no-digits'] }

  // --- Rows: pair yellow and red (monotone alignment; the ruled line count is a strong cue) -----
  const lineIndex = (g: Glyph) => linesAbove(hLines, Math.round(g.cx), Math.round(g.cy))
  const yIdx = yellow.map(lineIndex)
  const rIdx = red.map(lineIndex)
  const offsets: number[] = []
  yellow.forEach((g, i) => {
    red.forEach((r, j) => {
      if (yIdx[i] === rIdx[j] && Math.abs(r.cy - g.cy) < 1.5 * unit) offsets.push(r.cy - g.cy)
    })
  })
  const offset = median(offsets)
  const pairs = alignRows(yellow, red, yIdx, rIdx, offset, unit)
  // Ruled paper: every value sits under a known number of lines (they all differ row to row).
  const slots = pairs.map((p) => lineIndex(p.y ?? (p.r as Glyph)))
  const ruled =
    slots.length > 1 &&
    new Set(slots).size === slots.length &&
    slots.every((v, i) => i === 0 || v > slots[i - 1])
  const firstSlot = slots.length > 0 ? slots[0] : 0
  if (pairs.some((p) => p.y === null || p.r === null)) warnings.push('unpaired')

  // --- Classification -------------------------------------------------------------------------
  const read = (g: Glyph | null, allowed: readonly number[]): DigitRead => {
    if (g === null) return { ...NO_READING, box: null }
    const mask = extractMask(labels, W, new Set(g.labels), g.x0, g.y0, g.x1, g.y1)
    const reading = classifyGlyph(mask, allowed)
    return { ...reading, box: boxToSource(g, toSource) }
  }
  return {
    rows: pairs.map((p) => ({
      yellow: read(p.y, YELLOW_VALUES),
      red: read(p.r, RED_VALUES),
      slot: ruled ? lineIndex(p.y ?? (p.r as Glyph)) - firstSlot : null,
    })),
    warnings,
  }
}

/** Number of ruled lines crossed going straight up from (x, y) (runs closer than 3 px merged). */
function linesAbove(lines: BinaryImage, x: number, y: number): number {
  let count = 0
  let gap = 3
  for (let yy = Math.min(y, lines.height - 1); yy >= 0; yy--) {
    if (lines.data[yy * lines.width + x] === 1) {
      if (gap >= 3) count++
      gap = 0
    } else gap++
  }
  return count
}

type Pair = { y: Glyph | null; r: Glyph | null }

/**
 * Pairs the two columns top to bottom with a monotone alignment (no crossing pairs). A pair costs its
 * vertical misfit in glyph heights, plus a penalty when the two glyphs sit under a different number
 * of ruled lines; leaving a glyph unpaired costs a fixed amount.
 */
function alignRows(
  yellow: Glyph[],
  red: Glyph[],
  yIdx: number[],
  rIdx: number[],
  offset: number,
  unit: number,
): Pair[] {
  const n = yellow.length
  const m = red.length
  const SKIP = 1.2
  const cost = new Float64Array((n + 1) * (m + 1)).fill(Infinity)
  const move = new Uint8Array((n + 1) * (m + 1)) // 1 pair, 2 skip yellow, 3 skip red
  cost[0] = 0
  for (let i = 0; i <= n; i++) {
    for (let j = 0; j <= m; j++) {
      const here = cost[i * (m + 1) + j]
      if (here === Infinity) continue
      if (i < n && j < m) {
        const misfit = Math.abs(red[j].cy - yellow[i].cy - offset) / unit
        if (misfit < 1.5) {
          const c = here + misfit + (yIdx[i] === rIdx[j] ? 0 : 1.5)
          const k = (i + 1) * (m + 1) + j + 1
          if (c < cost[k]) {
            cost[k] = c
            move[k] = 1
          }
        }
      }
      if (i < n) {
        const k = (i + 1) * (m + 1) + j
        if (here + SKIP < cost[k]) {
          cost[k] = here + SKIP
          move[k] = 2
        }
      }
      if (j < m) {
        const k = i * (m + 1) + j + 1
        if (here + SKIP < cost[k]) {
          cost[k] = here + SKIP
          move[k] = 3
        }
      }
    }
  }
  const out: Pair[] = []
  let i = n
  let j = m
  while (i > 0 || j > 0) {
    const mv = move[i * (m + 1) + j]
    if (mv === 1) {
      out.push({ y: yellow[--i], r: red[--j] })
    } else if (mv === 2) out.push({ y: yellow[--i], r: null })
    else out.push({ y: null, r: red[--j] })
  }
  return out.reverse()
}

function boxToSource(g: Glyph, toSource: (p: Point) => Point): Box {
  const pad = 0.15 * Math.max(gw(g), gh(g))
  const corners = [
    toSource({ x: g.x0 - pad, y: g.y0 - pad }),
    toSource({ x: g.x1 + 1 + pad, y: g.y0 - pad }),
    toSource({ x: g.x1 + 1 + pad, y: g.y1 + 1 + pad }),
    toSource({ x: g.x0 - pad, y: g.y1 + 1 + pad }),
  ]
  const xs = corners.map((c) => c.x)
  const ys = corners.map((c) => c.y)
  const x = Math.min(...xs)
  const y = Math.min(...ys)
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(Math.max(...xs) - x),
    h: Math.round(Math.max(...ys) - y),
  }
}
