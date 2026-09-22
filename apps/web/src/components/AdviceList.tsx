import type { CompiledMap, State } from '@trek12/engine'
import type { RankedMove } from '@trek12/solver'
import { lossText, num } from '../lib/format.ts'
import { describeLinks, type MoveView, viewMove } from '../lib/game.ts'
import { HEAT_COLOR, type HeatLevel, levelFor } from '../lib/heat.ts'
import type { Dict, Lang } from '../lib/i18n.ts'

export function moveTitle(v: MoveView, t: Dict): string {
  // Non-breaking spaces keep "→ case 8" and "dé 5" together when the line wraps.
  return `${t.options[v.op]}\u00a0${v.sad ? '☹' : v.result} →\u00a0${t.cell.toLowerCase()}\u00a0${v.cell}`
}

function Swatch({ level }: { level: HeatLevel }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 rounded-full"
      style={{ background: HEAT_COLOR[level] }}
    />
  )
}

type Props = {
  map: CompiledMap
  state: State
  /** Rows to show, best first; `top` is the best move overall (reference for losses). */
  rows: RankedMove[]
  top: RankedMove | undefined
  selected: number | null
  onSelect: (move: number) => void
  t: Dict
  lang: Lang
}

/** Ranked moves as rows: what to write where, how much it costs vs the best, links it draws. */
export function AdviceList({ map, state, rows, top, selected, onSelect, t, lang }: Props) {
  return (
    <ol className="flex flex-col">
      {rows.map((m) => {
        const v = viewMove(map, m.move)
        const isTop = top !== undefined && m.move === top.move
        const loss = top ? Math.max(0, top.mean - m.mean) : 0
        const level: HeatLevel = isTop ? 'best' : levelFor(loss, m.tied)
        const verdict = isTop ? t.legendBest : m.tied ? t.tied : `${lossText(loss, lang)} ${t.pts}`
        const links = describeLinks(v, state, map, t)
        const isSel = selected === m.move
        return (
          <li key={m.move} className="border-b border-line last:border-b-0">
            <button
              type="button"
              onClick={() => onSelect(m.move)}
              aria-pressed={isSel}
              className={`flex w-full items-start gap-3 py-2.5 pr-1 text-left ${
                isSel ? 'border-l-4 border-ink pl-2' : 'border-l-4 border-transparent pl-2'
              }`}
            >
              <span className="mt-1">
                <Swatch level={level} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">
                  {isTop ? '★ ' : ''}
                  {moveTitle(v, t)}
                </span>
                {(links || v.sad) && (
                  <span className="block text-sm text-muted">{v.sad ? t.sad : links}</span>
                )}
              </span>
              <span className="shrink-0 text-right">
                <span className="block font-semibold">{verdict}</span>
                <span className="block text-sm text-muted">
                  {t.expected} {num(m.mean, lang)}
                  {m.exact ? ` (${t.exact})` : ''}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ol>
  )
}

/** Colour key for the circles, in the order of the heat scale. */
export function HeatLegend({ t }: { t: Dict }) {
  const items: [HeatLevel, string][] = [
    ['best', `★ ${t.legendBest}`],
    ['tied', t.legendTied],
    ['near', t.legendNear],
    ['mid', t.legendMid],
    ['far', t.legendFar],
  ]
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
      {items.map(([level, label]) => (
        <li key={level} className="flex items-center gap-1.5">
          <Swatch level={level} />
          {label}
        </li>
      ))}
    </ul>
  )
}
