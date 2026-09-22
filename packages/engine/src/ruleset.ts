/**
 * Rule interpretations that the rulebook leaves open (see docs/RULES.md).
 * A ruleset is stored with every game record so that replays stay faithful.
 */
export type LinkRule =
  /** Rulebook reading: whenever a rope link can be drawn, it must be — including a merge of two chains. */
  | 'mandatory'
  /** House variant: the player may leave any eligible link undrawn. */
  | 'optional'

export type Ruleset = {
  linkRule: LinkRule
}

export const DEFAULT_RULESET: Readonly<Ruleset> = Object.freeze({
  linkRule: 'mandatory',
})

export function isRuleset(value: unknown): value is Ruleset {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return v.linkRule === 'mandatory' || v.linkRule === 'optional'
}

export function sameRuleset(a: Ruleset, b: Ruleset): boolean {
  return a.linkRule === b.linkRule
}
