import { base64Decode, type CnnWeights, dequantize, forward, SAD_CLASS } from './cnn.ts'
import { normalizeGlyph } from './glyph.ts'
import type { BinaryImage } from './image.ts'
import { MODEL_DATA, MODEL_SCALES, MODEL_SHAPE } from './model-weights.ts'

/** Value code of the "☹" mark (same as the engine's SAD). */
export const SAD_VALUE = 13

let model: CnnWeights | null = null

/** The bundled classifier, decoded on first use (~1 ms). */
export function glyphModel(): CnnWeights {
  if (model === null) model = dequantize(MODEL_SHAPE, MODEL_SCALES, base64Decode(MODEL_DATA))
  return model
}

/**
 * Raw class probabilities of one glyph mask: index 0–9 for the digits, 13 for "☹" (others 0).
 * Returns null when the mask has no ink.
 */
export function glyphProbabilities(mask: BinaryImage): Float32Array | null {
  const input = normalizeGlyph(mask)
  if (input === null) return null
  const p = forward(glyphModel(), input)
  const out = new Float32Array(SAD_VALUE + 1)
  for (let d = 0; d < 10; d++) out[d] = p[d]
  out[SAD_VALUE] = p[SAD_CLASS]
  return out
}

export type Reading = {
  /** Most likely allowed value, or null when nothing was read. */
  value: number | null
  /**
   * 0–1. The probability of `value` among the allowed values, lowered when the glyph does not look
   * like any allowed value at all (most of the network's belief went to a forbidden class).
   */
  confidence: number
  /** Allowed values by decreasing probability (renormalised over the allowed set). */
  alternatives: { value: number; p: number }[]
}

export const NO_READING: Reading = { value: null, confidence: 0, alternatives: [] }

/** Constrained decoding: keeps the allowed values only and renormalises. */
export function decode(probs: ArrayLike<number>, allowed: readonly number[]): Reading {
  let mass = 0
  for (const v of allowed) mass += probs[v] ?? 0
  if (mass <= 0) return NO_READING
  const alternatives = allowed
    .map((v) => ({ value: v, p: (probs[v] ?? 0) / mass }))
    .sort((a, b) => b.p - a.p)
  const best = alternatives[0]
  const plausibility = Math.min(1, mass / 0.5)
  return { value: best.value, confidence: best.p * plausibility, alternatives }
}

/** Reads one glyph restricted to `allowed` values (digits 0–9, or 13 for ☹). */
export function classifyGlyph(mask: BinaryImage, allowed: readonly number[]): Reading {
  const p = glyphProbabilities(mask)
  return p === null ? NO_READING : decode(p, allowed)
}
