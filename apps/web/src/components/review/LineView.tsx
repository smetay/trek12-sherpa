import {
  type CompiledMap,
  EMPTY,
  moveCell,
  moveDown,
  moveOp,
  moveResult,
  moveUp,
  OP_NAMES,
  rollRed,
  rollYellow,
  SAD,
  type State,
  scoreBreakdown,
} from '@trek12/engine'
import { useState } from 'react'
import { cellLabel, linksOf } from '../../lib/game.ts'
import type { Dict } from '../../lib/i18n.ts'
import { MapSvg, wash } from '../MapSvg.tsx'

/** "Sum 9 → circle 4" for a move of the analysis (☹ when the number does not fit). */
export function moveText(map: CompiledMap, move: number, t: Dict): string {
  const cell = moveCell(move)
  const v = moveResult(move)
  return t.writeIn(t.options[OP_NAMES[moveOp(move)]], v > map.cellMax[cell] ? '☹' : String(v), cell)
}

/** The two dice of a roll, drawn like the real ones. */
export function DicePair({ roll, size = 'md' }: { roll: number; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'size-6 text-sm rounded' : 'size-8 text-base rounded-md'
  return (
    <span className="inline-flex shrink-0 gap-1" title={`${rollYellow(roll)} / ${rollRed(roll)}`}>
      <span className={`grid place-items-center bg-accent font-bold text-accent-ink ${cls}`}>
        {rollYellow(roll)}
      </span>
      <span className={`grid place-items-center bg-die-red font-bold text-white ${cls}`}>
        {rollRed(roll)}
      </span>
    </span>
  )
}

/** A finished sheet with its links and zone tint (read-only). */
export function SheetView({
  map,
  state,
  ring,
  className,
}: {
  map: CompiledMap
  state: State
  ring?: number
  className?: string
}) {
  return (
    <MapSvg
      map={map.def}
      className={className ?? 'w-full rounded-2xl border border-line bg-surface'}
      links={linksOf(map, state)}
      cells={(id) => {
        const v = state[map.oVal + id]
        const inZone = v !== EMPTY && v !== SAD && state[map.oZsize + state[map.oZid + id]] > 1
        return {
          label: cellLabel(v),
          fill: inZone ? wash('var(--cell-stroke)') : undefined,
          ring: ring === id,
        }
      }}
    />
  )
}

/** "Rope paths 13 + 6 + bonus 3 · zones … · penalty −3" in one line. */
export function BreakdownLine({ map, state, t }: { map: CompiledMap; state: State; t: Dict }) {
  const b = scoreBreakdown(map, state)
  const sum = (xs: number[]) => xs.reduce((a, x) => a + x, 0)
  return (
    <p className="text-sm text-muted">
      {t.chains} {sum(b.chains.map((c) => c.points))}
      {b.chainBonus > 0 ? ` + ${b.chainBonus}` : ''} · {t.zones} {sum(b.zones.map((z) => z.points))}
      {b.zoneBonus > 0 ? ` + ${b.zoneBonus}` : ''}
      {b.penalty > 0 ? ` · ${t.penalty} −${b.penalty}` : ''}
    </p>
  )
}

/**
 * Replays a line turn by turn: slider + arrows, the sheet after the turn with the circle just
 * written ringed and its links, and the roll with the operation used.
 */
export function LineStepper({
  map,
  rolls,
  moves,
  states,
  t,
}: {
  map: CompiledMap
  rolls: ArrayLike<number>
  moves: ArrayLike<number>
  states: State[]
  t: Dict
}) {
  const [k, setK] = useState(moves.length)
  const state = states[k]
  const move = k > 0 ? moves[k - 1] : null
  const preview: [number, number][] =
    move === null
      ? []
      : [moveDown(move), moveUp(move)].filter((c) => c !== EMPTY).map((c) => [moveCell(move), c])
  return (
    <div className="flex flex-col gap-2">
      <MapSvg
        map={map.def}
        className="w-full rounded-2xl border border-line bg-surface"
        links={linksOf(map, state)}
        highlightEdges={preview}
        cells={(id) => ({
          label: cellLabel(state[map.oVal + id]),
          ring: move !== null && moveCell(move) === id,
          fill: move !== null && moveCell(move) === id ? wash('var(--accent)') : undefined,
        })}
      />
      <div className="flex min-h-10 items-center gap-2">
        {move === null ? (
          <span className="text-muted">{t.start}</span>
        ) : (
          <>
            <span className="w-9 shrink-0 font-semibold">
              {t.turnShort}
              {k}
            </span>
            <DicePair roll={rolls[k - 1]} size="sm" />
            <span className="min-w-0 flex-1 font-medium">{moveText(map, move, t)}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setK(Math.max(0, k - 1))}
          disabled={k === 0}
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-line disabled:opacity-35"
          aria-label={t.previous}
        >
          ←
        </button>
        <input
          type="range"
          min={0}
          max={moves.length}
          value={k}
          onChange={(e) => setK(Number(e.target.value))}
          className="min-w-0 flex-1 accent-[var(--ink)]"
          aria-label={t.turn}
        />
        <button
          type="button"
          onClick={() => setK(Math.min(moves.length, k + 1))}
          disabled={k === moves.length}
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-line disabled:opacity-35"
          aria-label={t.next}
        >
          →
        </button>
      </div>
    </div>
  )
}
