/** Small, fast, seedable PRNG (splitmix32) and a hash mixer for counter-based randomness. */

function imul(a: number, b: number): number {
  return Math.imul(a, b)
}

/** Mixes up to three 32-bit inputs into one well-distributed uint32. */
export function mix32(a: number, b = 0, c = 0): number {
  let h = (a ^ 0x9e3779b9) >>> 0
  h = imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0
  h = (h ^ b) >>> 0
  h = imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0
  h = (h ^ c) >>> 0
  h = imul(h ^ (h >>> 16), 0x27d4eb2f) >>> 0
  return (h ^ (h >>> 15)) >>> 0
}

export class Rng {
  private state: number

  constructor(seed: number) {
    this.state = seed >>> 0
  }

  /** Next uint32. */
  next(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0
    let z = this.state
    z = imul(z ^ (z >>> 16), 0x21f0aaad) >>> 0
    z = imul(z ^ (z >>> 15), 0x735a2d97) >>> 0
    return (z ^ (z >>> 15)) >>> 0
  }

  /** Uniform integer in [0, n). */
  nextInt(n: number): number {
    return Math.floor((this.next() / 4294967296) * n)
  }

  /** Uniform float in [0, 1). */
  nextFloat(): number {
    return this.next() / 4294967296
  }
}
