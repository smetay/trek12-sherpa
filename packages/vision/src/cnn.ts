import { GLYPH_SIZE } from './glyph.ts'

/**
 * A small convolutional network for handwritten glyphs (inference only; training lives in
 * `apps/bench/src/ocr-train.ts`):
 *
 *   28×28 → conv 5×5 (C1) → ReLU → max-pool 2 → conv 5×5 (C2) → ReLU → max-pool 2
 *         → dense (4·4·C2 → H) → ReLU → dense (H → classes) → softmax
 *
 * Classes 0–9 are digits, class 10 is the "☹" mark drawn in an over-limit circle.
 */
export type CnnShape = { c1: number; c2: number; hidden: number; classes: number }

export type CnnWeights = CnnShape & {
  c1w: Float32Array // [c1][5][5]
  c1b: Float32Array
  c2w: Float32Array // [c2][c1][5][5]
  c2b: Float32Array
  f1w: Float32Array // [hidden][4·4·c2]
  f1b: Float32Array
  f2w: Float32Array // [classes][hidden]
  f2b: Float32Array
}

export const K = 5
export const SAD_CLASS = 10

/** Parameter tensors in serialisation order with their lengths. */
export function tensorSizes(s: CnnShape): number[] {
  const flat = 16 * s.c2
  return [
    s.c1 * K * K,
    s.c1,
    s.c2 * s.c1 * K * K,
    s.c2,
    s.hidden * flat,
    s.hidden,
    s.classes * s.hidden,
    s.classes,
  ]
}

export function weightsFromTensors(shape: CnnShape, t: Float32Array[]): CnnWeights {
  return {
    ...shape,
    c1w: t[0],
    c1b: t[1],
    c2w: t[2],
    c2b: t[3],
    f1w: t[4],
    f1b: t[5],
    f2w: t[6],
    f2b: t[7],
  }
}

export function tensorsOf(w: CnnWeights): Float32Array[] {
  return [w.c1w, w.c1b, w.c2w, w.c2b, w.f1w, w.f1b, w.f2w, w.f2b]
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function base64Decode(text: string): Uint8Array {
  const lookup = new Int16Array(128).fill(-1)
  for (let i = 0; i < B64.length; i++) lookup[B64.charCodeAt(i)] = i
  const clean = text.replace(/[^A-Za-z0-9+/]/g, '')
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let o = 0
  for (let i = 0; i + 1 < clean.length; i += 4) {
    const a = lookup[clean.charCodeAt(i)]
    const b = lookup[clean.charCodeAt(i + 1)]
    const c = i + 2 < clean.length ? lookup[clean.charCodeAt(i + 2)] : 0
    const d = i + 3 < clean.length ? lookup[clean.charCodeAt(i + 3)] : 0
    const n = (a << 18) | (b << 12) | (c << 6) | d
    if (o < out.length) out[o++] = (n >> 16) & 255
    if (i + 2 < clean.length && o < out.length) out[o++] = (n >> 8) & 255
    if (i + 3 < clean.length && o < out.length) out[o++] = n & 255
  }
  return out
}

export function base64Encode(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0
    const n = (a << 16) | (b << 8) | c
    s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63]
    s += i + 1 < bytes.length ? B64[(n >> 6) & 63] : '='
    s += i + 2 < bytes.length ? B64[n & 63] : '='
  }
  return s
}

/** Symmetric int8 quantisation, one scale per tensor. */
export function quantize(tensors: Float32Array[]): { scales: number[]; bytes: Uint8Array } {
  const total = tensors.reduce((n, t) => n + t.length, 0)
  const bytes = new Uint8Array(total)
  const scales: number[] = []
  let o = 0
  for (const t of tensors) {
    let max = 0
    for (const v of t) max = Math.max(max, Math.abs(v))
    const scale = max > 0 ? max / 127 : 1
    scales.push(scale)
    for (const v of t) bytes[o++] = (Math.round(v / scale) + 256) & 255
  }
  return { scales, bytes }
}

export function dequantize(shape: CnnShape, scales: number[], bytes: Uint8Array): CnnWeights {
  const sizes = tensorSizes(shape)
  const tensors: Float32Array[] = []
  let o = 0
  sizes.forEach((n, k) => {
    const t = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      const b = bytes[o++]
      t[i] = (b > 127 ? b - 256 : b) * scales[k]
    }
    tensors.push(t)
  })
  return weightsFromTensors(shape, tensors)
}

