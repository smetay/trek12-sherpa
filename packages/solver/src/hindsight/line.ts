import {
  applyMove,
  type CompiledMap,
  createState,
  currentScore,
  generateMoves,
  isRedFace,
  isYellowFace,
  MAX_MOVES,
  type Move,
  rollIndex,
  rollRed,
  rollYellow,
  type State,
} from '@trek12/engine'

/**
 * A known sequence of rolls: `rolls[t]` is the roll index (0..35, see `rollIndex`) of turn t.
 * With every roll known in advance the game becomes a deterministic puzzle — the "hindsight" or
 * clairvoyant problem: what is the best score these dice allowed?
 */
export type Rolls = Uint8Array

/** A complete or partial line of play: `moves[t]` is the move of turn t. */
export type Line = {
  moves: Int32Array
  /** Final score of the line (the engine's count). */
  score: number
}

export function rollsOf(dice: readonly { y: number; r: number }[]): Rolls {
  const rolls = new Uint8Array(dice.length)
  dice.forEach((d, t) => {
    if (!isYellowFace(d.y) || !isRedFace(d.r)) {
      throw new RangeError(`turn ${t + 1}: invalid dice ${d.y}/${d.r}`)
    }
    rolls[t] = rollIndex(d.y, d.r)
  })
  return rolls
}

export function diceOf(rolls: Rolls): { y: number; r: number }[] {
  return Array.from(rolls, (roll) => ({ y: rollYellow(roll), r: rollRed(roll) }))
}

const scratch = new Int32Array(MAX_MOVES)

/** Whether `move` is legal on `s` for the roll `roll`. */
export function isLegalOn(map: CompiledMap, s: State, roll: number, move: Move): boolean {
  const count = generateMoves(map, s, rollYellow(roll), rollRed(roll), scratch)
  for (let i = 0; i < count; i++) if (scratch[i] === move) return true
  return false
}

/**
 * States along a line: `states[t]` is the sheet before turn t (`states[0]` is `start`, empty by
 * default). Throws a RangeError naming the turn when a move is illegal.
 */
export function lineStates(
  map: CompiledMap,
  rolls: Rolls,
  moves: ArrayLike<number>,
  start: State = createState(map),
  startTurn = 0,
): State[] {
  const states: State[] = [start.slice()]
  const s = start.slice()
  for (let i = 0; i < moves.length; i++) {
    const t = startTurn + i
    if (!isLegalOn(map, s, rolls[t], moves[i])) {
      throw new RangeError(`turn ${t + 1}: move ${moves[i]} is not legal`)
    }
    applyMove(map, s, moves[i])
    states.push(s.slice())
  }
  return states
}

/** Final score of a complete line from the empty sheet (validated). */
export function lineScore(map: CompiledMap, rolls: Rolls, moves: ArrayLike<number>): number {
  const states = lineStates(map, rolls, moves)
  return currentScore(map, states[states.length - 1])
}
