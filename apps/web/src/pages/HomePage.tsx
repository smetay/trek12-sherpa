import { MAPS } from '@trek12/engine'
import { SOLVER_VERSION } from '@trek12/solver'
import { MapSvg } from '../components/MapSvg.tsx'
import { DICT } from '../lib/i18n.ts'
import { href } from '../lib/router.ts'
import { useStore } from '../lib/store.ts'

export function HomePage() {
  const lang = useStore((s) => s.lang)
  const record = useStore((s) => s.record)
  const startGame = useStore((s) => s.startGame)
  const t = DICT[lang]
  const currentMap = record ? MAPS.find((m) => m.id === record.mapId) : undefined
  const inProgress = record !== null && record.history.length > 0 && record.history.length < 19

  const start = (mapId: string) => {
    if (inProgress && !window.confirm(t.confirmAbandon)) return
    startGame(mapId)
    window.location.hash = href({ name: 'play' })
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-6 px-4 py-8">
      <header className="flex items-center gap-3">
        <img src="logo.svg" alt="" className="size-12 rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.appName}</h1>
          <p className="text-sm text-slate-400">{t.tagline}</p>
        </div>
      </header>

      {inProgress && currentMap && (
        <a
          href={href({ name: 'play' })}
          className="block rounded-2xl bg-amber-500 px-4 py-3 text-center text-base font-semibold text-slate-950 active:bg-amber-400"
        >
          {t.resume} · {currentMap.name} · {t.turn} {record.history.length + 1}/19
        </a>
      )}

      <section>
        <h2 className="mb-2 text-base font-medium">{t.newGame}</h2>
        <ul className="grid grid-cols-2 gap-3">
          {MAPS.filter((m) => m.status !== 'practice').map((map) => (
            <li key={map.id}>
              <button
                type="button"
                onClick={() => start(map.id)}
                className="block w-full rounded-2xl border border-slate-700 bg-slate-800/60 p-3 text-left active:bg-slate-700"
              >
                <MapSvg map={map} className="w-full" />
                <p className="mt-2 font-medium">{map.name}</p>
                <p className="text-xs text-slate-400">{map.summit}+</p>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <nav className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        {MAPS.filter((m) => m.status !== 'practice').map((map) => (
          <a
            key={map.id}
            className="underline decoration-slate-600 underline-offset-2"
            href={href({ name: 'verify', mapId: map.id })}
          >
            {t.verify} {map.name}
          </a>
        ))}
        <a
          className="underline decoration-slate-600 underline-offset-2"
          href={href({ name: 'settings' })}
        >
          {t.settings}
        </a>
        <a
          className="underline decoration-slate-600 underline-offset-2"
          href={href({ name: 'perf' })}
        >
          {t.perf}
        </a>
      </nav>

      <footer className="text-center text-xs text-slate-500">
        solveur {SOLVER_VERSION} ·{' '}
        <a
          className="underline decoration-slate-600 underline-offset-2"
          href="https://github.com/smetay/trek12-sherpa"
        >
          code source
        </a>
      </footer>
    </main>
  )
}
