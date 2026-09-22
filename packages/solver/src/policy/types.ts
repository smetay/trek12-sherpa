import type { CompiledMap, Rng, State } from '@trek12/engine'

/**
 * A synchronous, allocation-free move chooser used inside rollouts and by the bench.
 * `moves[0..count)` are the legal moves for roll (y, r); returns the index of the chosen one.
 */
export type RolloutPolicy = {
  readonly name: string
  choose(
    map: CompiledMap,
    s: State,
    y: number,
    r: number,
    moves: Int32Array,
    count: number,
    rng: Rng,
  ): number
}
