import {
  applyMove,
  createState,
  findMove,
  type GameRecord,
  getMapDef,
  isRedFace,
  isYellowFace,
} from '@trek12/engine'
import type { TurnReview } from '@trek12/solver'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { compileFor } from './game.ts'

export type DiceEntry = { y: number | null; r: number | null }
export type Die = 'y' | 'r'

/** A line of play kept for display (the clairvoyant maximum, the Sherpa's own game). */
export type StoredLine = { key: string; moves: number[]; score: number }

export type StoredHindsight = StoredLine & {
  round: number
  agreeing: number
  lanes: number
  done: boolean
}

/** One reviewed turn, compact (see `TurnReview` in @trek12/solver). */
export type StoredTurn = Omit<TurnReview, 'ranking'> & {
  /** [move, mean, tied 0/1] per evaluated move, best first. */
  ranking: [number, number, number][]
}

export type StoredReview = { key: string; turns: StoredTurn[]; done: boolean }

export type Player = {
  id: string
  name: string
  /** What each circle holds: -1 empty, 0..12, 13 = ☹. */
  sheet: number[]
  /** Circles to double-check (read from a photo with low confidence). */
  doubts: number[]
  /** Total the player counted on paper, to check the count. */
  claimed: number | null
  /** Exact moves when the game was played in the app (the order is then known). */
  moves: number[] | null
  /** Move the player says they played at a turn whose order was ambiguous. */
  choices: (number | null)[]
  review: StoredReview | null
}

export type ReviewSession = {
  mapId: string
  /**
   * Results shown. Off by default: dice and sheets are entered without any spoiler, nothing is
   * computed, and everything is computed and revealed at the end in one go.
   */
  revealed: boolean
  dice: DiceEntry[]
  diceDoubts: { turn: number; die: Die }[]
  hindsight: StoredHindsight | null
  sherpa: StoredLine | null
  players: Player[]
}

export const TURNS = 19
export const EMPTY_CELL = -1
export const SAD_CELL = 13

const emptyDice = (): DiceEntry[] => Array.from({ length: TURNS }, () => ({ y: null, r: null }))

export function newSession(mapId = 'dunai'): ReviewSession {
  return {
    mapId,
    revealed: false,
    dice: emptyDice(),
    diceDoubts: [],
    hindsight: null,
    sherpa: null,
    players: [],
  }
}

/** The 19 rolls when complete, else null. */
export function completeDice(dice: DiceEntry[]): { y: number; r: number }[] | null {
  if (dice.length < TURNS) return null
  const out: { y: number; r: number }[] = []
  for (const d of dice) {
    if (d.y === null || d.r === null) return null
    out.push({ y: d.y, r: d.r })
  }
  return out
}

/** Identifies the data a result was computed from (map + dice), to invalidate stale results. */
export function diceKey(mapId: string, dice: DiceEntry[]): string {
  return `${mapId}|${dice.map((d) => `${d.y ?? '_'}${d.r ?? '_'}`).join('')}`
}

export function playerKey(session: ReviewSession, player: Player): string {
  const src = player.moves ? `m${player.moves.join('.')}` : `s${player.sheet.join('.')}`
  return `${diceKey(session.mapId, session.dice)}|${src}`
}

/**
 * Reads dice from free text: pairs like "54 16 55", "5-4, 1-6", "5/4\n1/6" or one digit per die
 * ("541655…"). Faces out of range are rejected (yellow 0–5, red 1–6).
 */
export function parseDiceText(text: string): DiceEntry[] | null {
  const digits = (text.match(/\d/g) ?? []).map(Number)
  if (digits.length === 0 || digits.length % 2 !== 0 || digits.length > 2 * TURNS) return null
  const dice = emptyDice()
  for (let i = 0; i < digits.length; i += 2) {
    const y = digits[i]
    const r = digits[i + 1]
    if (!isYellowFace(y) || !isRedFace(r)) return null
    dice[i / 2] = { y, r }
  }
  return dice
}

let idCounter = 0
const newId = () => `p${Date.now().toString(36)}${(idCounter++).toString(36)}`

export function newPlayer(name: string, n = TURNS): Player {
  return {
    id: newId(),
    name,
    sheet: Array(n).fill(EMPTY_CELL),
    doubts: [],
    claimed: null,
    moves: null,
    choices: Array(n).fill(null),
    review: null,
  }
}

