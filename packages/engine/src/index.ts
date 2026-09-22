/**
 * @trek12/engine — the rules of Trek 12, and nothing else.
 *
 * Constraints (enforced by tsconfig `types: []` / `lib: ES2023`): no DOM, no Node, no dependencies.
 * `docs/RULES.md` is the source of truth for every rule interpretation implemented here.
 */
export const ENGINE_VERSION = '0.1.0'

export * from './apply.ts'
export * from './dice.ts'
export * from './map.ts'
export * from './maps/index.ts'
export * from './moves.ts'
export * from './rng.ts'
export * from './ruleset.ts'
export * from './score.ts'
export * from './serialize.ts'
export * from './state.ts'
