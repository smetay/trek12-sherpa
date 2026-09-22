import { compileMap, getMapDef } from '@trek12/engine'
import { useMemo, useState } from 'react'
import { MapSvg } from '../components/MapSvg.tsx'
import { href } from '../lib/router.ts'

type Verdict = 'ok' | 'ko'
type Checklist = Record<number, Verdict>

const storageKey = (mapId: string, rev: number) => `sherpa.verify.${mapId}.${rev}`

function loadChecklist(key: string): Checklist {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as Checklist) : {}
  } catch {
    return {}
  }
}

function saveChecklist(key: string, list: Checklist) {
  try {
    localStorage.setItem(key, JSON.stringify(list))
  } catch {
    // storage may be unavailable (private mode); the page still works
  }
}

/**
 * Map verification: tap a circle, its neighbours light up; compare with the physical sheet and
 * mark each circle OK / wrong. The report can be copied into a GitHub issue.
 */
export function VerifyMapPage({ mapId }: { mapId: string }) {
  const def = getMapDef(mapId)
  const map = useMemo(() => (def ? compileMap(def) : undefined), [def])
  const key = def ? storageKey(def.id, def.rev) : ''
  const [selected, setSelected] = useState<number | null>(null)
  const [checklist, setChecklist] = useState<Checklist>(() => (def ? loadChecklist(key) : {}))
  const [copied, setCopied] = useState(false)

  if (!def || !map) {
    return (
      <main className="mx-auto max-w-md px-4 py-8">
        <p>Carte inconnue : {mapId}</p>
        <a className="underline" href={href({ name: 'home' })}>
          Retour
        </a>
      </main>
    )
  }

  const neighbours = (id: number) =>
    Array.from(map.nbrList.subarray(map.nbrStart[id], map.nbrStart[id + 1]))
  const setVerdict = (id: number, verdict: Verdict) => {
    const next = { ...checklist, [id]: verdict }
    setChecklist(next)
    saveChecklist(key, next)
  }
  const done = Object.keys(checklist).length
  const wrong = Object.entries(checklist)
    .filter(([, v]) => v === 'ko')
    .map(([id]) => Number(id))

  const report = [
    `Map ${def.id} rev ${def.rev} (${def.status}) — ${done}/${def.cells.length} circles checked`,
    wrong.length === 0 ? 'All checked circles OK.' : `Circles reported wrong: ${wrong.join(', ')}`,
  ].join('\n')

  const copyReport = async () => {
    try {
      await navigator.clipboard.writeText(report)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable: the report is visible on screen anyway
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-4 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">
          Vérifier {def.name}{' '}
          <span className="text-sm font-normal text-slate-400">
            rev {def.rev} · {def.status}
          </span>
        </h1>
        <a className="text-sm underline" href={href({ name: 'home' })}>
          Accueil
        </a>
      </header>

      <p className="text-sm text-slate-300">
        Touche une case : ses voisines s'allument. Compare avec la fiche papier (les cases à double
        contour sont les cases dangereuses), puis note chaque case.
      </p>

      <MapSvg
        map={def}
        showIds
        className="w-full rounded-2xl bg-slate-900"
        onCellClick={(id) => setSelected(id === selected ? null : id)}
        highlightEdges={selected === null ? [] : neighbours(selected).map((n) => [selected, n])}
        cells={(id) => {
          if (selected === null) {
            return {
              fill:
                checklist[id] === 'ok' ? '#14532d' : checklist[id] === 'ko' ? '#7f1d1d' : undefined,
            }
          }
          if (id === selected) return { fill: '#b45309', stroke: '#fbbf24' }
          if (neighbours(selected).includes(id)) return { fill: '#334155', stroke: '#fbbf24' }
          return { dim: true }
        }}
      />

      {selected !== null && (
        <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4">
          <p className="text-sm">
            Case <strong>{selected}</strong>
            {def.cells[selected].max < 12 ? ' (dangereuse, max 6)' : ''} touche :{' '}
            <strong>{neighbours(selected).join(', ')}</strong>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => setVerdict(selected, 'ok')}
              className="flex-1 rounded-xl bg-emerald-600 px-3 py-3 font-semibold text-white active:bg-emerald-500"
            >
              Correct
            </button>
            <button
              type="button"
              onClick={() => setVerdict(selected, 'ko')}
              className="flex-1 rounded-xl bg-rose-700 px-3 py-3 font-semibold text-white active:bg-rose-600"
            >
              Erreur
            </button>
          </div>
        </section>
      )}

      <section className="rounded-2xl border border-slate-700 bg-slate-800/60 p-4 text-sm">
        <p>
          {done}/{def.cells.length} cases vérifiées
          {wrong.length > 0 && ` · erreurs signalées : ${wrong.join(', ')}`}
        </p>
        <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-950 p-2 text-xs text-slate-300">
          {report}
        </pre>
        <button
          type="button"
          onClick={copyReport}
          className="mt-2 w-full rounded-xl border border-slate-600 px-3 py-2 font-medium active:bg-slate-700"
        >
          {copied ? 'Copié !' : 'Copier le rapport'}
        </button>
      </section>
    </main>
  )
}
