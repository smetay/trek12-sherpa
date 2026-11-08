// Trains the glyph classifier of @trek12/vision and writes packages/vision/src/model-weights.ts.
//
//   node apps/bench/src/ocr-train.ts --data .cache/mnist --seed 1 --epochs 8
//
// The MNIST idx files are not committed: `npm pack mnist-loader` and copy its `data/` folder into the
// git-ignored `.cache/mnist`. Every MNIST image is augmented (affine + mild elastic distortion, stroke
// breaks, European "1" flags and crossed "7"s), thresholded, then normalised by the SAME function the
// app uses on photos (skeleton → fixed pen), so the network never sees raw MNIST strokes. Class 10 is
// a procedurally drawn "☹"; `--extras` adds procedural continental "1"s and open-top "4"s, which
// American MNIST under-represents. Deterministic for a given seed. `--preview` prints samples.
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { Rng } from '@trek12/engine'
import {
  base64Decode,
  base64Encode,
  type CnnShape,
  type CnnWeights,
  dequantize,
  forward,
  K,
  quantize,
  SAD_CLASS,
  tensorSizes,
  tensorsOf,
  weightsFromTensors,
} from '../../../packages/vision/src/cnn.ts'
import { GLYPH_SIZE, normalizeGlyph } from '../../../packages/vision/src/glyph.ts'
import { type BinaryImage, createBinary } from '../../../packages/vision/src/image.ts'

const { values } = parseArgs({
  options: {
    data: { type: 'string', default: '.cache/mnist' },
    seed: { type: 'string', default: '1' },
    epochs: { type: 'string', default: '8' },
    limit: { type: 'string' },
    c1: { type: 'string', default: '8' },
    c2: { type: 'string', default: '16' },
    hidden: { type: 'string', default: '64' },
    lr: { type: 'string', default: '0.0015' },
    out: { type: 'string', default: 'packages/vision/src/model-weights.ts' },
    extras: { type: 'boolean', default: false },
    preview: { type: 'boolean', default: false },
    init: { type: 'string' },
  },
})

const seed = Number(values.seed)
const epochs = Number(values.epochs)
const shape: CnnShape = {
  c1: Number(values.c1),
  c2: Number(values.c2),
  hidden: Number(values.hidden),
  classes: 11,
}
const rng = new Rng(seed)
const log = (s: string) => console.log(s)

// --- MNIST ----------------------------------------------------------------------------------------
function readIdx(file: string): { dims: number[]; data: Uint8Array } {
  const buf = readFileSync(file)
  const nd = buf[3]
  const dims: number[] = []
  for (let i = 0; i < nd; i++) dims.push(buf.readUInt32BE(4 + 4 * i))
  return { dims, data: new Uint8Array(buf.buffer, buf.byteOffset + 4 + 4 * nd) }
}
const trainImg = readIdx(join(values.data, 'train-images-idx3-ubyte'))
const trainLbl = readIdx(join(values.data, 'train-labels-idx1-ubyte'))
const testImg = readIdx(join(values.data, 't10k-images-idx3-ubyte'))
const testLbl = readIdx(join(values.data, 't10k-labels-idx1-ubyte'))
const nTrain = values.limit ? Number(values.limit) : trainImg.dims[0]

// --- Augmentation (56 × 56 working canvas) --------------------------------------------------------
const W = 56
function fillDisk(m: BinaryImage, cx: number, cy: number, r: number): void {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
      if (x < 0 || y < 0 || x >= m.width || y >= m.height) continue
      if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) m.data[y * m.width + x] = 1
    }
  }
}
function strokeLine(m: BinaryImage, ax: number, ay: number, bx: number, by: number, r: number) {
  const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 2))
  for (let k = 0; k <= steps; k++)
    fillDisk(m, ax + ((bx - ax) * k) / steps, ay + ((by - ay) * k) / steps, r)
}
function polyline(m: BinaryImage, pts: [number, number][], r: number) {
  for (let i = 1; i < pts.length; i++)
    strokeLine(m, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1], r)
}
const uni = (a: number, b: number) => a + (b - a) * rng.nextFloat()

