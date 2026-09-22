import { useState } from 'react'
import { href } from '../lib/router.ts'
import type { PerfRequest, PerfResult } from '../worker/messages.ts'
import PerfWorker from '../worker/perf.worker.ts?worker'

type Row = { policy: string; perSecond: number; meanScore: number }

/** Throughput probe on this device: heuristic rollouts per second from a mid-game Kagkot position. */
export function PerfPage() {
  const [rows, setRows] = useState<Row[]>([])
  const [running, setRunning] = useState(false)
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 0) : 0

  const run = () => {
    setRows([])
    setRunning(true)
    const worker = new PerfWorker()
    worker.onmessage = (e: MessageEvent<PerfResult>) => {
      if (e.data.t === 'done') {
        setRunning(false)
        worker.terminate()
        return
      }
      const { policy, perSecond, meanScore } = e.data
      setRows((prev) => [...prev, { policy, perSecond, meanScore }])
    }
    worker.onerror = () => {
      setRunning(false)
      worker.terminate()
    }
    const req: PerfRequest = {
      mapId: 'kagkot',
      policies: ['random', 'greedy', 'heuristic'],
      budgetMs: 2000,
    }
    worker.postMessage(req)
  }

  const heuristic = rows.find((r) => r.policy === 'heuristic')
  const report = rows.map((r) => `${r.policy}: ${Math.round(r.perSecond)} rollouts/s`).join(' · ')

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">Performance</h1>
        <a className="text-sm underline" href={href({ name: 'home' })}>
          Accueil
        </a>
      </header>
      <p className="text-sm text-slate-300">
        Mesure la vitesse de simulation de cet appareil (parties jouées jusqu'au bout depuis une
        position de milieu de partie sur Kagkot, ~2 s par politique, dans un worker).
        {cores > 0 && ` Cœurs annoncés : ${cores}.`}
      </p>
      <button
        type="button"
        onClick={run}
        disabled={running}
        className="w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-semibold text-slate-950 active:bg-amber-400 disabled:opacity-50"
      >
        {running ? 'Mesure en cours…' : 'Lancer la mesure'}
      </button>
      {rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-400">
              <th className="py-1">Politique</th>
              <th className="py-1 text-right">Rollouts/s</th>
              <th className="py-1 text-right">Score moyen</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.policy} className="border-t border-slate-700">
                <td className="py-1">{r.policy}</td>
                <td className="py-1 text-right tabular-nums">
                  {Math.round(r.perSecond).toLocaleString('fr-FR')}
                </td>
                <td className="py-1 text-right tabular-nums">{r.meanScore.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {heuristic && (
        <p className="text-sm">
          {heuristic.perSecond >= 3000
            ? `✅ ${Math.round(heuristic.perSecond)} rollouts/s heuristiques : au-dessus de l'objectif de 3 000 par worker.`
            : `⚠️ ${Math.round(heuristic.perSecond)} rollouts/s heuristiques : sous l'objectif de 3 000, à simplifier.`}
        </p>
      )}
      {rows.length > 0 && !running && (
        <pre className="whitespace-pre-wrap rounded-lg bg-slate-950 p-2 text-xs text-slate-300">
          {report}
        </pre>
      )}
    </main>
  )
}
