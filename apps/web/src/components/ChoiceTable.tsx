import { type CompiledMap, OP_NAMES, type State, ticksUsed } from '@trek12/engine'
import { lossText } from '../lib/format.ts'
import { HEAT_COLOR, type HeatLevel } from '../lib/heat.ts'
import type { Dict, Lang } from '../lib/i18n.ts'

export type OpVerdict = { level: HeatLevel; loss: number }

type Props = {
  map: CompiledMap
  state: State
  t: Dict
  lang: Lang
  /** Operation of the selected move: its next box is highlighted. */
  previewOp?: number
  /** Result of each operation for the current dice (shown next to the symbol). */
  results?: number[]
  /** Best achievable outcome per operation, from the advice (undefined while unknown). */
  verdicts?: (OpVerdict | undefined)[]
  /** Operation the player tapped to filter the advice, if any. */
  pickedOp?: number | null
  /** When set, available operations become buttons. */
  onPick?: (op: number) => void
}

/**
 * The 5 × 4 "tableau des choix": one column per operation, one box per allowed use. During a
 * decision each column also shows the operation's result and how good its best move is; tapping a
 * column filters the advice to that operation.
 */
export function ChoiceTable({
  map,
  state,
  t,
  lang,
  previewOp,
  results,
  verdicts,
  pickedOp,
  onPick,
}: Props) {
  return (
    <div className="grid grid-cols-5 gap-1.5">
      {OP_NAMES.map((name, op) => {
        const used = ticksUsed(map, state, op)
        const limit = map.opLimits[op]
        const exhausted = used >= limit
        const active = previewOp === op
        const picked = pickedOp === op
        const verdict = verdicts?.[op]
        const interactive = onPick !== undefined && results !== undefined && !exhausted
        const body = (
          <>
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
            {results && !exhausted && (
              <div className="mt-1 flex items-center justify-center gap-1 text-xs font-semibold">
                {verdict ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="inline-block size-2 rounded-full"
                      style={{ background: HEAT_COLOR[verdict.level] }}
                    />
                    <span>{verdict.level === 'best' ? '★' : lossText(verdict.loss, lang)}</span>
                  </>
                ) : (
                  <span className="text-muted">…</span>
                )}
              </div>
            )}
          </>
        )
        const classes = `w-full rounded-lg border px-1 py-1 text-center ${
          picked
            ? 'border-ink bg-surface ring-2 ring-ink'
            : active
              ? 'border-ink bg-surface'
              : 'border-line'
        } ${exhausted ? 'opacity-40' : ''}`
        return interactive ? (
          <button
            key={name}
            type="button"
            onClick={() => onPick(op)}
            aria-pressed={picked}
            className={classes}
            title={t.options[name]}
          >
            {body}
          </button>
        ) : (
          <div key={name} className={classes} title={t.options[name]}>
            {body}
          </div>
        )
      })}
    </div>
  )
}
