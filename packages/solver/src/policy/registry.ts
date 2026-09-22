import { greedyPolicy } from './greedy.ts'
import { heuristicPolicy, heuristicV1Policy } from './heuristic.ts'
import { randomPolicy } from './random.ts'
import type { RolloutPolicy } from './types.ts'

const registry: RolloutPolicy[] = [randomPolicy, greedyPolicy, heuristicPolicy, heuristicV1Policy]

export const POLICIES: readonly RolloutPolicy[] = registry

export function getPolicy(name: string): RolloutPolicy | undefined {
  return registry.find((p) => p.name === name)
}

/** Adds or replaces a policy by name (bench experiments: custom weights). */
export function registerPolicy(policy: RolloutPolicy): void {
  const i = registry.findIndex((p) => p.name === policy.name)
  if (i >= 0) registry[i] = policy
  else registry.push(policy)
}
