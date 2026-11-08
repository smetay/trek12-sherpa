import { type CompiledMap, compileMap, getMapDef, mix32 } from '@trek12/engine'
import {
  heuristicPolicy,
  type Line,
  type ReviewSource,
  reviewGame,
  rollsOf,
  sherpaLine,
  solveHindsight,
  type TurnReview,
} from '@trek12/solver'
import { create } from 'zustand'
import { getPool } from './advice.ts'
import {
  completeDice,
  diceKey,
  type Player,
  playerKey,
  type ReviewSession,
  type StoredTurn,
  useReview,
} from './reviewStore.ts'
import { useStore } from './store.ts'

/**
 * Heavy computations of the analysis page — the clairvoyant maximum, the Sherpa's own game and the
 * review of each player — share the solver workers, so they run one at a time, in order. A task is
 * dropped as soon as the data it was started from changes (its key no longer matches).
 */
export type JobKind = 'hindsight' | 'sherpa' | `review:${string}`

type JobState = {
  running: JobKind | null
  /** 0..1 progress of the running job. */
  progress: number
  queued: JobKind[]
  error: string | null
}

export const useJobs = create<JobState>(() => ({
  running: null,
  progress: 0,
  queued: [],
  error: null,
}))

type Job = { kind: JobKind; key: () => string | null; run: (live: () => boolean) => Promise<void> }

const queue: Job[] = []
let busy = false
let runningKey: string | null = null

/** Seconds of thinking per reviewed turn (the advisor's race is capped by rollouts too). */
const REVIEW_MS_PER_TURN = 900
const SHERPA_MS_PER_TURN = 700
/** Hindsight search: wall-clock cap (lanes, rounds and stopping rule: the solver defaults). */
const HINDSIGHT_BUDGET_MS = 30_000
const HINDSIGHT_ROUNDS = 10

const now = () => performance.now()

function mapOf(session: ReviewSession): CompiledMap | null {
  const def = getMapDef(session.mapId)
  return def ? compileMap(def) : null
}

function seedOf(key: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < key.length; i++) h = mix32(h, key.charCodeAt(i))
  return h
}

async function pump(): Promise<void> {
  if (busy) return
  busy = true
  while (queue.length > 0) {
    const job = queue.shift() as Job
    useJobs.setState({ queued: queue.map((j) => j.kind), running: job.kind, progress: 0 })
    const startKey = job.key()
    runningKey = startKey
    if (startKey === null) continue
    const live = () => job.key() === startKey
    try {
      await job.run(live)
    } catch (error) {
      if (live()) useJobs.setState({ error: String(error) })
    }
  }
  useJobs.setState({ running: null, progress: 0, queued: [] })
  runningKey = null
  busy = false
}

function enqueue(job: Job): void {
  // Same job already running on the same data: nothing to do. A queued job of the same kind is
  // replaced (its data may have changed since).
  if (useJobs.getState().running === job.kind && runningKey === job.key()) return
  const i = queue.findIndex((j) => j.kind === job.kind)
  if (i >= 0) queue.splice(i, 1)
  queue.push(job)
  useJobs.setState({ queued: queue.map((j) => j.kind), error: null })
  void pump()
}

const workers = () => useStore.getState().workers
const session = () => useReview.getState().session