/** Augmented MNIST digit → binary mask on the 56 × 56 canvas. */
function augmentDigit(img: Uint8Array, off: number, label: number, augment: boolean): BinaryImage {
  const th = augment ? uni(-0.26, 0.26) : 0
  const sh = augment ? uni(-0.3, 0.3) : 0
  const sx = augment ? uni(0.8, 1.15) : 1
  const sy = augment ? sx * uni(0.85, 1.15) : 1
  const el = augment ? uni(0, 0.9) : 0
  const f1 = uni(0.1, 0.3)
  const f2 = uni(0.1, 0.3)
  const ph1 = uni(0, 6.28)
  const ph2 = uni(0, 6.28)
  const thr = augment ? uni(0.3, 0.6) : 0.45
  const c = Math.cos(th)
  const s = Math.sin(th)
  // forward A = R · Shear · Scale; we need A⁻¹ for inverse mapping.
  const a = c * sx
  const b = (c * sh - s) * sy
  const cc = s * sx
  const d = (s * sh + c) * sy
  const det = a * d - b * cc
  const ia = d / det
  const ib = -b / det
  const ic = -cc / det
  const id = a / det
  const m = createBinary(W, W)
  for (let v = 0; v < W; v++) {
    for (let u = 0; u < W; u++) {
      let px = (u + 0.5) / 2 - 14
      let py = (v + 0.5) / 2 - 14
      px += el * Math.sin(f1 * py + ph1)
      py += el * Math.sin(f2 * px + ph2)
      const x = ia * px + ib * py + 14 - 0.5
      const y = ic * px + id * py + 14 - 0.5
      const x0 = Math.floor(x)
      const y0 = Math.floor(y)
      if (x0 < -1 || y0 < -1 || x0 > 27 || y0 > 27) continue
      const ax = x - x0
      const ay = y - y0
      const inX0 = x0 >= 0
      const inX1 = x0 < 27
      const r0 = y0 >= 0 ? off + y0 * 28 : -1
      const r1 = y0 < 27 ? off + (y0 + 1) * 28 : -1
      const g00 = r0 >= 0 && inX0 ? img[r0 + x0] : 0
      const g10 = r0 >= 0 && inX1 ? img[r0 + x0 + 1] : 0
      const g01 = r1 >= 0 && inX0 ? img[r1 + x0] : 0
      const g11 = r1 >= 0 && inX1 ? img[r1 + x0 + 1] : 0
      const val = (g00 * (1 - ax) + g10 * ax) * (1 - ay) + (g01 * (1 - ax) + g11 * ax) * ay
      if (val > thr * 255) m.data[v * W + u] = 1
    }
  }
  if (!augment) return m
  let top = -1
  let bottom = -1
  for (let y = 0; y < W && top < 0; y++) for (let x = 0; x < W; x++) if (m.data[y * W + x]) top = y
  for (let y = W - 1; y >= 0 && bottom < 0; y--)
    for (let x = 0; x < W; x++) if (m.data[y * W + x]) bottom = y
  const h = bottom - top
  if (label === 1 && h > 8 && rng.nextFloat() < 0.6) {
    // European "1": a flag from the top going down-left.
    let tx = 0
    let n = 0
    for (let x = 0; x < W; x++)
      if (m.data[top * W + x]) {
        tx += x
        n++
      }
    tx /= n
    // French hands draw a long lead-in stroke, sometimes reaching mid-height.
    strokeLine(m, tx, top, tx - uni(0.2, 0.6) * h, top + uni(0.12, 0.5) * h, uni(1, 2))
    if (rng.nextFloat() < 0.15) {
      const bx = tx + uni(-0.1, 0.1) * h
      strokeLine(m, bx - 0.25 * h, bottom, bx + 0.25 * h, bottom, uni(1, 2))
    }
  }
  if (label === 7 && h > 8 && rng.nextFloat() < 0.4) {
    // Crossed "7": a short bar through the stem at mid-height.
    const y = Math.round(top + uni(0.45, 0.6) * h)
    let sx0 = -1
    for (let x = 0; x < W; x++)
      if (m.data[y * W + x]) {
        sx0 = x
        break
      }
    if (sx0 >= 0) strokeLine(m, sx0 - uni(0.15, 0.3) * h, y, sx0 + uni(0.15, 0.3) * h, y, uni(1, 2))
  }
  if (rng.nextFloat() < 0.12) {
    // A small break in the stroke (pen skip, binarisation gap).
    const ink: number[] = []
    for (let i = 0; i < W * W; i++) if (m.data[i]) ink.push(i)
    if (ink.length > 0) {
      const p = ink[rng.nextInt(ink.length)]
      const r = uni(1, 2.2)
      for (let y = -3; y <= 3; y++)
        for (let x = -3; x <= 3; x++) {
          const q = p + y * W + x
          if (x * x + y * y <= r * r && q >= 0 && q < W * W) m.data[q] = 0
        }
    }
  }
  return m
}

