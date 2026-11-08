import { createGray, type GrayImage, sampleBilinear } from './image.ts'

export type Point = { x: number; y: number }

/** Four corners in image pixels: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Point, Point, Point, Point]

/** Row-major 3 × 3 projective transform, h[8] normalised to 1 when possible. */
export type Homography = Float64Array

export function applyH(H: Homography, p: Point): Point {
  const w = H[6] * p.x + H[7] * p.y + H[8]
  return { x: (H[0] * p.x + H[1] * p.y + H[2]) / w, y: (H[3] * p.x + H[4] * p.y + H[5]) / w }
}

export function invertH(H: Homography): Homography {
  const [a, b, c, d, e, f, g, h, i] = H
  const A = e * i - f * h
  const B = -(d * i - f * g)
  const C = d * h - e * g
  const det = a * A + b * B + c * C
  if (Math.abs(det) < 1e-12) throw new Error('singular homography')
  const inv = new Float64Array([
    A,
    -(b * i - c * h),
    b * f - c * e,
    B,
    a * i - c * g,
    -(a * f - c * d),
    C,
    -(a * h - b * g),
    a * e - b * d,
  ])
  for (let k = 0; k < 9; k++) inv[k] /= det
  return inv
}

/** Translation + isotropic scale bringing the points to mean 0 and mean distance √2 (Hartley). */
function normaliser(points: Point[]): Float64Array {
  let mx = 0
  let my = 0
  for (const p of points) {
    mx += p.x
    my += p.y
  }
  mx /= points.length
  my /= points.length
  let d = 0
  for (const p of points) d += Math.hypot(p.x - mx, p.y - my)
  d /= points.length
  const s = d > 0 ? Math.SQRT2 / d : 1
  return new Float64Array([s, 0, -s * mx, 0, s, -s * my, 0, 0, 1])
}

function mul(A: Float64Array, B: Float64Array): Float64Array {
  const out = new Float64Array(9)
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      out[r * 3 + c] = A[r * 3] * B[c] + A[r * 3 + 1] * B[3 + c] + A[r * 3 + 2] * B[6 + c]
    }
  }
  return out
}

/** Solves the n × n system M x = v in place (Gaussian elimination with partial pivoting). */
function solve(M: Float64Array, v: Float64Array, n: number): Float64Array {
  for (let col = 0; col < n; col++) {
    let piv = col
    for (let r = col + 1; r < n; r++)
      if (Math.abs(M[r * n + col]) > Math.abs(M[piv * n + col])) piv = r
    if (Math.abs(M[piv * n + col]) < 1e-12) throw new Error('degenerate point configuration')
    if (piv !== col) {
      for (let c = 0; c < n; c++) {
        const t = M[col * n + c]
        M[col * n + c] = M[piv * n + c]
        M[piv * n + c] = t
      }
      const t = v[col]
      v[col] = v[piv]
      v[piv] = t
    }
    for (let r = col + 1; r < n; r++) {
      const f = M[r * n + col] / M[col * n + col]
      if (f === 0) continue
      for (let c = col; c < n; c++) M[r * n + c] -= f * M[col * n + c]
      v[r] -= f * v[col]
    }
  }
  const x = new Float64Array(n)
  for (let r = n - 1; r >= 0; r--) {
    let s = v[r]
    for (let c = r + 1; c < n; c++) s -= M[r * n + c] * x[c]
    x[r] = s / M[r * n + r]
  }
  return x
}

/**
 * Homography mapping `from[i]` onto `to[i]` (≥ 4 pairs, no three collinear). With more than four
 * pairs it is the least-squares solution (h33 = 1) on Hartley-normalised coordinates.
 */
export function homographyFrom(from: Point[], to: Point[]): Homography {
  if (from.length !== to.length || from.length < 4) throw new Error('need at least 4 point pairs')
  const Tf = normaliser(from)
  const Tt = normaliser(to)
  const nf = from.map((p) => applyH(Tf, p))
  const nt = to.map((p) => applyH(Tt, p))
  // Normal equations AᵀA h = Aᵀb for the 8 unknowns.
  const AtA = new Float64Array(64)
  const Atb = new Float64Array(8)
  const row = new Float64Array(8)
  const add = (b: number) => {
    for (let r = 0; r < 8; r++) {
      Atb[r] += row[r] * b
      for (let c = 0; c < 8; c++) AtA[r * 8 + c] += row[r] * row[c]
    }
  }
  for (let i = 0; i < nf.length; i++) {
    const { x, y } = nf[i]
    const { x: u, y: v } = nt[i]
    row.set([x, y, 1, 0, 0, 0, -u * x, -u * y])
    add(u)
    row.set([0, 0, 0, x, y, 1, -v * x, -v * y])
    add(v)
  }
  const h = solve(AtA, Atb, 8)
  const Hn = new Float64Array([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1])
  const H = mul(invertH(Tt), mul(Hn, Tf))
  const s = H[8]
  if (Math.abs(s) > 1e-12) for (let k = 0; k < 9; k++) H[k] /= s
  return H
}

/** Output size that keeps the quad's average edge lengths. */
export function quadSize(quad: Quad): { width: number; height: number } {
  const d = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
  return {
    width: Math.max(1, Math.round((d(quad[0], quad[1]) + d(quad[3], quad[2])) / 2)),
    height: Math.max(1, Math.round((d(quad[0], quad[3]) + d(quad[1], quad[2])) / 2)),
  }
}

/**
 * Rectifies the quad into a `width × height` image (bilinear). Also returns the homography from
 * rectified pixels back to the source image, to report positions in original coordinates.
 */
export function warpQuad(
  img: GrayImage,
  quad: Quad,
  width: number,
  height: number,
): { image: GrayImage; toSource: Homography } {
  const rect: Point[] = [
    { x: 0, y: 0 },
    { x: width - 1, y: 0 },
    { x: width - 1, y: height - 1 },
    { x: 0, y: height - 1 },
  ]
  const toSource = homographyFrom(rect, quad)
  const out = createGray(width, height, 255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const w = toSource[6] * x + toSource[7] * y + toSource[8]
      const sx = (toSource[0] * x + toSource[1] * y + toSource[2]) / w
      const sy = (toSource[3] * x + toSource[4] * y + toSource[5]) / w
      out.data[y * width + x] =
        sx < 0 || sy < 0 || sx > img.width - 1 || sy > img.height - 1
          ? 255
          : Math.round(sampleBilinear(img, sx, sy))
    }
  }
  return { image: out, toSource }
}
