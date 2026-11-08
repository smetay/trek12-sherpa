import { createGray, type GrayImage } from '../src/image.ts'

/**
 * Procedural "handwriting" for tests: a small vector font for the digits (strokes in a unit box,
 * y downwards), drawn with jitter and a round pen into a grayscale image. The classifier never saw
 * these shapes (it is trained on MNIST only), so they are a fair, data-free check.
 */
type Stroke = [number, number][]

function arc(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number): Stroke {
  const pts: Stroke = []
  const n = Math.max(6, Math.round(Math.abs(a1 - a0) / 12))
  for (let k = 0; k <= n; k++) {
    const a = ((a0 + ((a1 - a0) * k) / n) * Math.PI) / 180
    pts.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)])
  }
  return pts
}

export const FONT: Record<number, Stroke[]> = {
  0: [arc(0.5, 0.5, 0.3, 0.48, -90, 275)],
  1: [
    [
      [0.28, 0.25],
      [0.55, 0.02],
      [0.55, 1],
    ],
  ],
  2: [[...arc(0.5, 0.3, 0.3, 0.27, 200, 385), [0.18, 1], [0.86, 1]]],
  3: [arc(0.48, 0.27, 0.28, 0.25, 200, 450), arc(0.48, 0.72, 0.32, 0.28, 270, 520)],
  4: [
    [
      [0.66, 1],
      [0.66, 0],
      [0.12, 0.68],
      [0.9, 0.68],
    ],
  ],
  5: [[[0.8, 0.02], [0.28, 0.02], [0.24, 0.44], ...arc(0.5, 0.69, 0.32, 0.3, 230, 495)]],
  6: [[[0.74, 0.02], [0.45, 0.16], [0.26, 0.45], ...arc(0.5, 0.72, 0.3, 0.27, 180, 540)]],
  7: [
    [
      [0.12, 0.02],
      [0.86, 0.02],
      [0.4, 1],
    ],
  ],
  8: [arc(0.5, 0.26, 0.25, 0.24, 90, 450), arc(0.5, 0.73, 0.32, 0.27, -90, 270)],
  9: [
    arc(0.5, 0.3, 0.3, 0.28, 0, 360),
    [
      [0.8, 0.3],
      [0.72, 1],
    ],
  ],
}

/** "☹": face outline, two eyes, a frown. */
export const FACE: Stroke[] = [
  arc(0.5, 0.5, 0.48, 0.48, 0, 360),
  arc(0.33, 0.36, 0.04, 0.04, 0, 360),
  arc(0.67, 0.36, 0.04, 0.04, 0, 360),
  arc(0.5, 0.92, 0.26, 0.2, 235, 305),
]

export function fillDisk(img: GrayImage, cx: number, cy: number, r: number, ink = 40): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= img.width || y >= img.height) continue
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d <= r) img.data[y * img.width + x] = Math.min(img.data[y * img.width + x], ink)
    }
  }
}

export function line(
  img: GrayImage,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pen: number,
  ink = 40,
): void {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2))
  for (let k = 0; k <= steps; k++)
    fillDisk(img, ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps, pen / 2, ink)
}

/** Draws strokes of a unit-box glyph into a box of height `h` at (x, y), with seeded jitter. */
export function drawStrokes(
  img: GrayImage,
  strokes: Stroke[],
  x: number,
  y: number,
  h: number,
  pen: number,
  rng: Rng,
  jitter = 1,
  aspect = 0.62,
): void {
  const rot = (rng.nextFloat() - 0.5) * 0.25 * jitter
  const shear = (rng.nextFloat() - 0.5) * 0.3 * jitter
  const sx = h * (aspect + (rng.nextFloat() - 0.5) * 0.12 * jitter)
  const cos = Math.cos(rot)
  const sin = Math.sin(rot)
  const map = (p: [number, number]): [number, number] => {
    const u = (p[0] - 0.5 + shear * (p[1] - 0.5)) * sx
    const v = (p[1] - 0.5) * h
    return [
      x + u * cos - v * sin + (rng.nextFloat() - 0.5) * 0.02 * h * jitter,
      y + u * sin + v * cos + (rng.nextFloat() - 0.5) * 0.02 * h * jitter,
    ]
  }
  for (const s of strokes) {
    const pts = s.map(map)
    for (let i = 1; i < pts.length; i++)
      line(img, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], pen)
  }
}

/** Draws a number (one or two digits) or ☹ (13) centred at (x, y). */
export function drawValue(
  img: GrayImage,
  value: number,
  x: number,
  y: number,
  h: number,
  pen: number,
  rng: Rng,
): void {
  if (value === 13) {
    drawStrokes(img, FACE, x, y, h, pen, rng, 0.5, 1)
    return
  }
  if (value >= 10) {
    drawStrokes(img, FONT[1], x - 0.3 * h, y, h, pen, rng)
    drawStrokes(img, FONT[value - 10], x + 0.3 * h, y, h, pen, rng)
    return
  }
  drawStrokes(img, FONT[value], x, y, h, pen, rng)
}

/** Paper with a gentle illumination gradient and seeded grain. */
export function paper(width: number, height: number, rng: Rng): GrayImage {
  const img = createGray(width, height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const light = 225 - 35 * (x / width) - 15 * (y / height)
      img.data[y * width + x] = Math.round(light + (rng.nextFloat() - 0.5) * 14)
    }
  }
  return img
}

/** Seeded splitmix32 (tests stay reproducible without depending on another package). */
export class Rng {
  private state: number
  constructor(seed: number) {
    this.state = seed >>> 0
  }
  nextFloat(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0
    let z = this.state
    z = Math.imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
    z = Math.imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
    return ((z ^ (z >>> 15)) >>> 0) / 4294967296
  }
  nextInt(n: number): number {
    return Math.floor(this.nextFloat() * n)
  }
}
