import { SOLVER_VERSION } from '@trek12/solver'
import { useState } from 'react'
import { type PingResult, pingWorker } from './lib/workerClient.ts'
import { ReloadPrompt } from './ReloadPrompt.tsx'

type PingState =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'ok'; result: PingResult }
  | { kind: 'error'; message: string }

export function App() {
  const [ping, setPing] = useState<PingState>({ kind: 'idle' })

  const runPing = async () => {
    setPing({ kind: 'busy' })
    try {
      setPing({ kind: 'ok', result: await pingWorker() })
    } catch (error) {
      setPing({ kind: 'error', message: error instanceof Error ? error.message : String(error) })
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4 py-8">
      <header className="flex items-center gap-3">
        <img src="logo.svg" alt="" className="size-12 rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trek12 Sherpa</h1>
          <p className="text-sm text-slate-400">Conseiller de coups non officiel pour Trek 12</p>
        </div>
      </header>

      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
        <h2 className="text-base font-medium">Chantier en cours</h2>
        <p className="mt-1 text-sm text-slate-300">
          Le moteur de règles et le solveur arrivent dans les prochains jalons. Cette page vérifie
          seulement que l'application s'installe, fonctionne hors-ligne et peut calculer en
          arrière-plan.
        </p>
        <button
          type="button"
          onClick={runPing}
          disabled={ping.kind === 'busy'}
          className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-3 text-base font-semibold text-slate-950 active:bg-amber-400 disabled:opacity-50"
        >
          Tester le calcul en arrière-plan
        </button>
        <p className="mt-3 min-h-6 text-sm text-slate-300" aria-live="polite">
          {ping.kind === 'busy' && 'Envoi au worker…'}
          {ping.kind === 'ok' &&
            `Réponse du worker en ${ping.result.roundTripMs.toFixed(1)} ms (moteur ${ping.result.engineVersion}).`}
          {ping.kind === 'error' && `Erreur : ${ping.message}`}
        </p>
      </section>

      <footer className="text-center text-xs text-slate-500">
        solveur {SOLVER_VERSION} ·{' '}
        <a
          className="underline decoration-slate-600 underline-offset-2"
          href="https://github.com/smetay/trek12-sherpa"
        >
          code source
        </a>
      </footer>

      <ReloadPrompt />
    </main>
  )
}