/** Procedural "☹": wobbly ellipse, two eyes, a frown. */
function drawFace(): BinaryImage {
  const m = createBinary(W, W)
  const cx = 28 + uni(-2, 2)
  const cy = 28 + uni(-2, 2)
  const rx = uni(14, 21)
  const ry = rx * uni(0.85, 1.15)
  const rot = uni(-0.3, 0.3)
  const pen = uni(1, 2)
  const P = (x: number, y: number): [number, number] => [
    cx + x * Math.cos(rot) - y * Math.sin(rot),
    cy + x * Math.sin(rot) + y * Math.cos(rot),
  ]
  const n = 36
  const gap = rng.nextFloat() < 0.3 ? uni(0, 0.15) : 0
  const start = uni(0, 6.28)
  const wob1 = uni(0, 0.06)
  const wph = uni(0, 6.28)
  const outline: [number, number][] = []
  for (let k = 0; k <= n * (1 - gap); k++) {
    const t = start + (k / n) * 2 * Math.PI
    const rr = 1 + wob1 * Math.sin(3 * t + wph)
    outline.push(P(rx * rr * Math.cos(t), ry * rr * Math.sin(t)))
  }
  polyline(m, outline, pen)
  const ex = rx * uni(0.28, 0.45)
  const ey = -ry * uni(0.2, 0.4)
  for (const sgn of [-1, 1]) {
    const [x, y] = P(sgn * ex + uni(-1, 1), ey + uni(-1, 1))
    if (rng.nextFloat() < 0.6) fillDisk(m, x, y, uni(1.3, 2.6))
    else {
      const [x2, y2] = P(sgn * ex + uni(-1, 1), ey + uni(2, 4))
      strokeLine(m, x, y, x2, y2, pen)
    }
  }
  const mw = rx * uni(0.35, 0.6)
  const base = ry * uni(0.35, 0.55)
  const curve = ry * uni(0.1, 0.28)
  const mouth: [number, number][] = []
  for (let k = 0; k <= 12; k++) {
    const x = -mw + (2 * mw * k) / 12
    mouth.push(P(x, base - curve * (1 - (x / mw) ** 2)))
  }
  polyline(m, mouth, pen)
  return m
}

/** Applies a random small affine jitter to polyline points around the canvas centre. */
function jitterPts(pts: [number, number][][]): [number, number][][] {
  const th = uni(-0.2, 0.2)
  const sh = uni(-0.25, 0.25)
  const sc = uni(0.85, 1.15)
  const c = Math.cos(th)
  const s = Math.sin(th)
  return pts.map((poly) =>
    poly.map(([x, y]) => {
      const u = (x - 28 + sh * (y - 28)) * sc
      const v = (y - 28) * sc
      return [28 + u * c - v * s + uni(-0.6, 0.6), 28 + u * s + v * c + uni(-0.6, 0.6)]
    }),
  )
}

/** Procedural continental "1": a long lead-in stroke into the top of a (slightly slanted) stem. */
function drawEuroOne(): BinaryImage {
  const m = createBinary(W, W)
  const h = uni(30, 44)
  const top = 28 - h / 2
  const x = 28 + uni(-3, 3)
  const slant = uni(-5, 3)
  const strokes: [number, number][][] = [
    [
      [x - uni(0.2, 0.6) * h, top + uni(0.12, 0.5) * h],
      [x, top],
      [x + slant, top + h],
    ],
  ]
  if (rng.nextFloat() < 0.2)
    strokes.push([
      [x + slant - 0.25 * h, top + h],
      [x + slant + 0.25 * h, top + h],
    ])
  for (const poly of jitterPts(strokes)) polyline(m, poly, uni(1, 2))
  return m
}

/**
 * Procedural "4" in the styles MNIST lacks: one-stroke closed with a short stem (and often a loop),
 * open-top square, or curved like "ч".
 */
