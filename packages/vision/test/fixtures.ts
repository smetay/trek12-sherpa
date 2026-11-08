import { applyH, homographyFrom, type Point } from '../src/homography.ts'
import type { GrayImage } from '../src/image.ts'
import { drawStrokes, drawValue, FONT, line, paper, Rng } from './draw.ts'

/** Block capitals for the header line, as strokes in a unit box. */
const LETTERS: Record<string, [number, number][][]> = {
  D: [
    [
      [0.2, 0],
      [0.2, 1],
      [0.55, 0.95],
      [0.8, 0.5],
      [0.55, 0.05],
      [0.2, 0],
    ],
  ],
  E: [
    [
      [0.8, 0],
      [0.2, 0],
      [0.2, 1],
      [0.8, 1],
    ],
    [
      [0.2, 0.5],
      [0.65, 0.5],
    ],
  ],
  J: [
    [
      [0.75, 0],
      [0.75, 0.8],
      [0.5, 1],
      [0.25, 0.8],
    ],
  ],
  A: [
    [
      [0.1, 1],
      [0.5, 0],
      [0.9, 1],
    ],
    [
      [0.28, 0.6],
      [0.72, 0.6],
    ],
  ],
  U: [
    [
      [0.2, 0],
      [0.2, 0.8],
      [0.5, 1],
      [0.8, 0.8],
      [0.8, 0],
    ],
  ],
  N: [
    [
      [0.2, 1],
      [0.2, 0],
      [0.8, 1],
      [0.8, 0],
    ],
  ],
  R: [
    [
      [0.2, 1],
      [0.2, 0],
      [0.7, 0.1],
      [0.7, 0.45],
      [0.2, 0.5],
      [0.8, 1],
    ],
  ],
  O: [
    [
      [0.5, 0],
      [0.85, 0.5],
      [0.5, 1],
      [0.15, 0.5],
      [0.5, 0],
    ],
  ],
  G: [
    [
      [0.8, 0.15],
      [0.5, 0],
      [0.15, 0.5],
      [0.5, 1],
      [0.85, 0.7],
      [0.55, 0.65],
    ],
  ],
}

function word(
  img: GrayImage,
  text: string,
  x: number,
  y: number,
  h: number,
  pen: number,
  rng: Rng,
) {
  let cx = x
  for (const ch of text) {
    if (ch !== ' ') drawStrokes(img, LETTERS[ch], cx, y, h, pen, rng, 0.5)
    cx += 0.85 * h
  }
}

export type SyntheticLog = { image: GrayImage; rolls: ([number, number] | null)[] }

/**
 * A dice log like the players' hand-made sheet: header "DE JAUNE | DE ROUGE", ruled lines (slightly
 * slanted), a hand-drawn separator, row numbers, and the rolls; `null` rows are left empty.
 */
export function syntheticDiceLog(
  seed: number,
  rolls: ([number, number] | null)[],
  options: { separator?: boolean; header?: boolean; compact?: boolean } = {},
): SyntheticLog {
  const rng = new Rng(seed)
  const W = 900
  const H = 1200
  const img = paper(W, H, rng)
  const slope = (rng.nextFloat() - 0.5) * 0.06
  const top = 230
  const pitch = (H - top - 40) / rolls.length
  const digitH = Math.min(46, pitch * 0.62)
  const sep = 420
  if (options.header !== false) {
    word(img, 'DE JAUNE', 110, 150, 34, 3, rng)
    word(img, 'DE ROUGE', 480, 150, 34, 3, rng)
  }
  if (options.separator !== false) line(img, sep, 110, sep + 12, H - 30, 3)
  for (let i = 0; i <= rolls.length; i++) {
    const y = top + i * pitch
    line(img, 30, y, W - 40, y + slope * (W - 70), 3)
  }
  rolls.forEach((roll, i) => {
    const cy = top + (i + 0.5) * pitch
    const at = (x: number) => cy + slope * (x - 30)
    const n = i + 1
    if (n < 10) drawValue(img, n, 60, at(60), digitH * 0.8, 3, rng)
    else {
      drawStrokes(img, FONT[1], 50, at(50), digitH * 0.8, 3, rng)
      drawStrokes(img, FONT[n - 10], 75, at(75), digitH * 0.8, 3, rng)
    }
    if (roll === null) return
    const yx = options.compact ? sep - 0.9 * digitH : 230 + (rng.nextFloat() - 0.5) * 40
    const rx = options.compact ? sep + 0.9 * digitH + 12 : 600 + (rng.nextFloat() - 0.5) * 40
    drawValue(img, roll[0], yx, at(yx) + (rng.nextFloat() - 0.5) * 8, digitH, 3.5, rng)
    drawValue(img, roll[1], rx, at(rx) + (rng.nextFloat() - 0.5) * 8, digitH, 3.5, rng)
  })
  return { image: img, rolls }
}

