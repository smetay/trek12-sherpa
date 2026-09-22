import { type CompiledMap, OP_NAMES, type State, ticksUsed } from '@trek12/engine'
import type { Dict } from '../lib/i18n.ts'

type Props = {
  map: CompiledMap
  state: State
  t: Dict
  /** Operation about to be used (preview): its next box is shown hatched. */
  previewOp?: number
  /** Result of each operation for the current dice (shown next to the symbol). */
  results?: number[]
}

/** The 5 × 4 "tableau des choix": one row per operation, one box per allowed use. */
export function ChoiceTable({ map, state, t, previewOp, results }: Props) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {OP_NAMES.map((name, op) => {
        const used = ticksUsed(map, state, op)
        const limit = map.opLimits[op]
        const exhausted = used >= limit
        return (
          <div
            key={name}
            className={`rounded-lg border px-1.5 py-1 text-center ${exhausted ? 'border-slate-800 opacity-40' : 'border-slate-700'}`}
            title={t.options[name]}
          >
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-base font-bold">{t.opShort[name]}</span>
              {results && (
                <span className="text-xs tabular-nums text-slate-300">
                  {exhausted ? '—' : results[op]}
                </span>
              )}
            </div>
            <div className="mt-1 flex justify-center gap-0.5">
              {Array.from({ length: limit }, (_, i) => {
                const ticked = i < used
                const preview = !ticked && previewOp === op && i === used
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: boxes are positional by nature
                    key={`${name}-${i}`}
                    className={`inline-block size-2.5 rounded-sm ${ticked ? 'bg-slate-200' : preview ? 'bg-amber-400' : 'bg-slate-700'}`}
                  />
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