function drawOpenFour(): BinaryImage {
  const m = createBinary(W, W)
  const h = uni(30, 44)
  const top = 28 - h / 2
  const xs = 28 + uni(2, 8)
  const xl = xs - uni(0.35, 0.6) * h
  const mid = top + uni(0.45, 0.65) * h
  const style = rng.nextFloat()
  if (style < 0.4) {
    // One-stroke closed "4": a long diagonal, the bar, then a short stem starting near the bar
    // (it often leaves a small loop where the pen turns).
    const bar = top + uni(0.5, 0.85) * h
    const stemTop = bar - uni(0.05, 0.3) * h
    const strokes: [number, number][][] = [
      [
        [xs + uni(-3, 2), top],
        [xl, bar],
        [xs + uni(2, 7), bar + uni(-3, 1)],
      ],
      [
        [xs + uni(-1, 2), stemTop],
        [xs + uni(-3, 2), top + h],
      ],
    ]
    if (rng.nextFloat() < 0.7) {
      // The loop: back from the bar's end up to the stem's top.
      const end = strokes[0][2]
      strokes.push([end, [end[0] + uni(0, 3), (end[1] + stemTop) / 2], [xs, stemTop]])
    }
    for (const poly of jitterPts(strokes)) polyline(m, poly, uni(1, 2))
    return m
  }
  const arm: [number, number][] = [[xl + uni(-2, 2), top + uni(0, 0.12) * h]]
  if (style < 0.7) {
    // Square: down, then across through the stem.
    arm.push([xl + uni(-2, 2), mid], [xs + uni(0, 5), mid + uni(-2, 2)])
  } else {
    // Curved "ч": down, then a quarter turn into the stem.
    const rad = Math.min(0.6 * (xs - xl), 0.3 * h)
    for (let k = 0; k <= 8; k++) {
      const a = Math.PI - (Math.PI / 2) * (k / 8) // 180° → 90° (y downwards: left → bottom)
      arm.push([xl + rad + rad * Math.cos(a), mid - rad + rad * Math.sin(a)])
    }
    arm.push([xs, mid])
  }
  const strokes: [number, number][][] = [
    arm,
    [
      [xs, top + uni(-0.05, 0.2) * h],
      [xs + uni(-2, 2), top + h],
    ],
  ]
  for (const poly of jitterPts(strokes)) polyline(m, poly, uni(1, 2))
  return m
}

function cropToInk(m: BinaryImage): BinaryImage {
  let x0 = m.width
  let y0 = m.height
  let x1 = -1
  let y1 = -1
  for (let y = 0; y < m.height; y++)
    for (let x = 0; x < m.width; x++)
      if (m.data[y * m.width + x]) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  if (x1 < 0) return createBinary(1, 1)
  const out = createBinary(x1 - x0 + 1, y1 - y0 + 1)
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) out.data[(y - y0) * out.width + x - x0] = m.data[y * m.width + x]
  return out
}

/** Sample codes in the training order: ≥ 0 MNIST index, then procedural extras. */
const FACE_CODE = -1
const EURO_ONE_CODE = -2
const OPEN_FOUR_CODE = -3

function labelOf(code: number): number {
  if (code === FACE_CODE) return SAD_CLASS
  if (code === EURO_ONE_CODE) return 1
  if (code === OPEN_FOUR_CODE) return 4
  return trainLbl.data[code]
}

function sample(label: number, idx: number, set: 'train' | 'test', augment: boolean) {
  const mask =
    idx === EURO_ONE_CODE
      ? drawEuroOne()
      : idx === OPEN_FOUR_CODE
        ? drawOpenFour()
        : label === SAD_CLASS
          ? drawFace()
          : augmentDigit(set === 'train' ? trainImg.data : testImg.data, idx * 784, label, augment)
  return normalizeGlyph(cropToInk(mask)) ?? new Float32Array(GLYPH_SIZE * GLYPH_SIZE)
}

if (values.preview) {
  // Visual check of the procedural samples: `--preview` prints a few as ASCII art and exits.
  for (const code of [EURO_ONE_CODE, OPEN_FOUR_CODE, FACE_CODE]) {
    for (let k = 0; k < 3; k++) {
      const x = sample(labelOf(code), code, 'train', true)
      let art = ''
      for (let yy = 0; yy < GLYPH_SIZE; yy += 2) {
        for (let xx = 0; xx < GLYPH_SIZE; xx++) art += x[yy * GLYPH_SIZE + xx] > 0.4 ? '#' : '.'
        art += '\n'
      }
      log(`code ${code}:\n${art}`)
    }
  }
  process.exit(0)
}

