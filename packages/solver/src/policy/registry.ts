import { greedyPolicy } from './greedy.ts'
import { heuristicPolicy } from './heuristic.ts'
import { randomPolicy } from './random.ts'
import type { RolloutPolicy } from './types.ts'

export const POLICIES: readonly RolloutPolicy[] = [randomPolicy, greedyPolicy, heuristicPolicy]

export function getPolicy(name: string): RolloutPolicy | undefined {
  return POLICIES.find((p) => p.name === name)
}
