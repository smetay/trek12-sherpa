import { type CompiledMap, OP_NAMES, type State, ticksUsed } from '@trek12/engine'
import type { Dict } from '../lib/i18n.ts'

type Props = {
  map: CompiledMap
  state: State
  t: Dict
  /** Operation about to be used (preview): its next box is highlighted. */
  previewOp?: number
  /** Result of each operation for the current dice (shown next to the symbol). */
  results?: number[]
}

/** The 5 × 4 "tableau des choix": one column per operation, one box per allowed use. */
export function ChoiceTable({ map, state, t, previewOp, results }: Props) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {OP_NAMES.map((name, op) => {
        const used = ticksUsed(map, state, op)
        const limit = map.opLimits[op]
        const exhausted = used >= limit
        const active = previewOp === op
        return (
          <div
            key={name}
            className={`rounded-lg border px-1 py-1 text-center ${
              active ? 'border-ink bg-surface' : 'border-line'
            } ${exhausted ? 'opacity-40' : ''}`}
            title={t.options[name]}
          >
            <div className="flex items-baseline justify-center gap-1">
              <span className="text-base font-bold" aria-hidden="true">
                {t.opShort[name]}
              </span>
              <span className="sr-only">{t.options[name]}</span>
              {results && (
                <span className="text-sm font-semibold">{exhausted ? '–' : results[op]}</span>
              )}
            </div>
            <span className="sr-only">
              {used}/{limit}
            </span>
            <div className="mt-1 flex justify-center gap-0.5" aria-hidden="true">
              {Array.from({ length: limit }, (_, i) => {
                const ticked = i < used
                const preview = !ticked && active && i === used
                return (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: boxes are positional by nature
                    key={`${name}-${i}`}
                    className={`inline-block size-2.5 rounded-sm ${
                      ticked ? 'bg-ink' : preview ? 'bg-accent' : 'bg-line'
                    }`}
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
