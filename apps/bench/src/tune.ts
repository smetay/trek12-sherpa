import { type CompiledMap, Rng } from '@trek12/engine'
import {
  DEFAULT_WEIGHTS,
  type HeuristicWeights,
  makeHeuristicPolicy,
  simulateGame,
} from '@trek12/solver'

export type TuneOptions = {
  maps: CompiledMap[]
  games: number
  population: number
  elite: number
  generations: number
  seed: number
  log?: (line: string) => void
}

const KEYS: (keyof HeuristicWeights)[] = ['rescue', 'chainEnd', 'zone', 'ticks', 'danger', 'noise']
const INITIAL_SIGMA: HeuristicWeights = {
  rescue: 0.4,
  chainEnd: 0.4,
  zone: 0.3,
  ticks: 0.5,
  danger: 0.4,
  noise: 0.3,
}
const SIGMA_FLOOR = 0.03

/** Mean score of the greedy heuristic with `weights` over the same seeds on every map. */
export function evaluateWeights(
  maps: CompiledMap[],
  weights: HeuristicWeights,
  games: number,
  seedBase: number,
): number {
  const policy = makeHeuristicPolicy(weights, 'candidate')
  let total = 0
  for (const map of maps) {
    for (let g = 0; g < games; g++) total += simulateGame(map, policy, seedBase + g)
  }
  return total / (maps.length * games)
}

function gaussian(rng: Rng): number {
  // Box–Muller on two uniforms from the seeded generator.
  const u = Math.max(rng.nextFloat(), 1e-12)
  const v = rng.nextFloat()
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
}

/**
 * Cross-entropy method over the heuristic's feature weights: sample a population around the current
 * mean, keep the elite, move the mean/spread towards it. Every candidate of a generation plays the
 * same seeds (common random numbers), and seeds change between generations to avoid overfitting.
 */
export function tune(options: TuneOptions): { weights: HeuristicWeights; score: number } {
  const { maps, games, population, elite, generations, seed } = options
  const log = options.log ?? (() => {})
  const rng = new Rng(seed)
  const mean: HeuristicWeights = { ...DEFAULT_WEIGHTS }
  const sigma: HeuristicWeights = { ...INITIAL_SIGMA }
  let best = { weights: { ...DEFAULT_WEIGHTS }, score: -Infinity }

  for (let gen = 0; gen < generations; gen++) {
    const seedBase = seed * 1_000_003 + gen * 100_000
    const samples: { weights: HeuristicWeights; score: number }[] = []
    for (let i = 0; i < population; i++) {
      const w = { ...mean }
      if (i > 0) for (const k of KEYS) w[k] = Math.max(0, mean[k] + sigma[k] * gaussian(rng))
      samples.push({ weights: w, score: evaluateWeights(maps, w, games, seedBase) })
    }
    samples.sort((a, b) => b.score - a.score)
    const top = samples.slice(0, elite)
    if (top[0].score > best.score) best = { weights: { ...top[0].weights }, score: top[0].score }
    for (const k of KEYS) {
      const m = top.reduce((a, s) => a + s.weights[k], 0) / top.length
      const v = top.reduce((a, s) => a + (s.weights[k] - m) ** 2, 0) / top.length
      mean[k] = 0.3 * mean[k] + 0.7 * m
      sigma[k] = Math.max(SIGMA_FLOOR, 0.3 * sigma[k] + 0.7 * Math.sqrt(v))
    }
    log(
      `gen ${String(gen + 1).padStart(2)}: best ${top[0].score.toFixed(2)} elite-mean ${(top.reduce((a, s) => a + s.score, 0) / top.length).toFixed(2)} ` +
        `mean=[${KEYS.map((k) => mean[k].toFixed(2)).join(' ')}] sigma=[${KEYS.map((k) => sigma[k].toFixed(2)).join(' ')}]`,
    )
  }
  return { weights: mean, score: evaluateWeights(maps, mean, games, seed * 7_919) }
}