/** Starts (or continues, with `longer`) the search for the best score these dice allowed. */
export function startHindsight(longer = false): void {
  enqueue({
    kind: 'hindsight',
    key: () => (completeDice(session().dice) ? diceKey(session().mapId, session().dice) : null),
    run: async (live) => {
      const s = session()
      const map = mapOf(s)
      const dice = completeDice(s.dice)
      if (!map || !dice) return
      const key = diceKey(s.mapId, s.dice)
      const rolls = rollsOf(dice)
      const previous = s.hindsight?.key === key ? s.hindsight : null
      const start: Line | undefined =
        longer && previous
          ? { moves: Int32Array.from(previous.moves), score: previous.score }
          : undefined
      const rounds = HINDSIGHT_ROUNDS
      const pool = getPool(map, workers())
      const result = await solveHindsight(pool, map, rolls, {
        seed: seedOf(key) + (longer ? (previous?.round ?? 0) : 0),
        lanes: 4,
        rounds,
        start,
        timeBudgetMs: HINDSIGHT_BUDGET_MS,
        now,
        shouldStop: () => !live(),
        onProgress: (p) => {
          if (!live()) return
          useJobs.setState({ progress: p.done ? 1 : p.round / rounds })
          const before = useReview.getState().session.hindsight
          const kept = before?.key === key && before.score > p.best.score ? before : null
          useReview.getState().setHindsight({
            key,
            moves: kept ? kept.moves : Array.from(p.best.moves),
            score: kept ? kept.score : p.best.score,
            round: (longer ? (previous?.round ?? 0) : 0) + p.round,
            agreeing: p.agreeing,
            lanes: p.lanes,
            done: p.done,
          })
        },
      })
      if (!live() || !result) return
      const h = useReview.getState().session.hindsight
      if (h && !h.done) useReview.getState().setHindsight({ ...h, done: true })
    },
  })
}

/** The Sherpa's own game on these dice (no clairvoyance). */
export function startSherpa(): void {
  enqueue({
    kind: 'sherpa',
    key: () => (completeDice(session().dice) ? diceKey(session().mapId, session().dice) : null),
    run: async (live) => {
      const s = session()
      const map = mapOf(s)
      const dice = completeDice(s.dice)
      if (!map || !dice) return
      const key = diceKey(s.mapId, s.dice)
      const pool = getPool(map, workers())
      const line = await sherpaLine(pool, map, rollsOf(dice), heuristicPolicy, {
        seed: seedOf(key),
        timeBudgetMs: SHERPA_MS_PER_TURN,
        maxRollouts: 4096,
        now,
        shouldStop: () => !live(),
        onTurn: (t) => {
          if (live()) useJobs.setState({ progress: (t + 1) / map.n })
        },
      })
      if (!live() || line.moves.length < map.n) return
      useReview.getState().setSherpa({ key, moves: line.moves, score: line.score })
    },
  })
}

function storeTurn(r: TurnReview): StoredTurn {
  return {
    ...r,
    ranking: r.ranking.map((m) => [m.move, Math.round(m.mean * 100) / 100, m.tied ? 1 : 0]),
  }
}

export function restoreTurn(t: StoredTurn): TurnReview {
  return {
    ...t,
    ranking: t.ranking.map(([move, mean, tied]) => ({ move, mean, tied: tied === 1 })),
  }
}

/** Reviews a player's game; keeps the turns already reviewed before `fromTurn` (choice changed). */
export function startReview(playerId: string, fromTurn = 0): void {
  const keyOf = () => {
    const s = session()
    const p = s.players.find((x) => x.id === playerId)
    if (!p || !completeDice(s.dice)) return null
    return `${playerKey(s, p)}|${p.choices.map((c) => c ?? '').join('.')}`
  }
  enqueue({
    kind: `review:${playerId}`,
    key: keyOf,
    run: async (live) => {
      const s = session()
      const player = s.players.find((x) => x.id === playerId) as Player
      const map = mapOf(s)
      const dice = completeDice(s.dice)
      if (!map || !dice || !player) return
      const key = playerKey(s, player)
      const previous = player.review?.key === key ? player.review.turns : []
      const reuse = previous.slice(0, fromTurn).map(restoreTurn)
      const source: ReviewSource = player.moves
        ? { kind: 'moves', moves: player.moves }
        : { kind: 'sheet', target: player.sheet, choices: player.choices }
      const turns: StoredTurn[] = []
      const pool = getPool(map, workers())
      await reviewGame(pool, map, rollsOf(dice), source, heuristicPolicy, {
        seed: seedOf(key),
        timeBudgetMs: REVIEW_MS_PER_TURN,
        maxRollouts: 4096,
        now,
        reuse,
        shouldStop: () => !live(),
        onTurn: (r) => {
          if (!live()) return
          turns.push(storeTurn(r))
          useJobs.setState({ progress: turns.length / map.n })
          useReview.getState().setReview(playerId, { key, turns: turns.slice(), done: false })
        },
      })
      if (!live()) return
      useReview.getState().setReview(playerId, { key, turns, done: turns.length === map.n })
    },
  })
}