// --- Network (training) ---------------------------------------------------------------------------
function initWeights(): CnnWeights {
  const sizes = tensorSizes(shape)
  const fanIn = [K * K, 0, shape.c1 * K * K, 0, 16 * shape.c2, 0, shape.hidden, 0]
  const tensors = sizes.map((n, k) => {
    const t = new Float32Array(n)
    if (fanIn[k] > 0) {
      const sd = Math.sqrt(2 / fanIn[k])
      for (let i = 0; i < n; i++) {
        // Box–Muller
        const u = Math.max(1e-12, rng.nextFloat())
        const v = rng.nextFloat()
        t[i] = sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
      }
    } else if (k === 1 || k === 3 || k === 5) t.fill(0.01)
    return t
  })
  return weightsFromTensors(shape, tensors)
}

const S = GLYPH_SIZE
const o1 = S - K + 1
const q1 = o1 >> 1
const o2 = q1 - K + 1
const q2 = o2 >> 1
const flat = shape.c2 * q2 * q2
const a1 = new Float32Array(shape.c1 * o1 * o1)
const p1 = new Float32Array(shape.c1 * q1 * q1)
const i1 = new Int32Array(p1.length)
const a2 = new Float32Array(shape.c2 * o2 * o2)
const p2 = new Float32Array(flat)
const i2 = new Int32Array(flat)
const hid = new Float32Array(shape.hidden)
const probs = new Float32Array(shape.classes)
const dh = new Float32Array(shape.hidden)
const dp2 = new Float32Array(flat)
const dp1 = new Float32Array(p1.length)

function poolArg(src: Float32Array, dst: Float32Array, arg: Int32Array, ch: number, size: number) {
  const half = size >> 1
  for (let c = 0; c < ch; c++)
    for (let y = 0; y < half; y++)
      for (let x = 0; x < half; x++) {
        let i = (c * size + 2 * y) * size + 2 * x
        let best = i
        if (src[i + 1] > src[best]) best = i + 1
        if (src[i + size] > src[best]) best = i + size
        if (src[i + size + 1] > src[best]) best = i + size + 1
        i = (c * half + y) * half + x
        dst[i] = src[best]
        arg[i] = best
      }
}

function trainForward(w: CnnWeights, x: Float32Array): void {
  for (let f = 0; f < w.c1; f++)
    for (let y = 0; y < o1; y++)
      for (let xx = 0; xx < o1; xx++) {
        let s = w.c1b[f]
        for (let ky = 0; ky < K; ky++) {
          const row = (y + ky) * S + xx
          const wr = f * 25 + ky * K
          for (let kx = 0; kx < K; kx++) s += x[row + kx] * w.c1w[wr + kx]
        }
        a1[(f * o1 + y) * o1 + xx] = s > 0 ? s : 0
      }
  poolArg(a1, p1, i1, w.c1, o1)
  for (let f = 0; f < w.c2; f++)
    for (let y = 0; y < o2; y++)
      for (let xx = 0; xx < o2; xx++) {
        let s = w.c2b[f]
        for (let c = 0; c < w.c1; c++) {
          const wb = (f * w.c1 + c) * 25
          for (let ky = 0; ky < K; ky++) {
            const row = (c * q1 + y + ky) * q1 + xx
            const wr = wb + ky * K
            for (let kx = 0; kx < K; kx++) s += p1[row + kx] * w.c2w[wr + kx]
          }
        }
        a2[(f * o2 + y) * o2 + xx] = s > 0 ? s : 0
      }
  poolArg(a2, p2, i2, w.c2, o2)
  for (let j = 0; j < w.hidden; j++) {
    let s = w.f1b[j]
    for (let i = 0; i < flat; i++) s += p2[i] * w.f1w[j * flat + i]
    hid[j] = s > 0 ? s : 0
  }
  let max = -Infinity
  for (let k = 0; k < w.classes; k++) {
    let s = w.f2b[k]
    for (let j = 0; j < w.hidden; j++) s += hid[j] * w.f2w[k * w.hidden + j]
    probs[k] = s
    if (s > max) max = s
  }
  let z = 0
  for (let k = 0; k < w.classes; k++) {
    probs[k] = Math.exp(probs[k] - max)
    z += probs[k]
  }
  for (let k = 0; k < w.classes; k++) probs[k] /= z
}