export type SyntheticSheet = { image: GrayImage; toImage: (p: Point) => Point }

/**
 * A photographed ascent sheet: circles at the map positions seen through a perspective transform,
 * thick outlines for the dangerous ones, values written inside (`null` = empty circle).
 */
export function syntheticSheet(
  seed: number,
  cells: { x: number; y: number; max: number }[],
  values: (number | null)[],
  options: { dangerPen?: number } = {},
): SyntheticSheet {
  const rng = new Rng(seed)
  const W = 1000
  const H = 1300
  const img = paper(W, H, rng)
  const xs = cells.map((c) => c.x)
  const ys = cells.map((c) => c.y)
  const minX = Math.min(...xs) - 1
  const maxX = Math.max(...xs) + 1
  const minY = Math.min(...ys) - 1
  const maxY = Math.max(...ys) + 1
  const j = () => (rng.nextFloat() - 0.5) * 60
  // Uniform scale (handwriting stays round on the sheet), then a mild perspective on the corners.
  const scale = Math.min((W - 160) / (maxX - minX), (H - 200) / (maxY - minY))
  const ox = (W - scale * (maxX - minX)) / 2
  const oy = (H - scale * (maxY - minY)) / 2
  const corner = (x: number, y: number) => ({
    x: ox + (x - minX) * scale + j(),
    y: oy + (y - minY) * scale + j(),
  })
  const H_ = homographyFrom(
    [
      { x: minX, y: minY },
      { x: maxX, y: minY },
      { x: maxX, y: maxY },
      { x: minX, y: maxY },
    ],
    [corner(minX, minY), corner(maxX, minY), corner(maxX, maxY), corner(minX, maxY)],
  )
  const toImage = (p: Point) => applyH(H_, p)
  cells.forEach((c, i) => {
    const centre = toImage(c)
    const rim = toImage({ x: c.x + 0.5, y: c.y })
    const r = Math.hypot(rim.x - centre.x, rim.y - centre.y)
    const pen = c.max < 12 ? (options.dangerPen ?? 7) : 3
    for (let k = 0; k < 90; k++) {
      const a0 = (2 * Math.PI * k) / 90
      const a1 = (2 * Math.PI * (k + 1)) / 90
      const p0 = toImage({ x: c.x + 0.5 * Math.cos(a0), y: c.y + 0.5 * Math.sin(a0) })
      const p1 = toImage({ x: c.x + 0.5 * Math.cos(a1), y: c.y + 0.5 * Math.sin(a1) })
      line(img, p0.x, p0.y, p1.x, p1.y, pen, 70)
    }
    const v = values[i]
    if (v !== null && v !== undefined) {
      const h = r * (v === 13 ? 1.15 : 1.0)
      drawValue(
        img,
        v,
        centre.x + (rng.nextFloat() - 0.5) * 0.1 * r,
        centre.y + (rng.nextFloat() - 0.5) * 0.1 * r,
        h,
        3,
        rng,
      )
    }
  })
  return { image: img, toImage }
}
