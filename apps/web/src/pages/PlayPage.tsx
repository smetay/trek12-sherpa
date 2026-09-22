import {
  type CompiledMap,
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
  SAD,
  type State,
  scoreBreakdown,
} from '@trek12/engine'
import { useMemo, useState } from 'react'
import { AdviceList, HeatLegend, moveTitle } from '../components/AdviceList.tsx'
import { ChoiceTable } from '../components/ChoiceTable.tsx'
import { DiceChip, DiceInput } from '../components/DiceInput.tsx'
import { type CellVisual, MapSvg, wash } from '../components/MapSvg.tsx'
import { useAdvice } from '../lib/advice.ts'
import { lossText, pct } from '../lib/format.ts'
import { cellLabel, describeLinks, linksOf, useGame, viewMove } from '../lib/game.ts'
import { cellHeats, HEAT_COLOR } from '../lib/heat.ts'
import { DICT, type Dict } from '../lib/i18n.ts'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.ts'

const iconButton =
  'grid size-10 place-items-center rounded-lg border border-line text-lg disabled:opacity-35'

export function PlayPage() {
  const record = useStore((s) => s.record)
  const lang = useStore((s) => s.lang)
  const thinkMs = useStore((s) => s.thinkMs)
  const workers = useStore((s) => s.workers)
  const metric = useStore((s) => s.cellMetric)
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

  const heats = useMemo(() => cellHeats(advice.ranking, moveCell), [advice.ranking])

  if (!record || !game) {
    return (
      <main className="mx-auto flex max-w-md flex-col gap-3 px-4 py-8">
        <p>{t.noGame}</p>
        <a className="font-semibold underline" href={href({ name: 'home' })}>
          {t.newGame}
        </a>
      </main>
    )
  }
  const { map, state } = game
  if (over) return <EndScreen map={map} state={state} t={t} onUndo={undo} />

  const score = currentScore(map, state)
  const links = linksOf(map, state)
  const diceSet = y !== null && r !== null
  const measured = advice.ranking.filter((m) => m.exact || m.n > 0)
  const top = measured[0]
  const pickedBest = pickedCell === null ? undefined : heats.get(pickedCell)?.move
  const chosenMove = selected ?? pickedBest ?? top?.move ?? null
  const chosen =
    chosenMove !== null && legal.includes(chosenMove) ? viewMove(map, chosenMove) : null
  const results = diceSet
    ? Array.from({ length: OP_COUNT }, (_, op) => RESULTS[op * ROLL_COUNT + rollIndex(y, r)])
    : undefined
  const legalCells = new Set(legal.map(moveCell))
  const rows =
    pickedCell === null
      ? measured.slice(0, 3)
      : measured.filter((m) => moveCell(m.move) === pickedCell)

  const setDice = (ny: number | null, nr: number | null) => {
    setY(ny)
    setR(nr)
    setSelected(null)
    setPickedCell(null)
  }

  const commit = (move: number) => {
    if (y === null || r === null) return
    playEntry(entryFor(move, y, r))
    setDice(null, null)
  }

  const previewLinks: [number, number][] = chosen
    ? [chosen.down, chosen.up].filter((c) => c !== EMPTY).map((c) => [chosen.cell, c])
    : []

  const cellVisual = (id: number): CellVisual => {
    const v = state[map.oVal + id]
    if (v !== EMPTY) {
      const label = cellLabel(v)
      // Cells already in a zone get a light tint, like the shading players draw on the sheet.
      const inZone = v !== SAD && state[map.oZsize + state[map.oZid + id]] > 1
      return {
        label,
        fill: inZone ? wash('var(--cell-stroke)') : undefined,
        ariaLabel: `${t.cell} ${id} : ${label}`,
      }
    }
    if (!diceSet) return {}
    if (!legalCells.has(id)) return { dim: true }
    const isChosen = chosen?.cell === id
    const h = heats.get(id)
    if (!h) return { ring: isChosen, dashed: true, ariaLabel: `${t.cell} ${id}` }
    const shown = isChosen && chosen ? chosen : viewMove(map, h.move)
    const label = shown.sad ? '☹' : String(shown.result)
    const useSummit = metric === 'summit' && !h.exact
    const sub = useSummit
      ? pct(h.pSummit).replace(' ', '')
      : h.level === 'best'
        ? ''
        : lossText(h.loss, lang)
    const verdict = h.level === 'best' ? t.bestCell : `${lossText(h.loss, lang)} ${t.pts}`
    return {
      fill: wash(HEAT_COLOR[h.level]),
      stroke: HEAT_COLOR[h.level],
      label,
      sub,
      star: h.level === 'best',
      ring: isChosen,
      ariaLabel: `${t.cell} ${id} : ${label}, ${verdict}`,
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-3 px-4 pt-3 pb-32">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <a
          className="text-sm font-medium underline underline-offset-2"
          href={href({ name: 'home' })}
        >
          {t.home}
        </a>
        <div className="text-center leading-tight">
          <p className="font-semibold">{map.def.name}</p>
          <p className="text-sm text-muted">
            {t.turn} {Math.min(historyLength + 1, map.n)}/{map.n}
          </p>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          <p className="mr-1 text-right leading-tight">
            <span className="block text-xl font-bold">{score}</span>
            <span className="block text-xs text-muted">{t.pts}</span>
          </p>
          <button
            type="button"
            onClick={() => {
              undo()
              setDice(null, null)
            }}
            disabled={historyLength === 0}
            className={iconButton}
            aria-label={t.undo}
          >
            ↶
          </button>
          <button
            type="button"
            onClick={() => {
              redoMove()
              setDice(null, null)
            }}
            disabled={redoCount === 0}
            className={iconButton}
            aria-label={t.redo}
          >
            ↷
          </button>
        </div>
      </header>

      <MapSvg
        map={map.def}
        className="w-full rounded-2xl border border-line bg-surface"
        links={links}
        highlightEdges={previewLinks}
        onCellClick={(id) => {
          if (!legalCells.has(id)) return
          setPickedCell(id === pickedCell ? null : id)
          setSelected(null)
        }}
        cells={cellVisual}
      />

      {diceSet && heats.size > 0 && <HeatLegend t={t} />}

      {diceSet ? (
        <DiceChip
          y={y}
          r={r}
          label={t.dice}
          change={t.changeDice}
          onChange={() => setDice(null, null)}
        />
      ) : (
        <DiceInput y={y} r={r} onChange={setDice} labels={{ yellow: t.yellowDie, red: t.redDie }} />
      )}

      <ChoiceTable map={map} state={state} t={t} previewOp={chosen?.opIndex} results={results} />

      {!diceSet && <p className="text-center text-muted">{t.enterDice}</p>}

      {diceSet && (
        <section className="flex flex-col gap-1" aria-live="polite">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-semibold">
              {pickedCell === null ? t.topAdvice : `${t.otherOptions} ${pickedCell}`}
            </h2>
            <p className="text-sm text-muted">
              {advice.running
                ? t.thinking
                : advice.exact
                  ? t.exact
                  : `${advice.rounds} ${t.rounds}, ${Math.round(advice.elapsedMs)} ms`}
            </p>
          </div>
          {rows.length > 0 ? (
            <AdviceList
              map={map}
              state={state}
              rows={rows}
              top={top}
              selected={chosenMove}
              onSelect={setSelected}
              t={t}
              lang={lang}
            />
          ) : (
            <p className="py-2 text-muted">{t.thinking}</p>
          )}
          <div className="flex items-center justify-between gap-2 text-sm text-muted">
            <p>{pickedCell === null ? t.tapCell : ''}</p>
            <button
              type="button"
              onClick={() => setNonce((n) => n + 1)}
              className="shrink-0 underline underline-offset-2"
            >
              {t.reroll}
            </button>
          </div>
        </section>
      )}

      {chosen && (
        <div className="fixed inset-x-0 bottom-0 border-t border-line bg-surface/95 p-3 pb-[max(env(safe-area-inset-bottom),0.75rem)] backdrop-blur">
          <button
            type="button"
            onClick={() => commit(chosen.move)}
            className="mx-auto block w-full max-w-md rounded-xl bg-accent px-4 py-3 text-left text-accent-ink active:brightness-95"
          >
            <span className="block text-base font-bold">
              {t.play}
              {t.colon}
              {moveTitle(chosen, t)}
            </span>
            {(chosen.down !== EMPTY || chosen.up !== EMPTY) && (
              <span className="block text-sm">{describeLinks(chosen, state, map, t)}</span>
            )}
          </button>
        </div>
      )}
    </main>
  )
}

function EndScreen({
  map,
  state,
  t,
  onUndo,
}: {
  map: CompiledMap
  state: State
  t: Dict
  onUndo: () => void
}) {
  const b = scoreBreakdown(map, state)
  const reached = b.total >= map.def.summit
  const sum = (xs: number[]) => (xs.length > 0 ? xs.join(' + ') : '0')
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{t.gameOver}</h1>
        <a
          className="text-sm font-medium underline underline-offset-2"
          href={href({ name: 'home' })}
        >
          {t.home}
        </a>
      </header>
      <MapSvg
        map={map.def}
        className="w-full rounded-2xl border border-line bg-surface"
        links={linksOf(map, state)}
        cells={(id) => ({ label: cellLabel(state[map.oVal + id]) })}
      />
      <section className="rounded-2xl border border-line bg-surface p-4">
        <p className="text-4xl font-bold">
          {b.total} <span className="text-base font-normal text-muted">/ {map.def.summit}</span>
        </p>
        <p
          className="font-semibold"
          style={{ color: reached ? 'var(--heat-best)' : 'var(--muted)' }}
        >
          {reached ? t.summitReached : t.summitMissed}
        </p>
        <dl className="mt-3 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1">
          <dt>{t.chains}</dt>
          <dd className="text-right">
            {sum(b.chains.map((c) => c.points))} + {b.chainBonus}
          </dd>
          <dt>{t.zones}</dt>
          <dd className="text-right">
            {sum(b.zones.map((z) => z.points))} + {b.zoneBonus}
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
          onClick={onUndo}
          className="flex-1 rounded-xl border border-line px-3 py-3 font-medium"
        >
          {t.undo}
        </button>
        <a
          href={href({ name: 'home' })}
          className="flex-1 rounded-xl bg-accent px-3 py-3 text-center font-bold text-accent-ink"
        >
          {t.newGame}
        </a>
      </div>
    </main>
  )
}
