import {
  applyMove,
  type CompiledMap,
  createState,
  EMPTY,
  moveCell,
  moveOp,
  OP_NAMES,
  type State,
} from '@trek12/engine'
import type { Rolls, SheetReconstructor } from '@trek12/solver'
import { useMemo, useState } from 'react'
import { cellLabel, linksOf } from '../../lib/game.ts'
import type { Dict } from '../../lib/i18n.ts'
import { MapSvg, wash } from '../MapSvg.tsx'
import { DicePair } from './LineView.tsx'

type Props = {
  map: CompiledMap
  rolls: Rolls
  rec: SheetReconstructor
  /** Target sheet (numbers shown faintly in the circles not filled yet). */
  sheet: number[]
  /** Choices already given (move per turn, null = unknown). */
  initial: (number | null)[]
  onDone: (choices: (number | null)[]) => void
  onCancel: () => void
  t: Dict
}

/** Replays the known prefix of choices; returns the state and how many turns it covers. */
function replayPrefix(map: CompiledMap, rec: SheetReconstructor, choices: (number | null)[]) {
  const s = createState(map)
  let k = 0
  for (; k < map.n; k++) {
    const m = choices[k]
    if (m === null || m === undefined || !rec.candidates(s).includes(m)) break
    applyMove(map, s, m)
  }
  return { state: s, turn: k }
}

/**
 * Optional step before a paper review: the player says, turn by turn, which circle they filled.
 * Only the circles the dice and the finished sheet allow are offered; forced turns fill themselves.
 * Cheap (no search), and it turns an indicative review into an exact one.
 */
export function OrderEntry({ map, rolls, rec, sheet, initial, onDone, onCancel, t }: Props) {
  const [choices, setChoices] = useState<(number | null)[]>(() => {
    const { turn } = replayPrefix(map, rec, initial)
    return initial.map((c, k) => (k < turn ? c : null))
  })
  const [pickCell, setPickCell] = useState<number | null>(null)
  /** Turns the player chose explicitly, in order (undo goes back to the last one). */
  const [stack, setStack] = useState<number[]>(() =>
    initial.flatMap((c, k) => (c !== null && k < replayPrefix(map, rec, initial).turn ? [k] : [])),
  )

  // Current position, with forced turns (a single candidate circle and operation) applied.
  const view = useMemo(() => {
    const filled = choices.slice()
    const { state } = replayPrefix(map, rec, filled)
    let turn = filled.indexOf(null)
    if (turn < 0) turn = map.n
    let candidates: number[] = []
    while (turn < map.n) {
      candidates = rec.candidates(state)
      const cells = new Set(candidates.map(moveCell))
      if (cells.size !== 1) break
      // Only one circle possible: play it. When several operations give its number (players rarely
      // remember which box they ticked), spend the one with the most boxes left, as a player would.
      let pick = candidates[0]
      let spare = -1
      for (const m of candidates) {
        const op = moveOp(m)
        const left = map.opLimits[op] - state[map.oTicks + op]
        if (left > spare) {
          spare = left
          pick = m
        }
      }
      filled[turn] = pick
      applyMove(map, state, pick)
      turn++
    }
    return { state: state as State, turn, candidates, filled }
  }, [choices, map, rec])

  const { state, turn, candidates, filled } = view
  const done = turn >= map.n
  const cells = new Set(candidates.map(moveCell))
  const forCell = pickCell === null ? [] : candidates.filter((m) => moveCell(m) === pickCell)
  // One button per operation (link variants: the first one; links rarely change the review).
  const byOp = new Map<number, number>()
  for (const m of forCell) if (!byOp.has(moveOp(m))) byOp.set(moveOp(m), m)

  const choose = (m: number) => {
    const next = filled.slice()
    next[turn] = m
    setChoices(next)
    setStack([...stack, turn])
    setPickCell(null)
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-ink p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">{t.orderTitle}</p>
        <p className="text-sm text-muted">
          {Math.min(turn + 1, map.n)}/{map.n}
        </p>
      </div>
      {!done ? (
        <div className="flex items-center gap-2">
          <span className="font-semibold">
            {t.turnShort}
            {turn + 1}
          </span>
          <DicePair roll={rolls[turn]} size="sm" />
          <span className="text-sm text-muted">{t.orderPrompt}</span>
        </div>
      ) : (
        <p className="text-sm font-medium text-best">{t.orderComplete}</p>
      )}
      <MapSvg
        map={map.def}
        className="w-full rounded-xl border border-line bg-surface"
        links={linksOf(map, state)}
        onCellClick={done ? undefined : (id) => cells.has(id) && setPickCell(id)}
        cells={(id) => {
          const v = state[map.oVal + id]
          if (v !== EMPTY) return { label: cellLabel(v) }
          const ghost = cellLabel(sheet[id])
          if (cells.has(id)) {
            return {
              label: ghost,
              fill: wash('var(--accent)'),
              stroke: 'var(--ink)',
              ring: pickCell === id,
              ariaLabel: `${t.cell} ${id} : ${ghost}`,
            }
          }
          return { sub: ghost, dim: true }
        }}
      />
      {byOp.size > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {[...byOp.entries()].map(([op, m]) => (
            <button
              key={op}
              type="button"
              onClick={() => choose(m)}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-semibold"
            >
              {t.options[OP_NAMES[op]]}
            </button>
          ))}
        </div>
      )}
      {byOp.size === 1 && pickCell !== null && (
        <button
          type="button"
          onClick={() => choose([...byOp.values()][0])}
          className="rounded-lg bg-accent px-3 py-2 font-semibold text-accent-ink"
        >
          {t.cell} {pickCell} ✓
        </button>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onDone(filled)}
          className="flex-1 rounded-lg bg-ink px-3 py-2.5 font-semibold text-bg"
        >
          {done ? t.done : t.orderRest}
        </button>
        <button
          type="button"
          onClick={() => {
            // Back to the last turn the player chose (forced turns are re-derived).
            const last = stack[stack.length - 1]
            if (last === undefined) return
            setChoices(choices.map((c, k) => (k >= last ? null : c)))
            setStack(stack.slice(0, -1))
            setPickCell(null)
          }}
          disabled={stack.length === 0}
          className="rounded-lg border border-line px-3 py-2.5 text-sm disabled:opacity-40"
        >
          {t.previousTurn}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-line px-3 py-2.5 text-sm"
        >
          {t.cancel}
        </button>
      </div>
    </div>
  )
}
