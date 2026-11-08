import type { CompiledMap } from '@trek12/engine'
import { useState } from 'react'
import { cellLabel } from '../../lib/game.ts'
import type { Dict } from '../../lib/i18n.ts'
import { EMPTY_CELL, SAD_CELL } from '../../lib/reviewStore.ts'
import { MapSvg, wash } from '../MapSvg.tsx'

type Props = {
  map: CompiledMap
  sheet: number[]
  /** Circles read from a photo with low confidence (orange, dashed). */
  doubts: number[]
  /** Circles the consistency check blames (red). */
  errors: number[]
  /** Photo crops of the circles, when the sheet was scanned. */
  thumbs?: Map<number, string>
  onSet: (cell: number, value: number) => void
  t: Dict
  readOnly?: boolean
}

const PAD = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]

/**
 * The player's paper sheet, typed in: tap a circle, tap its number on the docked pad, which then
 * moves to the next empty circle. Dangerous circles only offer 0–6 and ☹, like on paper.
 */
export function SheetEditor({ map, sheet, doubts, errors, thumbs, onSet, t, readOnly }: Props) {
  const [active, setActive] = useState<number | null>(null)

  const nextEmpty = (from: number, after: number[]) => {
    for (let k = 1; k <= map.n; k++) {
      const c = (from + k) % map.n
      if (after[c] === EMPTY_CELL) return c
    }
    return null
  }

  const write = (value: number) => {
    if (active === null) return
    onSet(active, value)
    const after = sheet.slice()
    after[active] = value
    if (sheet[active] === EMPTY_CELL) setActive(nextEmpty(active, after))
  }

  const max = active === null ? 12 : map.cellMax[active]

  return (
    <div className="flex flex-col gap-2">
      <MapSvg
        map={map.def}
        className="w-full rounded-2xl border border-line bg-surface"
        onCellClick={readOnly ? undefined : (id) => setActive(active === id ? null : id)}
        cells={(id) => {
          const v = sheet[id]
          const error = errors.includes(id)
          const doubt = doubts.includes(id)
          return {
            label: v === EMPTY_CELL ? '' : cellLabel(v),
            ring: active === id,
            stroke: error ? 'var(--heat-far)' : doubt ? 'var(--heat-mid)' : undefined,
            fill: error ? wash('var(--heat-far)') : doubt ? wash('var(--heat-mid)') : undefined,
            dashed: doubt && !error,
            ariaLabel: `${t.cell} ${id} : ${v === EMPTY_CELL ? '—' : cellLabel(v)}${doubt ? `, ${t.toCheck}` : ''}`,
          }
        }}
      />
      {active !== null && !readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface/97 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] shadow-lg backdrop-blur">
          <div className="mx-auto flex max-w-md flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="font-semibold">
                  {t.cell} {active}
                </p>
                {max < 12 && <p className="text-xs text-muted">{t.dangerousHint}</p>}
              </div>
              {thumbs?.has(active) && (
                <img
                  src={thumbs.get(active)}
                  alt={t.readOnPhoto}
                  className="size-14 rounded-full border-2 border-line bg-white object-cover"
                />
              )}
              <button
                type="button"
                onClick={() => setActive(null)}
                className="h-9 rounded-lg bg-ink px-3 text-sm font-semibold text-bg"
              >
                {t.done}
              </button>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {PAD.map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => write(v)}
                  disabled={v > max}
                  aria-pressed={sheet[active] === v}
                  className={`h-11 rounded-lg border text-lg font-bold disabled:opacity-25 ${
                    sheet[active] === v ? 'border-ink bg-ink text-bg' : 'border-line bg-bg'
                  }`}
                >
                  {v}
                </button>
              ))}
              <button
                type="button"
                onClick={() => write(SAD_CELL)}
                aria-pressed={sheet[active] === SAD_CELL}
                aria-label="☹"
                className={`h-11 rounded-lg border text-xl font-bold ${
                  sheet[active] === SAD_CELL ? 'border-ink bg-ink text-bg' : 'border-line bg-bg'
                }`}
              >
                ☹
              </button>
            </div>
            <button
              type="button"
              onClick={() => onSet(active, EMPTY_CELL)}
              className="self-start text-sm text-muted underline underline-offset-2"
            >
              {t.clearRoll}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
