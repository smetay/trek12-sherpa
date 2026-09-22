import type { CompiledMap, State } from '@trek12/engine'
import type { RankedMove } from '@trek12/solver'
import { describeLinks, type MoveView, viewMove } from '../lib/game.ts'
import type { Dict } from '../lib/i18n.ts'

type Props = {
  map: CompiledMap
  state: State
  ranking: RankedMove[]
  running: boolean
  selected: number | null
  onSelect: (move: number) => void
  t: Dict
  limit?: number
}

export function moveTitle(v: MoveView, t: Dict): string {
  return `${t.opShort[v.op]} ${v.sad ? '☹' : v.result} → ${t.cell.toLowerCase()} ${v.cell}`
}

export function AdviceList({
  map,
  state,
  ranking,
  running,
  selected,
  onSelect,
  t,
  limit = 6,
}: Props) {
  const shown = ranking.filter((m) => m.exact || m.n > 0).slice(0, limit)
  if (shown.length === 0) {
    return <p className="text-sm text-slate-400">{running ? t.thinking : ''}</p>
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {shown.map((m, i) => {
        const v = viewMove(map, m.move)
        const isSel = selected === m.move
        const links = describeLinks(v, state, map, t)
        return (
          <li key={m.move}>
            <button
              type="button"
              onClick={() => onSelect(m.move)}
              aria-pressed={isSel}
              className={`w-full rounded-xl border px-3 py-2 text-left ${isSel ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-800/60'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">
                  {i === 0 ? '★ ' : ''}
                  {moveTitle(v, t)}
                </span>
                <span className="text-sm tabular-nums text-slate-300">
                  {m.exact
                    ? `${m.mean.toFixed(1)} (${t.exact})`
                    : `${m.mean.toFixed(1)} ± ${(1.96 * m.se).toFixed(1)}`}
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
                {i > 0 && (
                  <span className={m.tied ? 'text-emerald-300' : ''}>
                    {m.tied ? t.tied : `${m.diff.toFixed(1)} ${t.vsBest}`}
                    {!m.exact && ` (±${m.ci.toFixed(1)})`}
                  </span>
                )}
                {!m.exact && m.n > 0 && (
                  <span>
                    {t.pSummit} {(100 * m.pSummit).toFixed(0)} % · {m.n} {t.rollouts}
                  </span>
                )}
                {links && <span>{links}</span>}
                {v.sad && <span className="text-rose-300">{t.sad}</span>}
              </div>
            </button>
          </li>
        )
      })}
    </ol>
  )
}
