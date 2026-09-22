import { type CompiledMap, coreOf, isGameOver, mix32, ROLL_COUNT, type State } from '@trek12/engine'
import { advise, heuristicPolicy, type RankedMove, type SolverPool } from '@trek12/solver'
import { useEffect, useRef, useState } from 'react'
import { createSolverPool, defaultPoolSize } from './solverPool.ts'

let pool: SolverPool | null = null
let poolKey = ''

function getPool(map: CompiledMap, workers: number): SolverPool {
  const size = workers > 0 ? workers : defaultPoolSize()
  const key = `${map.def.id}@${map.def.rev}:${map.rules.linkRule}:${size}`
  if (pool && poolKey === key) return pool
  pool?.terminate()
  pool = createSolverPool(size)
  pool.init(map.def.id, map.rules)
  poolKey = key
  return pool
}

export type AdviceState = {
  ranking: RankedMove[]
  running: boolean
  rounds: number
  exact: boolean
  elapsedMs: number
  error?: string
}

const IDLE: AdviceState = { ranking: [], running: false, rounds: 0, exact: false, elapsedMs: 0 }

/**
 * Runs the advisor whenever the position or the dice change; anytime results stream in after every
 * round. A superseded computation is cancelled (its workers are replaced) so it stops burning CPU.
 */
export function useAdvice(
  map: CompiledMap | undefined,
  state: State | undefined,
  historyLength: number,
  y: number | null,
  r: number | null,
  thinkMs: number,
  workers: number,
  nonce: number,
): AdviceState {
  const [advice, setAdvice] = useState<AdviceState>(IDLE)
  const generation = useRef(0)

  useEffect(() => {
    if (!map || !state || y === null || r === null || isGameOver(map, state)) {
      setAdvice(IDLE)
      return
    }
    const gen = ++generation.current
    const p = getPool(map, workers)
    const seed = mix32(historyLength * 36 + y * 6 + r, nonce, 0x5e7)
    setAdvice({ ...IDLE, running: true })
    advise(p, map, state, y, r, heuristicPolicy, {
      seed,
      timeBudgetMs: thinkMs,
      maxRollouts: 8192,
      now: () => performance.now(),
      shouldStop: () => generation.current !== gen,
      onProgress: (ranking, rounds) => {
        if (generation.current === gen)
          setAdvice({ ranking, running: true, rounds, exact: false, elapsedMs: 0 })
      },
    })
      .then((result) => {
        if (generation.current !== gen) return
        setAdvice({
          ranking: result.ranking,
          running: false,
          rounds: result.rounds,
          exact: result.exact,
          elapsedMs: result.elapsedMs,
        })
      })
      .catch((error: unknown) => {
        if (generation.current === gen) setAdvice({ ...IDLE, error: String(error) })
      })
    return () => {
      if (generation.current === gen) {
        generation.current++
        p.cancelAll()
      }
    }
  }, [map, state, historyLength, y, r, thinkMs, workers, nonce])

  return advice
}

export type Estimate = { mean: number; pSummit: number } | null

/**
 * Expected final score of the current position before the dice are rolled: heuristic rollouts from
 * the position itself (first roll stratified over the 36 outcomes). Same scale as the advice means.
 */
export function useEstimate(
  map: CompiledMap | undefined,
  state: State | undefined,
  historyLength: number,
  workers: number,
): Estimate {
  const [estimate, setEstimate] = useState<Estimate>(null)
  useEffect(() => {
    if (!map || !state || isGameOver(map, state)) {
      setEstimate(null)
      return
    }
    let cancelled = false
    const p = getPool(map, workers)
    const seed = mix32(historyLength, 0x0e57, map.n)
    p.rollouts(coreOf(map, state), seed, 0, 360, heuristicPolicy.name)
      .then((scores) => {
        if (cancelled) return
        let sum = 0
        let above = 0
        const summit36 = map.def.summit * ROLL_COUNT
        for (const v of scores) {
          sum += v
          if (v >= summit36) above++
        }
        setEstimate({ mean: sum / (scores.length * ROLL_COUNT), pSummit: above / scores.length })
      })
      .catch(() => {
        if (!cancelled) setEstimate(null)
      })
    return () => {
      cancelled = true
    }
  }, [map, state, historyLength, workers])
  return estimate
}