/** Accumulates the gradient of the cross-entropy for one sample into `g`. */
function backward(w: CnnWeights, g: CnnWeights, x: Float32Array, label: number): number {
  trainForward(w, x)
  const loss = -Math.log(Math.max(1e-12, probs[label]))
  dh.fill(0)
  for (let k = 0; k < w.classes; k++) {
    const d = probs[k] - (k === label ? 1 : 0)
    g.f2b[k] += d
    for (let j = 0; j < w.hidden; j++) {
      g.f2w[k * w.hidden + j] += d * hid[j]
      dh[j] += d * w.f2w[k * w.hidden + j]
    }
  }
  dp2.fill(0)
  for (let j = 0; j < w.hidden; j++) {
    if (hid[j] <= 0) continue
    const d = dh[j]
    g.f1b[j] += d
    const base = j * flat
    for (let i = 0; i < flat; i++) {
      g.f1w[base + i] += d * p2[i]
      dp2[i] += d * w.f1w[base + i]
    }
  }
  dp1.fill(0)
  for (let i = 0; i < flat; i++) {
    const pos = i2[i]
    if (a2[pos] <= 0 || dp2[i] === 0) continue
    const d = dp2[i]
    const f = (pos / (o2 * o2)) | 0
    const rem = pos - f * o2 * o2
    const y = (rem / o2) | 0
    const xx = rem - y * o2
    g.c2b[f] += d
    for (let c = 0; c < w.c1; c++) {
      const wb = (f * w.c1 + c) * 25
      for (let ky = 0; ky < K; ky++) {
        const row = (c * q1 + y + ky) * q1 + xx
        const wr = wb + ky * K
        for (let kx = 0; kx < K; kx++) {
          g.c2w[wr + kx] += d * p1[row + kx]
          dp1[row + kx] += d * w.c2w[wr + kx]
        }
      }
    }
  }
  for (let i = 0; i < p1.length; i++) {
    const pos = i1[i]
    if (a1[pos] <= 0 || dp1[i] === 0) continue
    const d = dp1[i]
    const f = (pos / (o1 * o1)) | 0
    const rem = pos - f * o1 * o1
    const y = (rem / o1) | 0
    const xx = rem - y * o1
    g.c1b[f] += d
    for (let ky = 0; ky < K; ky++) {
      const row = (y + ky) * S + xx
      const wr = f * 25 + ky * K
      for (let kx = 0; kx < K; kx++) g.c1w[wr + kx] += d * x[row + kx]
    }
  }
  return loss
}

// --- Training loop (Adam) -------------------------------------------------------------------------
// `--init <model-weights.ts>` fine-tunes an exported model instead of starting from scratch.
const w = values.init ? await loadWeights(values.init) : initWeights()

async function loadWeights(file: string): Promise<CnnWeights> {
  const mod = (await import(resolve(file))) as {
    MODEL_SHAPE: CnnShape
    MODEL_SCALES: number[]
    MODEL_DATA: string
  }
  for (const k of ['c1', 'c2', 'hidden', 'classes'] as const) {
    if (mod.MODEL_SHAPE[k] !== shape[k]) throw new Error(`--init shape differs on ${k}`)
  }
  return dequantize(shape, mod.MODEL_SCALES, base64Decode(mod.MODEL_DATA))
}
const grad = weightsFromTensors(
  shape,
  tensorSizes(shape).map((n) => new Float32Array(n)),
)
const mom = tensorSizes(shape).map((n) => new Float32Array(n))
const vel = tensorSizes(shape).map((n) => new Float32Array(n))
const wt = tensorsOf(w)
const gt = tensorsOf(grad)
let step = 0
const batch = 32
const baseLr = Number(values.lr)

const order: number[] = []
for (let i = 0; i < nTrain; i++) order.push(i)
const faces = Math.round(nTrain / 10)
for (let i = 0; i < faces; i++) order.push(FACE_CODE)
// Continental handwriting styles that MNIST (American) under-represents.
const extras = values.extras ? Math.round(nTrain / 40) : 0
for (let i = 0; i < extras; i++) order.push(EURO_ONE_CODE, OPEN_FOUR_CODE)

