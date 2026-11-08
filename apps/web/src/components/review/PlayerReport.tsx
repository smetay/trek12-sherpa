import { type CompiledMap, EMPTY, moveCell, type State } from '@trek12/engine'
import type { RankedMove, TurnReview } from '@trek12/solver'
import { useMemo, useState } from 'react'
import { lossText, num } from '../../lib/format.ts'
import { cellLabel, linksOf, viewMove } from '../../lib/game.ts'
import { cellHeats, HEAT_COLOR } from '../../lib/heat.ts'
import type { Dict, Lang } from '../../lib/i18n.ts'
import { MapSvg, wash } from '../MapSvg.tsx'
import { DicePair, moveText } from './LineView.tsx'

export type Grade = 'good' | 'inaccuracy' | 'mistake' | 'blunder'

/** Chess-style grading of a decision by its expected cost (points). */
export function gradeOf(r: TurnReview): Grade {
  if (r.tied || r.loss < 0.5) return 'good'
  if (r.loss < 2) return 'inaccuracy'
  if (r.loss < 5) return 'mistake'
  return 'blunder'
}

export const GRADE_COLOR: Record<Grade, string> = {
  good: 'var(--heat-best)',
  inaccuracy: 'var(--heat-near)',
  mistake: 'var(--heat-mid)',
  blunder: 'var(--heat-far)',
}

const GRADES: Grade[] = ['good', 'inaccuracy', 'mistake', 'blunder']

function Dot({ grade }: { grade: Grade }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block size-3 shrink-0 rounded-full"
      style={{ background: GRADE_COLOR[grade] }}
    />
  )
}

