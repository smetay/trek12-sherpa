import { applyMove, currentScore, type State } from '@trek12/engine'
import type { RolloutPolicy } from './types.ts'

let scratch: State | null = null

/** Picks the move with the best immediate score change; ties broken at random. */
export const greedyPolicy: RolloutPolicy = {
  name: 'greedy',
  choose(map, s, _y, _r, moves, count, rng) {
    if (scratch === null || scratch.length !== s.length) scratch = new Int32Array(s.length)
    const before = currentScore(map, s)
    let best = -Infinity
    let bestIdx = 0
    let ties = 1
    for (let i = 0; i < count; i++) {
      scratch.set(s)
      applyMove(map, scratch, moves[i])
      const delta = currentScore(map, scratch) - before
      if (delta > best) {
        best = delta
        bestIdx = i
        ties = 1
      } else if (delta === best && rng.nextInt(++ties) === 0) {
        bestIdx = i
      }
    }
    return bestIdx
  },
}
