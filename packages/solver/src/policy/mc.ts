import { mix32 } from '@trek12/engine'
import { Race } from '../mc/race.ts'
import { heuristicPolicy } from './heuristic.ts'
import type { RolloutPolicy } from './types.ts'

/**
 * The Monte-Carlo advisor packaged as a policy, for the bench (`--policy mc512`): at every turn it
 * runs a full root race with the given rollout budget per candidate and plays the best move.
 * Far too slow for rollouts; meant for measuring strength against the rollout policies.
 */
export function makeMcPolicy(
  maxRollouts: number,
  rollout: RolloutPolicy = heuristicPolicy,
): RolloutPolicy {
  return {
    name: `mc${maxRollouts}`,
    choose(map, s, y, r, moves, count, rng) {
      if (count === 1) return 0
      const race = new Race(map, s, y, r, rollout, {
        seed: mix32(rng.next(), count, 0xace),
        maxRollouts,
      })
      const best = race.runToEnd()[0].move
      for (let i = 0; i < count; i++) if (moves[i] === best) return i
      return 0
    },
  }
}

/** Parses `mc<N>` policy names for the bench. */
export function parseMcPolicy(name: string): RolloutPolicy | undefined {
  const m = /^mc(\d+)$/.exec(name)
  return m ? makeMcPolicy(Number(m[1])) : undefined
}