/** Scratch buffers for one forward pass (reused; a worker runs one inference at a time). */
type Scratch = {
  a1: Float32Array
  p1: Float32Array
  a2: Float32Array
  p2: Float32Array
  h: Float32Array
}
let scratch: Scratch | null = null
let scratchFor: CnnWeights | null = null

/** Class probabilities (softmax) for one 28 × 28 input (ink = 1). */
export function forward(w: CnnWeights, input: Float32Array): Float32Array {
  const S = GLYPH_SIZE
  const o1 = S - K + 1 // 24
  const q1 = o1 >> 1 // 12
  const o2 = q1 - K + 1 // 8
  const q2 = o2 >> 1 // 4
  if (scratch === null || scratchFor !== w) {
    scratch = {
      a1: new Float32Array(w.c1 * o1 * o1),
      p1: new Float32Array(w.c1 * q1 * q1),
      a2: new Float32Array(w.c2 * o2 * o2),
      p2: new Float32Array(w.c2 * q2 * q2),
      h: new Float32Array(w.hidden),
    }
    scratchFor = w
  }
  const { a1, p1, a2, p2, h } = scratch
  // conv1 + ReLU
  for (let f = 0; f < w.c1; f++) {
    for (let y = 0; y < o1; y++) {
      for (let x = 0; x < o1; x++) {
        let s = w.c1b[f]
        for (let ky = 0; ky < K; ky++) {
          const row = (y + ky) * S + x
          const wr = f * 25 + ky * K
          for (let kx = 0; kx < K; kx++) s += input[row + kx] * w.c1w[wr + kx]
        }
        a1[(f * o1 + y) * o1 + x] = s > 0 ? s : 0
      }
    }
  }
  maxPool(a1, p1, w.c1, o1)
  // conv2 + ReLU
  for (let f = 0; f < w.c2; f++) {
    for (let y = 0; y < o2; y++) {
      for (let x = 0; x < o2; x++) {
        let s = w.c2b[f]
        for (let c = 0; c < w.c1; c++) {
          const wb = (f * w.c1 + c) * 25
          for (let ky = 0; ky < K; ky++) {
            const row = (c * q1 + y + ky) * q1 + x
            const wr = wb + ky * K
            for (let kx = 0; kx < K; kx++) s += p1[row + kx] * w.c2w[wr + kx]
          }
        }
        a2[(f * o2 + y) * o2 + x] = s > 0 ? s : 0
      }
    }
  }
  maxPool(a2, p2, w.c2, o2)
  const flat = p2.length
  for (let j = 0; j < w.hidden; j++) {
    let s = w.f1b[j]
    const base = j * flat
    for (let i = 0; i < flat; i++) s += p2[i] * w.f1w[base + i]
    h[j] = s > 0 ? s : 0
  }
  const out = new Float32Array(w.classes)
  let max = -Infinity
  for (let k = 0; k < w.classes; k++) {
    let s = w.f2b[k]
    const base = k * w.hidden
    for (let j = 0; j < w.hidden; j++) s += h[j] * w.f2w[base + j]
    out[k] = s
    if (s > max) max = s
  }
  let z = 0
  for (let k = 0; k < w.classes; k++) {
    out[k] = Math.exp(out[k] - max)
    z += out[k]
  }
  for (let k = 0; k < w.classes; k++) out[k] /= z
  return out
}

/** 2 × 2 max-pooling of `channels` maps of side `size` (even). */
export function maxPool(
  src: Float32Array,
  dst: Float32Array,
  channels: number,
  size: number,
): void {
  const half = size >> 1
  for (let c = 0; c < channels; c++) {
    for (let y = 0; y < half; y++) {
      for (let x = 0; x < half; x++) {
        const i = (c * size + 2 * y) * size + 2 * x
        let m = src[i]
        if (src[i + 1] > m) m = src[i + 1]
        if (src[i + size] > m) m = src[i + size]
        if (src[i + size + 1] > m) m = src[i + size + 1]
        dst[(c * half + y) * half + x] = m
      }
    }
  }
}
