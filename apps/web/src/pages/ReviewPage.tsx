import {
  type CompiledMap,
  compileMap,
  currentScore,
  getMapDef,
  MAPS,
  type State,
} from '@trek12/engine'
import { lineStates, type Rolls, rollsOf, SheetReconstructor } from '@trek12/solver'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DiceLog, type Thumbs } from '../components/review/DiceLog.tsx'
import { DiceScan } from '../components/review/DiceScan.tsx'
import { BreakdownLine, LineStepper, SheetView } from '../components/review/LineView.tsx'
import { OrderEntry } from '../components/review/OrderEntry.tsx'
import {
  DROP_RING,
  imageFrom,
  PhotoSource,
  useImageDrop,
} from '../components/review/PhotoSource.tsx'
import { PlayerReport } from '../components/review/PlayerReport.tsx'
import { SheetEditor } from '../components/review/SheetEditor.tsx'
import { SheetScan } from '../components/review/SheetScan.tsx'
import {
  type JobKind,
  readyForReview,
  restoreTurn,
  revealAll,
  startHindsight,
  startReview,
  startSherpa,
  useJobs,
} from '../lib/analysis.ts'
import { num } from '../lib/format.ts'
import { DICT, type Dict, type Lang } from '../lib/i18n.ts'
import {
  completeDice,
  diceKey,
  EMPTY_CELL,
  type Player,
  playerKey,
  type ReviewSession,
  useReview,
} from '../lib/reviewStore.ts'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.ts'

const card = 'rounded-2xl border border-line bg-surface p-4'
const primary =
  'w-full rounded-xl bg-accent px-4 py-3 text-base font-bold text-accent-ink disabled:opacity-40'
const secondary =
  'rounded-xl border border-line bg-surface px-3 py-2.5 text-sm font-semibold disabled:opacity-40'

function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col gap-1" aria-live="polite">
      <p className="text-sm text-muted">{label}</p>
      <div
        className="h-2 overflow-hidden rounded-full bg-line"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value * 100)}
        aria-label={label}
      >
        <div
          className="h-full rounded-full bg-ink transition-[width] duration-500"
          style={{ width: `${Math.max(4, Math.round(value * 100))}%` }}
        />
      </div>
    </div>
  )
}

function useJob(kind: JobKind) {
  const running = useJobs((s) => s.running === kind)
  const queued = useJobs((s) => s.queued.includes(kind))
  const progress = useJobs((s) => (s.running === kind ? s.progress : 0))
  return { running, queued, progress }
}

function recordedScore(map: CompiledMap, rolls: Rolls, moves: number[]): number | null {
  try {
    const states = lineStates(map, rolls, moves)
    return currentScore(map, states[states.length - 1])
  } catch {
    return null
  }
}

/** Compares the total counted on paper with what the sheet is worth under the rules. */
function CountCheck({
  claimed,
  score,
  range,
  t,
}: {
  claimed: number
  score: number
  range: number[] | null
  t: Dict
}) {
  const totals = range ? [...range, score] : [score]
  const lo = Math.min(...totals)
  const hi = Math.max(...totals)
  const ok = claimed >= lo && claimed <= hi
  return (
    <p className={`text-sm font-medium ${ok ? 'text-best' : 'text-far'}`}>
      {ok ? t.countOk : t.countRange(lo, hi)}
    </p>
  )
}

/** A player's score under the rules and, once reviewed, the points their decisions cost. */
function playerSummary(
  map: CompiledMap,
  rolls: Rolls | null,
  session: ReviewSession,
  player: Player,
): { score: number | null; lost: number | null } {
  if (!rolls || player.sheet.some((v) => v === EMPTY_CELL)) return { score: null, lost: null }
  const review = player.review?.key === playerKey(session, player) ? player.review : null
  if (review?.done) {
    try {
      const states = lineStates(
        map,
        rolls,
        review.turns.map((r) => r.played),
      )
      return {
        score: currentScore(map, states[states.length - 1]),
        lost: review.turns.reduce((a, r) => a + r.loss, 0),
      }
    } catch {
      // fall through to the sheet's own score
    }
  }
  if (player.moves) return { score: recordedScore(map, rolls, player.moves), lost: null }
  const score = new SheetReconstructor(map, rolls, player.sheet).sampleScores(0)[0]
  return { score: score ?? null, lost: null }
}

/**
 * Spoiler-free entry: nothing about the best play is computed or shown until the players ask for
 * it. Lists what is ready and reveals everything in one go.
 */
