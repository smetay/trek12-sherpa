import { type CompiledMap, compileMap, getMapDef, stateFromCore } from '@trek12/engine'
import { crnRolloutScores } from '../mc/crn.ts'
import { getPolicy } from '../policy/registry.ts'
import type { SolverRequest, SolverResponse } from './protocol.ts'

/** The worker-side brain: a pure function of the request, shared by every worker implementation. */
export function createHandler(): (req: SolverRequest) => SolverResponse {
  let map: CompiledMap | null = null
  return (req) => {
    try {
      if (req.t === 'init') {
        const def = getMapDef(req.mapId)
        if (!def) return { t: 'error', message: `unknown map ${req.mapId}` }
        map = compileMap(def, req.ruleset)
        return { t: 'ready' }
      }
      if (!map) return { t: 'error', job: req.job, message: 'worker not initialised' }
      const policy = getPolicy(req.policy)
      if (!policy) return { t: 'error', job: req.job, message: `unknown policy ${req.policy}` }
      const child = stateFromCore(map, req.core)
      const scores = crnRolloutScores(map, child, policy, req.seed, req.from, req.count)
      return { t: 'rollouts', job: req.job, scores }
    } catch (error) {
      return { t: 'error', job: req.t === 'init' ? undefined : req.job, message: String(error) }
    }
  }
}
