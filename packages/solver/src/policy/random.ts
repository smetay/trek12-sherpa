import type { RolloutPolicy } from './types.ts'

export const randomPolicy: RolloutPolicy = {
  name: 'random',
  choose: (_map, _s, _y, _r, _moves, count, rng) => rng.nextInt(count),
}