/** Three scores on one axis: the player, the Sherpa (fair benchmark), the clairvoyant maximum. */
export function ScoreLadder({
  marks,
}: {
  marks: { label: string; value: number | null; strong?: boolean }[]
}) {
  const known = marks.filter((m) => m.value !== null) as {
    label: string
    value: number
    strong?: boolean
  }[]
  if (known.length === 0) return null
  const lo = Math.min(...known.map((m) => m.value)) - 6
  const hi = Math.max(...known.map((m) => m.value)) + 6
  const pos = (v: number) => `${((v - lo) / (hi - lo)) * 100}%`
  return (
    <div
      className="relative mt-1 mb-1 h-16"
      role="img"
      aria-label={known.map((m) => `${m.label} ${m.value}`).join(', ')}
    >
      <div className="absolute inset-x-0 top-8 h-1.5 rounded-full bg-line" />
      {known.map((m, i) => (
        <div
          key={m.label}
          className="absolute flex -translate-x-1/2 flex-col items-center"
          style={{ left: pos(m.value), top: i % 2 === 0 ? 0 : 26 }}
        >
          {i % 2 === 0 && (
            <span className={`text-sm leading-tight ${m.strong ? 'font-bold' : 'text-muted'}`}>
              {m.label} <b>{m.value}</b>
            </span>
          )}
          <span
            className={`my-0.5 block size-3.5 rounded-full border-2 border-surface ${m.strong ? 'bg-ink' : 'bg-muted'}`}
          />
          {i % 2 === 1 && (
            <span className={`text-sm leading-tight ${m.strong ? 'font-bold' : 'text-muted'}`}>
              {m.label} <b>{m.value}</b>
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

function asRanked(r: TurnReview): RankedMove[] {
  return r.ranking.map((m) => ({
    move: m.move,
    mean: m.mean,
    tied: m.tied,
    n: 1,
    se: 0,
    diff: 0,
    ci: 0,
    alive: true,
    exact: r.exact,
    pSummit: 0,
  }))
}

/** One turn in detail: the sheet before the move with the heat of every playable circle. */
function TurnDetail({
  map,
  before,
  review,
  onChoose,
  t,
  lang,
}: {
  map: CompiledMap
  before: State
  review: TurnReview
  onChoose?: (move: number) => void
  t: Dict
  lang: Lang
}) {
  const heats = useMemo(() => cellHeats(asRanked(review), moveCell), [review])
  const playedCell = moveCell(review.played)
  const playedView = viewMove(map, review.played)
  const options = [review.played, ...review.alternatives]
  return (
    <div className="flex flex-col gap-2 pt-1 pb-3">
      <MapSvg
        map={map.def}
        className="w-full rounded-xl border border-line bg-surface"
        links={linksOf(map, before)}
        highlightEdges={[playedView.down, playedView.up]
          .filter((c) => c !== EMPTY)
          .map((c) => [playedCell, c] as [number, number])}
        cells={(id) => {
          const v = before[map.oVal + id]
          if (v !== EMPTY) return { label: cellLabel(v) }
          const h = heats.get(id)
          if (!h) return { dim: id !== playedCell, ring: id === playedCell }
          const shown = id === playedCell ? playedView : viewMove(map, h.move)
          return {
            fill: wash(HEAT_COLOR[h.level]),
            stroke: HEAT_COLOR[h.level],
            label: shown.sad ? '☹' : String(shown.result),
            sub: h.level === 'best' ? '' : lossText(h.loss, lang),
            star: h.level === 'best',
            ring: id === playedCell,
          }
        }}
      />
      <dl className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-2 gap-y-1 text-sm">
        <dt className="text-muted">{t.played}</dt>
        <dd className="font-semibold">{moveText(map, review.played, t)}</dd>
        <dd className="text-right text-muted">
          {Number.isNaN(review.playedMean)
            ? ''
            : `${t.expectedShort} ${num(review.playedMean, lang)}`}
        </dd>
        {review.best !== review.played && (
          <>
            <dt className="text-muted">{t.bestMove}</dt>
            <dd className="font-semibold">{moveText(map, review.best, t)}</dd>
            <dd className="text-right text-muted">
              {t.expectedShort} {num(review.bestMean, lang)}
            </dd>
          </>
        )}
      </dl>
      {review.alternatives.length > 0 && onChoose && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-bg p-2">
          <p className="text-sm text-muted">{t.inferredExplain}</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => m !== review.played && onChoose(m)}
                aria-pressed={m === review.played}
                className={`rounded-lg border px-2.5 py-1.5 text-sm font-medium ${
                  m === review.played ? 'border-ink bg-ink text-bg' : 'border-line bg-surface'
                }`}
              >
                {moveText(map, m, t)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function TurnRow({
  review,
  map,
  before,
  open,
  onToggle,
  onChoose,
  t,
  lang,
}: {
  review: TurnReview
  map: CompiledMap
  before: State
  open: boolean
  onToggle: () => void
  onChoose?: (move: number) => void
  t: Dict
  lang: Lang
}) {
  const grade = gradeOf(review)
  const forced = review.ranking.length === 0
  return (
    <li className="border-b border-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 py-2 text-left"
      >
        <span className="w-8 shrink-0 text-sm font-semibold text-muted">
          {t.turnShort}
          {review.turn + 1}
        </span>
        <DicePair roll={review.roll} size="sm" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block truncate font-medium">{moveText(map, review.played, t)}</span>
          {!review.confirmed && review.alternatives.length > 0 && (
            <span className="block text-xs text-muted">{t.inferred}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 text-sm font-semibold">
          <Dot grade={grade} />
          {forced ? t.forced : grade === 'good' ? '✓' : lossText(review.loss, lang)}
        </span>
      </button>
      {open && (
        <TurnDetail
          map={map}
          before={before}
          review={review}
          onChoose={onChoose}
          t={t}
          lang={lang}
        />
      )}
    </li>
  )
}

type Props = {
  map: CompiledMap
  turns: TurnReview[]
  /** Sheet before every turn of the reviewed game (states[t] = before turn t). */
  states: State[]
  score: number
  sherpa: number | null
  max: number | null
  onChoose?: (turn: number, move: number) => void
  t: Dict
  lang: Lang
}

/**
 * The review of one player's game: where they stand between the fair benchmark and the ceiling,
 * how many points their decisions cost, the costliest turns first, then every turn on demand.
 */
export function PlayerReport({ map, turns, states, score, sherpa, max, onChoose, t, lang }: Props) {
  const [open, setOpen] = useState<number | null>(null)
  const [all, setAll] = useState(false)
  const lost = turns.reduce((a, r) => a + r.loss, 0)
  const counts = GRADES.map((g) => turns.filter((r) => gradeOf(r) === g).length)
  const worst = turns
    .filter((r) => gradeOf(r) !== 'good')
    .sort((a, b) => b.loss - a.loss)
    .slice(0, 3)
  const label: Record<Grade, (k: number) => string> = {
    good: t.good,
    inaccuracy: t.inaccuracy,
    mistake: t.mistake,
    blunder: t.blunder,
  }
  const row = (r: TurnReview) => (
    <TurnRow
      key={r.turn}
      review={r}
      map={map}
      before={states[r.turn]}
      open={open === r.turn}
      onToggle={() => setOpen(open === r.turn ? null : r.turn)}
      onChoose={onChoose ? (m) => onChoose(r.turn, m) : undefined}
      t={t}
      lang={lang}
    />
  )
  return (
    <div className="flex flex-col gap-3">
      <ScoreLadder
        marks={[
          { label: t.you, value: score, strong: true },
          { label: t.sherpa, value: sherpa },
          { label: t.max, value: max },
        ]}
      />
      <div className="rounded-xl bg-bg p-3">
        <p className="flex items-baseline justify-between gap-2">
          <span className="font-semibold">{t.lost}</span>
          <span className="text-2xl font-bold">{num(lost, lang)}</span>
        </p>
        <p className="mt-0.5 text-xs text-muted">{t.lostExplain}</p>
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm">
          {GRADES.map((g, i) => (
            <li key={g} className="flex items-center gap-1.5">
              <Dot grade={g} />
              <b>{counts[i]}</b> {label[g](counts[i])}
            </li>
          ))}
        </ul>
      </div>
      {worst.length > 0 && (
        <section>
          <h4 className="mb-1 text-sm font-semibold">{t.biggestLosses}</h4>
          <ol>{worst.map(row)}</ol>
        </section>
      )}
      <section>
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="text-sm font-semibold underline underline-offset-2"
        >
          {t.allTurns} ({turns.length})
        </button>
        {all && <ol className="mt-1">{turns.map(row)}</ol>}
      </section>
    </div>
  )
}