for (let epoch = 0; epoch < epochs; epoch++) {
  for (let i = order.length - 1; i > 0; i--) {
    const j = rng.nextInt(i + 1)
    const t = order[i]
    order[i] = order[j]
    order[j] = t
  }
  const lr = baseLr * (epoch < 3 ? 1 : 0.6 ** (epoch - 2))
  const t0 = performance.now()
  let lossSum = 0
  for (let b = 0; b < order.length; b += batch) {
    for (const t of gt) t.fill(0)
    const end = Math.min(order.length, b + batch)
    for (let k = b; k < end; k++) {
      const idx = order[k]
      const label = labelOf(idx)
      lossSum += backward(w, grad, sample(label, idx, 'train', true), label)
    }
    step++
    const n = end - b
    const c1 = 1 - 0.9 ** step
    const c2 = 1 - 0.999 ** step
    for (let t = 0; t < wt.length; t++) {
      const W_ = wt[t]
      const G = gt[t]
      const M = mom[t]
      const V = vel[t]
      for (let i = 0; i < W_.length; i++) {
        const gi = G[i] / n
        M[i] = 0.9 * M[i] + 0.1 * gi
        V[i] = 0.999 * V[i] + 0.001 * gi * gi
        W_[i] -= (lr * (M[i] / c1)) / (Math.sqrt(V[i] / c2) + 1e-8)
      }
    }
  }
  const acc = evaluate(w, 2000)
  log(
    `epoch ${epoch + 1}/${epochs}  lr ${lr.toExponential(2)}  loss ${(lossSum / order.length).toFixed(4)}  ` +
      `test(2k) ${(100 * acc.digits).toFixed(2)} %  ☹ ${(100 * acc.sad).toFixed(1)} %  ${((performance.now() - t0) / 1000).toFixed(0)} s`,
  )
}

function evaluate(model: CnnWeights, limit = testImg.dims[0], infer = false) {
  let ok = 0
  let n = 0
  for (let i = 0; i < Math.min(limit, testImg.dims[0]); i++) {
    const label = testLbl.data[i]
    const x = sample(label, i, 'test', false)
    let p: Float32Array
    if (infer) p = forward(model, x)
    else {
      trainForward(model, x)
      p = probs
    }
    let best = 0
    for (let k = 1; k < 10; k++) if (p[k] > p[best]) best = k
    if (p[SAD_CLASS] > p[best]) best = SAD_CLASS
    if (best === label) ok++
    n++
  }
  let sadOk = 0
  const nSad = 500
  for (let i = 0; i < nSad; i++) {
    const x = sample(SAD_CLASS, 0, 'test', true)
    let p: Float32Array
    if (infer) p = forward(model, x)
    else {
      trainForward(model, x)
      p = probs
    }
    let best = 0
    for (let k = 1; k < model.classes; k++) if (p[k] > p[best]) best = k
    if (best === SAD_CLASS) sadOk++
  }
  return { digits: ok / n, sad: sadOk / nSad }
}

// --- Export ---------------------------------------------------------------------------------------
const { scales, bytes } = quantize(wt)
const q = dequantize(shape, scales, bytes)
const final = evaluate(q, testImg.dims[0], true)
const b64 = base64Encode(bytes)
const lines: string[] = []
for (let i = 0; i < b64.length; i += 96) lines.push(`  '${b64.slice(i, i + 96)}',`)
const file = `/**
 * Glyph classifier weights — generated by \`apps/bench/src/ocr-train.ts\`, do not edit.
 *
 *   node apps/bench/src/ocr-train.ts --data .cache/mnist --seed ${seed} --epochs ${epochs} --c1 ${shape.c1} --c2 ${shape.c2} --hidden ${shape.hidden}${values.extras ? ' --extras' : ''}
 *
 * Trained on MNIST (Y. LeCun, C. Cortes, C. Burges; CC BY-SA 3.0) through the app's own glyph
 * normalisation, plus procedurally drawn "☹"${values.extras ? ', continental "1"s and open "4"s' : ''}.
 * int8, one scale per tensor (${bytes.length} parameters).
 * Quantised model on the 10 000 MNIST test digits: ${(100 * final.digits).toFixed(2)} %; synthetic ☹: ${(100 * final.sad).toFixed(1)} %.
 */
export const MODEL_SHAPE = ${JSON.stringify(shape).replace(/"/g, '').replace(/:/g, ': ').replace(/,/g, ', ').replace('{', '{ ').replace('}', ' }')}

export const MODEL_SCALES = [${scales.map((s) => s.toPrecision(8)).join(', ')}]

export const MODEL_DATA = [
${lines.join('\n')}
].join('')
`
writeFileSync(values.out, file)
log(
  `quantised: MNIST test ${(100 * final.digits).toFixed(2)} %, ☹ ${(100 * final.sad).toFixed(1)} % → ${values.out}`,
)
