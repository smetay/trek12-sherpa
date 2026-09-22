import { isGameRecord } from '@trek12/engine'
import { useState } from 'react'
import { DICT, type Lang } from '../lib/i18n.ts'
import { href } from '../lib/router.ts'
import { defaultPoolSize } from '../lib/solverPool.ts'
import { useStore } from '../lib/store.ts'

const THINK = [500, 1000, 1500, 2500, 4000]

export function SettingsPage() {
  const { lang, thinkMs, workers, record, setLang, setThinkMs, setWorkers, importRecord, abandon } =
    useStore()
  const t = DICT[lang]
  const [copied, setCopied] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState(false)

  const exportGame = async () => {
    if (!record) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(record))
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable: the JSON is shown below instead
    }
  }

  const doImport = () => {
    try {
      const parsed: unknown = JSON.parse(importText)
      if (isGameRecord(parsed) && importRecord(parsed)) {
        setImportError(false)
        setImportText('')
        window.location.hash = href({ name: 'play' })
        return
      }
    } catch {
      // fall through
    }
    setImportError(true)
  }

  const seg = (active: boolean) =>
    `flex-1 rounded-lg px-2 py-2 text-sm font-medium ${active ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-200'}`

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-4 py-6">
      <header className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold">{t.settings}</h1>
        <a className="text-sm underline" href={href({ name: 'home' })}>
          {t.home}
        </a>
      </header>

      <section>
        <h2 className="mb-2 text-sm text-slate-400">{t.language}</h2>
        <div className="flex gap-2">
          {(['fr', 'en'] as Lang[]).map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => setLang(l)}
              className={seg(lang === l)}
              aria-pressed={lang === l}
            >
              {l === 'fr' ? 'Français' : 'English'}
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm text-slate-400">{t.thinkTime}</h2>
        <div className="flex gap-2">
          {THINK.map((ms) => (
            <button
              key={ms}
              type="button"
              onClick={() => setThinkMs(ms)}
              className={seg(thinkMs === ms)}
              aria-pressed={thinkMs === ms}
            >
              {ms / 1000} s
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-2 text-sm text-slate-400">
          {t.workers} (auto = {defaultPoolSize()})
        </h2>
        <div className="flex gap-2">
          {[0, 1, 2, 3, 4].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setWorkers(n)}
              className={seg(workers === n)}
              aria-pressed={workers === n}
            >
              {n === 0 ? 'auto' : n}
            </button>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <button
          type="button"
          onClick={exportGame}
          disabled={!record}
          className="rounded-xl border border-slate-600 px-3 py-3 font-medium disabled:opacity-40"
        >
          {copied ? t.copied : t.exportGame}
        </button>
        {record && (
          <pre className="max-h-24 overflow-auto rounded-lg bg-slate-950 p-2 text-[10px] text-slate-400">
            {JSON.stringify(record)}
          </pre>
        )}
        <textarea
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='{"version":1,"mapId":"kagkot",…}'
          className="h-20 rounded-lg border border-slate-700 bg-slate-950 p-2 text-xs"
          aria-label={t.importGame}
        />
        <button
          type="button"
          onClick={doImport}
          disabled={importText.trim() === ''}
          className="rounded-xl border border-slate-600 px-3 py-3 font-medium disabled:opacity-40"
        >
          {t.importGame}
        </button>
        {importError && <p className="text-sm text-rose-300">✗</p>}
        <button
          type="button"
          onClick={() => {
            if (record && window.confirm(t.confirmAbandon)) abandon()
          }}
          disabled={!record}
          className="rounded-xl border border-rose-800 px-3 py-3 font-medium text-rose-200 disabled:opacity-40"
        >
          {t.abandon}
        </button>
      </section>
    </main>
  )
}