type Store = {
  session: ReviewSession
  reset(mapId?: string): void
  setMap(mapId: string): void
  setDie(turn: number, die: Die, value: number | null): void
  setDice(dice: DiceEntry[], doubts?: { turn: number; die: Die }[]): void
  addPlayer(name: string): string
  removePlayer(id: string): void
  updatePlayer(id: string, patch: Partial<Player>): void
  setCell(id: string, cell: number, value: number): void
  setChoice(id: string, turn: number, move: number | null): void
  setHindsight(result: StoredHindsight | null): void
  setSherpa(result: StoredLine | null): void
  setReview(id: string, review: StoredReview | null): void
  setRevealed(revealed: boolean): void
  /**
   * Starts an analysis of a game played in the app (dice and moves known), results shown; returns
   * the player's id, or null when the record cannot be replayed.
   */
  fromRecord(record: GameRecord, name: string): string | null
}

const updatePlayers = (s: ReviewSession, id: string, f: (p: Player) => Player): ReviewSession => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? f(p) : p)),
})

export const useReview = create<Store>()(
  persist(
    (set, get) => ({
      session: newSession(),
      reset: (mapId) => set({ session: newSession(mapId ?? get().session.mapId) }),
      setMap: (mapId) =>
        set(({ session }) => ({
          session: {
            ...session,
            mapId,
            revealed: false,
            hindsight: null,
            sherpa: null,
            // A sheet belongs to one map: changing the map clears the circles.
            players: session.players.map((p) => ({
              ...p,
              sheet: p.sheet.map(() => EMPTY_CELL),
              doubts: [],
              moves: null,
              review: null,
            })),
          },
        })),
      setDie: (turn, die, value) =>
        set(({ session }) => {
          const dice = session.dice.slice()
          dice[turn] = { ...dice[turn], [die]: value }
          const diceDoubts = session.diceDoubts.filter((d) => !(d.turn === turn && d.die === die))
          return { session: { ...session, dice, diceDoubts } }
        }),
      setDice: (dice, doubts = []) =>
        set(({ session }) => ({ session: { ...session, dice, diceDoubts: doubts } })),
      addPlayer: (name) => {
        const p = newPlayer(name)
        set(({ session }) => ({ session: { ...session, players: [...session.players, p] } }))
        return p.id
      },
      removePlayer: (id) =>
        set(({ session }) => ({
          session: { ...session, players: session.players.filter((p) => p.id !== id) },
        })),
      updatePlayer: (id, patch) =>
        set(({ session }) => ({
          session: updatePlayers(session, id, (p) => ({ ...p, ...patch })),
        })),
      setCell: (id, cell, value) =>
        set(({ session }) => ({
          session: updatePlayers(session, id, (p) => {
            const sheet = p.sheet.slice()
            sheet[cell] = value
            return {
              ...p,
              sheet,
              moves: null, // edited by hand: the recorded order no longer applies
              doubts: p.doubts.filter((c) => c !== cell),
              choices: p.choices.map(() => null),
            }
          }),
        })),
      setChoice: (id, turn, move) =>
        set(({ session }) => ({
          session: updatePlayers(session, id, (p) => {
            const choices = p.choices.slice()
            choices[turn] = move
            return { ...p, choices }
          }),
        })),
      setHindsight: (hindsight) => set(({ session }) => ({ session: { ...session, hindsight } })),
      setSherpa: (sherpa) => set(({ session }) => ({ session: { ...session, sherpa } })),
      setReview: (id, review) =>
        set(({ session }) => ({ session: updatePlayers(session, id, (p) => ({ ...p, review })) })),
      setRevealed: (revealed) => set(({ session }) => ({ session: { ...session, revealed } })),
      fromRecord: (record, name) => {
        const map = compileFor(record)
        if (!map) return null
        // The player asked for this analysis at the end of their game: nothing to hide.
        const session = { ...newSession(record.mapId), revealed: true }
        const player = newPlayer(name, map.n)
        const s = createState(map)
        const moves: number[] = []
        for (const [t, e] of record.history.entries()) {
          if (t >= TURNS) break
          const m = findMove(map, s, e)
          if (m === -1) return null
          session.dice[t] = { y: e.y, r: e.r }
          moves.push(m)
          applyMove(map, s, m)
        }
        player.sheet = Array.from({ length: map.n }, (_, c) => s[map.oVal + c])
        player.moves = moves.length === map.n ? moves : null
        set({ session: { ...session, players: [player] } })
        return player.id
      },
    }),
    {
      name: 'sherpa.review.v1',
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>
        const s = p.session
        const valid =
          s !== undefined &&
          typeof s.mapId === 'string' &&
          getMapDef(s.mapId) !== undefined &&
          Array.isArray(s.dice) &&
          s.dice.length === TURNS &&
          Array.isArray(s.players)
        return {
          ...current,
          session: valid
            ? { ...(s as ReviewSession), revealed: s.revealed === true }
            : current.session,
        }
      },
    },
  ),
)