function RevealPanel({
  map,
  session,
  rolls,
  t,
}: {
  map: CompiledMap
  session: ReviewSession
  rolls: Rolls | null
  t: Dict
}) {
  const filled = session.dice.filter((d) => d.y !== null && d.r !== null).length
  const rows = session.players.map((p) => {
    const cells = p.sheet.filter((v) => v !== EMPTY_CELL).length
    const ready = rolls !== null && readyForReview(session, p)
    return {
      id: p.id,
      ok: ready,
      text: ready
        ? t.playerReady(p.name)
        : cells < map.n
          ? t.playerCells(p.name, cells, map.n)
          : rolls
            ? t.playerCheck(p.name)
            : t.playerWaitsDice(p.name),
    }
  })
  return (
    <section className={`${card} flex flex-col gap-3`} aria-labelledby="reveal-h">
      <div>
        <h2 id="reveal-h" className="font-semibold">
          {t.hiddenTitle}
        </h2>
        <p className="mt-1 text-sm text-muted">{t.hiddenExplain}</p>
      </div>
      <ul className="flex flex-col gap-1 text-sm">
        <li className="flex items-center gap-2">
          <span aria-hidden="true">{filled === 19 ? '✓' : '…'}</span>
          {t.rollsReady(filled)}
        </li>
        {rows.map((r) => (
          <li key={r.id} className="flex items-center gap-2">
            <span aria-hidden="true">{r.ok ? '✓' : '…'}</span>
            {r.text}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          revealAll()
          // The button sits at the bottom of the page; the results appear at the top.
          requestAnimationFrame(() =>
            document.getElementById('results-h')?.scrollIntoView({ block: 'start' }),
          )
        }}
        disabled={!rolls}
        className={primary}
      >
        {t.reveal}
      </button>
      <p className="text-xs text-muted">{rolls ? t.revealHint : t.maxNeedsDice}</p>
    </section>
  )
}

/** Everyone on one ladder once revealed: the ceiling, the fair benchmark, then the players. */
function ResultsCard({
  map,
  session,
  rolls,
  t,
  lang,
}: {
  map: CompiledMap
  session: ReviewSession
  rolls: Rolls | null
  t: Dict
  lang: Lang
}) {
  const key = diceKey(session.mapId, session.dice)
  const h = session.hindsight?.key === key ? session.hindsight : null
  const sherpa = session.sherpa?.key === key ? session.sherpa : null
  const running = useJobs((s) => s.running)
  const rows: { id: string; label: string; score: number | null; note: string; strong: boolean }[] =
    [
      {
        id: 'max',
        label: t.maxTitle,
        score: h?.score ?? null,
        note: h?.done ? t.bestFound : t.searching,
        strong: false,
      },
      {
        id: 'sherpa',
        label: t.sherpaShort,
        score: sherpa?.score ?? null,
        note: sherpa ? t.sherpaNote : t.waiting,
        strong: false,
      },
      ...session.players.map((p) => {
        const sum = playerSummary(map, rolls, session, p)
        const analysing = running === `review:${p.id}`
        return {
          id: p.id,
          label: p.name,
          score: sum.score,
          note:
            sum.lost !== null
              ? t.lostShort(num(sum.lost, lang))
              : analysing
                ? t.analysingShort
                : '',
          strong: true,
        }
      }),
    ]
  const sorted = rows
    .filter((r) => r.score !== null || r.id === 'max' || r.id === 'sherpa')
    .sort((a, b) => (b.score ?? -999) - (a.score ?? -999))
  return (
    <section className={`${card} flex flex-col gap-2`} aria-labelledby="results-h">
      <div className="flex items-center justify-between gap-2">
        <h2 id="results-h" className="font-semibold">
          {t.resultsTitle}
        </h2>
        <button
          type="button"
          onClick={() => useReview.getState().setRevealed(false)}
          className="text-sm text-muted underline underline-offset-2"
        >
          {t.hideResults}
        </button>
      </div>
      <ol className="flex flex-col" aria-live="polite">
        {sorted.map((r) => (
          <li
            key={r.id}
            className="flex items-baseline gap-2 border-b border-line py-1.5 last:border-b-0"
          >
            <span
              className={`min-w-0 flex-1 truncate ${r.strong ? 'font-semibold' : 'text-muted'}`}
            >
              {r.label}
            </span>
            <span className="shrink-0 text-xs text-muted">{r.note}</span>
            <span className={`w-10 shrink-0 text-right text-lg ${r.strong ? 'font-bold' : ''}`}>
              {r.score ?? '…'}
            </span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function MaxCard({
  map,
  session,
  rolls,
  t,
}: {
  map: CompiledMap
  session: ReviewSession
  rolls: Rolls | null
  t: Dict
}) {
  const job = useJob('hindsight')
  const [steps, setSteps] = useState(false)
  const key = diceKey(session.mapId, session.dice)
  const h = session.hindsight?.key === key ? session.hindsight : null
  const states = useMemo(() => {
    if (!h || !rolls) return null
    try {
      return lineStates(map, rolls, h.moves)
    } catch {
      return null
    }
  }, [h, rolls, map])

  // Start as soon as the 19 rolls are known (and again whenever they change).
  useEffect(() => {
    if (rolls && !h) startHindsight()
  }, [rolls, h])

  if (!rolls) {
    return (
      <section className={card}>
        <h2 className="font-semibold">{t.maxTitle}</h2>
        <p className="mt-1 text-sm text-muted">{t.maxNeedsDice}</p>
      </section>
    )
  }
  const searching = job.running || job.queued || !h?.done
  return (
    <section className={`${card} flex flex-col gap-3`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t.maxTitle}</h2>
          {h?.done && <p className="text-sm font-medium text-best">{t.bestFound}</p>}
        </div>
        <p className="text-4xl font-bold leading-none" aria-live="polite">
          {h ? h.score : '…'}
        </p>
      </div>
      <p className="text-sm text-muted">{t.maxExplain}</p>
      {searching && (job.running || job.queued) && (
        <Progress value={job.progress} label={job.queued ? t.waiting : t.searching} />
      )}
      {h?.done && h.agreeing > 0 && (
        <p className="text-sm text-muted">{t.agree(h.agreeing, h.lanes)}</p>
      )}
      {states && h && (
        <>
          {steps ? (
            <LineStepper map={map} rolls={rolls} moves={h.moves} states={states} t={t} />
          ) : (
            <SheetView map={map} state={states[states.length - 1]} />
          )}
          <BreakdownLine map={map} state={states[states.length - 1]} t={t} />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSteps((v) => !v)} className={secondary}>
              {steps ? t.hideSteps : t.stepByStep}
            </button>
            {h.done && !job.running && !job.queued && (
              <button type="button" onClick={() => startHindsight(true)} className={secondary}>
                {t.searchLonger}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  )
}

function SherpaCard({
  map,
  session,
  rolls,
  t,
}: {
  map: CompiledMap
  session: ReviewSession
  rolls: Rolls | null
  t: Dict
}) {
  const job = useJob('sherpa')
  const [show, setShow] = useState(false)
  const key = diceKey(session.mapId, session.dice)
  const line = session.sherpa?.key === key ? session.sherpa : null
  const states = useMemo(() => {
    if (!line || !rolls) return null
    try {
      return lineStates(map, rolls, line.moves)
    } catch {
      return null
    }
  }, [line, rolls, map])
  if (!rolls) return null
  return (
    <section className={`${card} flex flex-col gap-2`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">{t.sherpaTitle}</h2>
          <p className="text-sm text-muted">{t.sherpaExplain}</p>
        </div>
        {line ? (
          <p className="text-3xl font-bold leading-none">{line.score}</p>
        ) : (
          !job.running &&
          !job.queued && (
            <button type="button" onClick={startSherpa} className={`${secondary} shrink-0`}>
              {t.compute}
            </button>
          )
        )}
      </div>
      {(job.running || job.queued) && (
        <Progress value={job.progress} label={job.queued ? t.waiting : t.thinking} />
      )}
      {states && line && (
        <>
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            className="self-start text-sm font-semibold underline underline-offset-2"
            aria-expanded={show}
          >
            {show ? t.hideSteps : t.stepByStep}
          </button>
          {show && <LineStepper map={map} rolls={rolls} moves={line.moves} states={states} t={t} />}
        </>
      )}
    </section>
  )
}

function PlayerCard({
  map,
  session,
  player,
  rolls,
  incoming,
  onIncomingTaken,
  onActivate,
  t,
  lang,
}: {
  map: CompiledMap
  session: ReviewSession
  player: Player
  rolls: Rolls | null
  /** An image pasted while this card was the last one used. */
  incoming: File | null
  onIncomingTaken: () => void
  /** The card was touched or focused: it becomes the target of a pasted image. */
  onActivate: () => void
  t: Dict
  lang: Lang
}) {
  const revealed = session.revealed
  const { setCell, updatePlayer, removePlayer, setChoice } = useReview()
  const job = useJob(`review:${player.id}`)
  const [scanFile, setScanFile] = useState<File | null>(null)
  const drop = useImageDrop(setScanFile)
  useEffect(() => {
    if (!incoming) return
    setScanFile(incoming)
    onIncomingTaken()
  }, [incoming, onIncomingTaken])
  const [thumbs, setThumbs] = useState<Map<number, string>>(new Map())
  const filled = player.sheet.filter((v) => v !== EMPTY_CELL).length
  const complete = filled === map.n

  const rec = useMemo(
    () =>
      complete && rolls && !player.moves ? new SheetReconstructor(map, rolls, player.sheet) : null,
    [complete, rolls, player.sheet, player.moves, map],
  )
  const diagnosis = useMemo(() => {
    if (!rec) return null
    const d = rec.diagnose()
    return {
      ...d,
      orders: d.feasible ? rec.countOrders() : 0,
      // One compatible order taking the best links greedily (0 random samples).
      score: d.feasible ? (rec.sampleScores(0)[0] ?? null) : null,
    }
  }, [rec])
  const [ordering, setOrdering] = useState(false)
  /** After the analysis the sheet is folded away; editing it invalidates the analysis. */
  const [showSheet, setShowSheet] = useState(false)
  const known = player.choices.filter((c) => c !== null).length
  // Totals the sheet can have (rope links depend on the order): only for checking a paper count.
  const claimedSet = player.claimed !== null
  const range = useMemo(
    () => (claimedSet && rec && diagnosis?.feasible ? rec.sampleScores(96, 7) : null),
    [claimedSet, rec, diagnosis],
  )

  const key = playerKey(session, player)
  const review = player.review?.key === key ? player.review : null
  const turns = useMemo(() => review?.turns.map(restoreTurn) ?? [], [review])
  const states = useMemo<State[] | null>(() => {
    if (!rolls || turns.length === 0) return null
    try {
      return lineStates(
        map,
        rolls,
        turns.map((r) => r.played),
      )
    } catch {
      return null
    }
  }, [rolls, turns, map])
  const finalScore =
    states && turns.length === map.n
      ? currentScore(map, states[map.n])
      : player.moves && complete && rolls
        ? recordedScore(map, rolls, player.moves)
        : (diagnosis?.score ?? null)
  const h =
    session.hindsight?.key === diceKey(session.mapId, session.dice) ? session.hindsight : null
  const sherpa =
    session.sherpa?.key === diceKey(session.mapId, session.dice) ? session.sherpa : null

  const errors = diagnosis
    ? [...diagnosis.impossible, ...diagnosis.unmatched, ...diagnosis.suspects]
    : []
  const message = !diagnosis
    ? null
    : diagnosis.feasible
      ? `${t.sheetOk} ${t.orders(diagnosis.orders)}`
      : diagnosis.impossible.length > 0
        ? t.sheetImpossible
        : diagnosis.unmatched.length > 0
          ? t.sheetSurplus
          : diagnosis.suspects.length > 0
            ? t.sheetOrder
            : t.sheetUnknown
  const canAnalyse = rolls !== null && complete && (player.moves !== null || diagnosis?.feasible)

  return (
    <section
      className={`${card} flex flex-col gap-3 ${drop.over ? DROP_RING : ''}`}
      aria-label={player.name}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      {...drop.handlers}
    >
      <div className="flex items-center gap-2">
        <input
          value={player.name}
          onChange={(e) => updatePlayer(player.id, { name: e.target.value })}
          aria-label={t.name}
          className="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 py-1 text-lg font-semibold focus:border-line"
        />
        {finalScore !== null && <span className="text-2xl font-bold">{finalScore}</span>}
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t.confirmRemove(player.name))) removePlayer(player.id)
          }}
          className="text-sm text-muted underline underline-offset-2"
        >
          {t.removePlayer}
        </button>
      </div>

      {(!revealed || !review?.done || showSheet) && (
        <>
          <PhotoSource subject={`${t.scanSheet} (${player.name})`} onFile={setScanFile} t={t} />
          <p className="text-sm text-muted">
            {complete ? t.cellsFilled(filled, map.n) : t.tapCellToWrite}
          </p>
          <SheetEditor
            map={map}
            sheet={player.sheet}
            doubts={player.doubts}
            errors={errors}
            thumbs={thumbs}
            onSet={(cell, value) => setCell(player.id, cell, value)}
            t={t}
          />
          {!complete && <p className="text-sm text-muted">{t.cellsFilled(filled, map.n)}</p>}
          {message && (
            <p
              className={`text-sm font-medium ${diagnosis?.feasible ? 'text-best' : 'text-far'}`}
              role="status"
            >
              {message}
            </p>
          )}
          {rec &&
            rolls &&
            diagnosis?.feasible &&
            !job.running &&
            !job.queued &&
            (ordering ? (
              <OrderEntry
                map={map}
                rolls={rolls}
                rec={rec}
                sheet={player.sheet}
                initial={player.choices}
                onDone={(choices) => {
                  updatePlayer(player.id, { choices })
                  setOrdering(false)
                }}
                onCancel={() => setOrdering(false)}
                t={t}
              />
            ) : (
              <div className="flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => setOrdering(true)}
                  className={`${secondary} self-start`}
                >
                  {t.orderButton}
                </button>
                <p className="text-xs text-muted">
                  {known > 0 ? t.orderKnown(known, map.n) : t.orderWhy}
                </p>
              </div>
            ))}
        </>
      )}

      {revealed && (job.running || job.queued) && (
        <Progress
          value={job.progress}
          label={job.queued ? t.waiting : t.analysing(Math.min(turns.length + 1, map.n), map.n)}
        />
      )}

      {revealed &&
        states &&
        turns.length > 0 &&
        turns.some((r) => !r.confirmed && r.alternatives.length > 0) && (
          <p className="rounded-lg bg-bg p-2 text-xs text-muted">{t.indicative}</p>
        )}
      {revealed && states && turns.length > 0 && (
        <PlayerReport
          map={map}
          turns={turns}
          states={states}
          score={finalScore ?? currentScore(map, states[states.length - 1])}
          sherpa={sherpa?.score ?? null}
          max={h?.score ?? null}
          onChoose={
            player.moves
              ? undefined
              : (turn, move) => {
                  setChoice(player.id, turn, move)
                  startReview(player.id, turn)
                }
          }
          t={t}
          lang={lang}
        />
      )}

      {finalScore !== null && (
        <label className="flex items-center justify-between gap-2 text-sm">
          <span className="text-muted">{t.claimed}</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              inputMode="numeric"
              value={player.claimed ?? ''}
              onChange={(e) =>
                updatePlayer(player.id, {
                  claimed: e.target.value === '' ? null : Number(e.target.value),
                })
              }
              className="w-20 rounded-lg border border-line bg-bg px-2 py-1.5 text-right text-base"
            />
          </span>
        </label>
      )}
      {finalScore !== null && player.claimed !== null && (
        <CountCheck claimed={player.claimed} score={finalScore} range={range} t={t} />
      )}

      {revealed && !job.running && !job.queued && (
        <div className="flex flex-wrap gap-2">
          {!review?.done ? (
            <button
              type="button"
              onClick={() => startReview(player.id, review ? review.turns.length : 0)}
              disabled={!canAnalyse}
              className={primary}
            >
              {review && review.turns.length > 0 ? t.resumeReview : t.analyseGame}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowSheet((v) => !v)}
              aria-expanded={showSheet}
              className={secondary}
            >
              {showSheet ? t.hideSheet : t.showSheet}
            </button>
          )}
        </div>
      )}

      {scanFile && (
        <SheetScan
          file={scanFile}
          map={map}
          t={t}
          onCancel={() => setScanFile(null)}
          onDone={(values, doubts, crops) => {
            updatePlayer(player.id, {
              sheet: values,
              doubts,
              moves: null,
              choices: player.choices.map(() => null),
            })
            setThumbs(crops)
            setScanFile(null)
          }}
        />
      )}
    </section>
  )
}

export function ReviewPage() {
  const lang = useStore((s) => s.lang)
  const t = DICT[lang]
  const session = useReview((s) => s.session)
  const { setMap, setDie, setDice, addPlayer, reset } = useReview()
  const [diceFile, setDiceFile] = useState<File | null>(null)
  const [thumbs, setThumbs] = useState<Thumbs>(new Map())
  const diceDrop = useImageDrop(setDiceFile)
  // A pasted image goes to the last section used: the dice log, or a player's sheet.
  const pasteTarget = useRef('dice')
  const [pasted, setPasted] = useState<{ id: string; file: File } | null>(null)
  const takePasted = useCallback(() => setPasted(null), [])
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const file = imageFrom(e.clipboardData)
      if (!file) return
      e.preventDefault()
      const id = pasteTarget.current
      if (useReview.getState().session.players.some((p) => p.id === id)) setPasted({ id, file })
      else setDiceFile(file)
    }
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
  }, [])

  const map = useMemo(() => {
    const def = getMapDef(session.mapId) ?? MAPS[0]
    return compileMap(def)
  }, [session.mapId])
  const dice = completeDice(session.dice)
  const rollsKey = dice ? dice.map((d) => `${d.y}${d.r}`).join('') : null
  // biome-ignore lint/correctness/useExhaustiveDependencies: recomputed only when the dice change
  const rolls = useMemo(() => (dice ? rollsOf(dice) : null), [rollsKey])
  const filled = session.dice.filter((d) => d.y !== null && d.r !== null).length

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 pt-3 pb-48">
      <header className="flex items-center justify-between gap-2">
        <a
          className="text-sm font-medium underline underline-offset-2"
          href={href({ name: 'home' })}
        >
          {t.home}
        </a>
        <h1 className="text-lg font-semibold">{t.analysisTitle}</h1>
        <button
          type="button"
          onClick={() => {
            if (window.confirm(t.confirmNewAnalysis)) {
              reset()
              setThumbs(new Map())
            }
          }}
          className="text-sm font-medium underline underline-offset-2"
        >
          {t.newAnalysis}
        </button>
      </header>

      <section aria-labelledby="sheet-h">
        <h2 id="sheet-h" className="mb-1.5 text-sm text-muted">
          {t.sheet}
        </h2>
        <div className="flex gap-2">
          {MAPS.filter((m) => m.status !== 'practice').map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => m.id !== session.mapId && setMap(m.id)}
              aria-pressed={m.id === session.mapId}
              className={`flex-1 rounded-lg border px-2 py-2 text-sm font-semibold ${
                m.id === session.mapId
                  ? 'border-accent bg-accent text-accent-ink'
                  : 'border-line bg-surface'
              }`}
            >
              {m.name} <span className="font-normal opacity-80">{m.summit}+</span>
            </button>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="dice-h"
        className={`flex flex-col gap-2 ${diceDrop.over ? DROP_RING : ''}`}
        onPointerDownCapture={() => {
          pasteTarget.current = 'dice'
        }}
        onFocusCapture={() => {
          pasteTarget.current = 'dice'
        }}
        {...diceDrop.handlers}
      >
        <h2 id="dice-h" className="font-semibold">
          {t.rolls} <span className="font-normal text-muted">{t.rollsCount(filled)}</span>
        </h2>
        <PhotoSource subject={t.scanDice} onFile={setDiceFile} t={t} />
        <DiceLog
          dice={session.dice}
          doubts={session.diceDoubts}
          thumbs={thumbs}
          onDie={setDie}
          onText={(d) => setDice(d)}
          t={t}
        />
      </section>

      {session.revealed && (
        <>
          <ResultsCard map={map} session={session} rolls={rolls} t={t} lang={lang} />
          <MaxCard map={map} session={session} rolls={rolls} t={t} />
          <SherpaCard map={map} session={session} rolls={rolls} t={t} />
        </>
      )}

      <section aria-labelledby="players-h" className="flex flex-col gap-3">
        <div>
          <h2 id="players-h" className="font-semibold">
            {t.players}
          </h2>
          <p className="text-sm text-muted">{t.playersHint}</p>
        </div>
        {session.players.map((p) => (
          <PlayerCard
            key={p.id}
            map={map}
            session={session}
            player={p}
            rolls={rolls}
            incoming={pasted?.id === p.id ? pasted.file : null}
            onIncomingTaken={takePasted}
            onActivate={() => {
              pasteTarget.current = p.id
            }}
            t={t}
            lang={lang}
          />
        ))}
        <button
          type="button"
          onClick={() => addPlayer(t.playerN(session.players.length + 1))}
          className="rounded-xl border-2 border-dashed border-line px-3 py-3 font-semibold"
        >
          + {t.addPlayer}
        </button>
      </section>

      {!session.revealed && <RevealPanel map={map} session={session} rolls={rolls} t={t} />}

      {diceFile && (
        <DiceScan
          file={diceFile}
          t={t}
          onCancel={() => setDiceFile(null)}
          onDone={(read, doubts, crops) => {
            setDice(read, doubts)
            setThumbs(crops)
            setDiceFile(null)
          }}
        />
      )}
    </main>
  )
}
