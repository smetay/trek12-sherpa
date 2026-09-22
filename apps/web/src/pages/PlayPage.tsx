import {
  currentScore,
  EMPTY,
  entryFor,
  generateMoves,
  isGameOver,
  MAX_MOVES,
  moveCell,
  OP_COUNT,
  RESULTS,
  ROLL_COUNT,
  rollIndex,
  scoreBreakdown,
} from '@trek12/engine'
import { useMemo, useState } from 'react'
import { AdviceList, moveTitle } from '../components/AdviceList.tsx'
import { ChoiceTable } from '../components/ChoiceTable.tsx'
import { DiceInput } from '../components/DiceInput.tsx'
import { MapSvg } from '../components/MapSvg.tsx'
import { useAdvice } from '../lib/advice.ts'
import { cellLabel, describeLinks, linksOf, useGame, viewMove } from '../lib/game.ts'
import { DICT } from '../lib/i18n.ts'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.ts'

export function PlayPage() {
  const record = useStore((s) => s.record)
  const lang = useStore((s) => s.lang)
  const thinkMs = useStore((s) => s.thinkMs)
  const workers = useStore((s) => s.workers)
  const playEntry = useStore((s) => s.playEntry)
  const undo = useStore((s) => s.undo)
  const redoMove = useStore((s) => s.redoMove)
  const redoCount = useStore((s) => s.redo.length)
  const t = DICT[lang]
  const game = useGame(record)

  const [y, setY] = useState<number | null>(null)
  const [r, setR] = useState<number | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [pickedCell, setPickedCell] = useState<number | null>(null)
  const [nonce, setNonce] = useState(0)

  const historyLength = record?.history.length ?? 0
  const over = game ? isGameOver(game.map, game.state) : false
  const advice = useAdvice(game?.map, game?.state, historyLength, y, r, thinkMs, workers, nonce)

  // Every legal move for the current dice (the advisor ranks exactly these).
  const legal = useMemo(() => {
    if (!game || y === null || r === null || over) return []
    const out = new Int32Array(MAX_MOVES)
    const count = generateMoves(game.map, game.state, y, r, out)
    return Array.from(out.subarray(0, count))
  }, [game, y, r, over])

  if (!record || !game) {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <p>{t.newGame} ?</p>
        <a className="underline" href={href({ name: 'home' })}>
          {t.home}
        </a>
      </main>
    )
  }
  const { map, state } = game
  const score = currentScore(map, state)
  const links = linksOf(map, state)
  const best = advice.ranking.find((m) => m.exact || m.n > 0)
  const chosenMove = selected ?? best?.move ?? null
  const chosen =
    chosenMove !== null && legal.includes(chosenMove) ? viewMove(map, chosenMove) : null
  const results =
    y !== null && r !== null
      ? Array.from({ length: OP_COUNT }, (_, op) => RESULTS[op * ROLL_COUNT + rollIndex(y, r)])
      : undefined
  const legalCells = new Set(legal.map(moveCell))
  const movesInPicked = pickedCell === null ? [] : legal.filter((m) => moveCell(m) === pickedCell)
  const rankOf = (move: number) => advice.ranking.find((m) => m.move === move)

  const commit = (move: number) => {
    if (y === null || r === null) return
    playEntry(entryFor(move, y, r))
    setY(null)
    setR(null)
    setSelected(null)
    setPickedCell(null)
  }

  const onDice = (ny: number | null, nr: number | null) => {
    setY(ny)
    setR(nr)
    setSelected(null)
    setPickedCell(null)
  }

  const previewLinks: [number, number][] = chosen
    ? ([chosen.down, chosen.up].filter((c) => c !== EMPTY).map((c) => [chosen.cell, c]) as [
        number,
        number,
      ][])
    : []

  if (over) {
    const b = scoreBreakdown(map, state)
    const reached = b.total >= map.def.summit
    return (
      <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
        <header className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">{t.gameOver}</h1>
          <a className="text-sm underline" href={href({ name: 'home' })}>
            {t.home}
          </a>
        </header>
        <MapSvg
          map={map.def}
          className="w-full rounded-2xl bg-slate-900"
          links={links}
          cells={(id) => ({ label: cellLabel(state[map.oVal + id]) })}
        />
        <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 text-sm">
          <p className="text-3xl font-bold tabular-nums">
            {b.total}{' '}
            <span className="text-base font-normal text-slate-400">/ {map.def.summit}+</span>
          </p>
          <p className={reached ? 'text-emerald-300' : 'text-slate-400'}>
            {reached ? t.summitReached : t.summitMissed}
          </p>
          <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 tabular-nums">
            <dt>{t.chains}</dt>
            <dd className="text-right">
              {b.chains.map((c) => c.points).join(' + ') || 0} + {b.chainBonus}
            </dd>
            <dt>{t.zones}</dt>
            <dd className="text-right">
              {b.zones.map((z) => z.points).join(' + ') || 0} + {b.zoneBonus}
            </dd>
            <dt>{t.penalty}</dt>
            <dd className="text-right">
              −{b.penalty} ({b.sadCells.length} ☹, {b.orphanCells.length} {t.orphans})
            </dd>
          </dl>
        </section>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={undo}
            className="flex-1 rounded-xl border border-slate-600 px-3 py-3 font-medium"
          >
            {t.undo}
          </button>
          <a
            href={href({ name: 'home' })}
            className="flex-1 rounded-xl bg-amber-500 px-3 py-3 text-center font-semibold text-slate-950"
          >
            {t.newGame}
          </a>
        </div>
      </main>
    )
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pt-4 pb-28">
      <header className="flex items-center justify-between">
        <a className="text-sm underline" href={href({ name: 'home' })}>
          {t.home}
        </a>
        <p className="text-sm">
          <span className="font-semibold">{map.def.name}</span> · {t.turn} {historyLength + 1}/
          {map.n} · {t.score} <span className="tabular-nums">{score}</span>
        </p>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => {
              undo()
              onDice(null, null)
            }}
            disabled={historyLength === 0}
            className="rounded-lg border border-slate-600 px-2 py-1 text-sm disabled:opacity-40"
            aria-label={t.undo}
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => {
              redoMove()
              onDice(null, null)
            }}
            disabled={redoCount === 0}
            className="rounded-lg border border-slate-600 px-2 py-1 text-sm disabled:opacity-40"
            aria-label={t.redo}
          >
            ↷
          </button>
        </div>
      </header>

      <MapSvg
        map={map.def}
        className="w-full rounded-2xl bg-slate-900"
        links={links}
        highlightEdges={previewLinks}
        onCellClick={(id) => {
          if (!legalCells.has(id)) return
          setPickedCell(id === pickedCell ? null : id)
          setSelected(null)
        }}
        cells={(id) => {
          const v = state[map.oVal + id]
          if (v !== EMPTY) return { label: cellLabel(v), fill: '#1e293b' }
          if (chosen && chosen.cell === id) {
            return {
              label: chosen.sad ? '☹' : String(chosen.result),
              fill: '#b45309',
              stroke: '#fbbf24',
              dashed: true,
            }
          }
          if (pickedCell === id) return { fill: '#334155', stroke: '#fbbf24' }
          if (y !== null && r !== null && legalCells.has(id))
            return { fill: '#0f172a', stroke: '#64748b' }
          return { fill: '#0f172a', dim: y !== null && r !== null }
        }}
      />

      <ChoiceTable map={map} state={state} t={t} previewOp={chosen?.opIndex} results={results} />

      <DiceInput y={y} r={r} onChange={onDice} labels={{ yellow: t.yellowDie, red: t.redDie }} />

      {y !== null && r !== null && (
        <section className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-medium">
              {t.advice}{' '}
              {advice.running && <span className="ml-2 text-xs text-amber-300">{t.thinking}</span>}
              {!advice.running && advice.ranking.length > 0 && (
                <span className="ml-2 text-xs text-slate-400">
                  {advice.exact
                    ? t.exact
                    : `${advice.rounds} × · ${Math.round(advice.elapsedMs)} ms`}
                </span>
              )}
            </h2>
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="text-xs underline"
            >
              {t.reroll}
            </button>
          </div>
          {pickedCell === null ? (
            <AdviceList
              map={map}
              state={state}
              ranking={advice.ranking}
              running={advice.running}
              selected={chosenMove}
              onSelect={setSelected}
              t={t}
            />
          ) : (
            <ol className="flex flex-col gap-1.5">
              {movesInPicked.map((m) => {
                const v = viewMove(map, m)
                const rk = rankOf(m)
                const isSel = selected === m
                return (
                  <li key={m}>
                    <button
                      type="button"
                      onClick={() => setSelected(m)}
                      aria-pressed={isSel}
                      className={`w-full rounded-xl border px-3 py-2 text-left ${isSel ? 'border-amber-400 bg-amber-400/10' : 'border-slate-700 bg-slate-800/60'}`}
                    >
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="font-semibold">
                          {t.options[v.op]} {t.opShort[v.op]} {v.sad ? '☹' : v.result}
                        </span>
                        {rk && (rk.exact || rk.n > 0) && (
                          <span
                            className={`text-sm tabular-nums ${rk.tied ? 'text-emerald-300' : 'text-slate-300'}`}
                          >
                            {rk.tied ? t.tied : `${rk.diff.toFixed(1)} ${t.vsBest}`}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {describeLinks(v, state, map, t) || (v.sad ? t.sad : t.noLink)}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ol>
          )}
          <p className="text-xs text-slate-500">{t.manual}</p>
        </section>
      )}
      {y === null || r === null ? (
        <p className="text-center text-sm text-slate-400">{t.enterDice}</p>
      ) : null}

      {chosen && (
        <div className="fixed inset-x-0 bottom-0 border-t border-slate-800 bg-slate-950/95 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
          <button
            type="button"
            onClick={() => commit(chosen.move)}
            className="mx-auto block w-full max-w-md rounded-xl bg-amber-500 px-4 py-3 text-base font-semibold text-slate-950 active:bg-amber-400"
          >
            {t.play} : {moveTitle(chosen, t)}
            {chosen.down !== EMPTY || chosen.up !== EMPTY
              ? ` (${describeLinks(chosen, state, map, t)})`
              : ''}
          </button>
        </div>
      )}
    </main>
  )
}
