import { useRegisterSW } from 'virtual:pwa-register/react'
import { useEffect } from 'react'
import { DICT } from './lib/i18n.ts'
import { useStore } from './lib/store.ts'

/** Update toast for the `registerType: 'prompt'` service worker — the user decides when to reload. */
export function ReloadPrompt() {
  const t = DICT[useStore((s) => s.lang)]
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  // The "ready offline" notice is informational: dismiss it by itself. The update prompt stays.
  useEffect(() => {
    if (!offlineReady) return
    const id = setTimeout(() => setOfflineReady(false), 4000)
    return () => clearTimeout(id)
  }, [offlineReady, setOfflineReady])

  if (!offlineReady && !needRefresh) return null

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div
      role="status"
      className="fixed inset-x-4 top-[max(env(safe-area-inset-top),1rem)] z-20 flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 shadow-xl"
    >
      <p className="flex-1 text-sm">{needRefresh ? t.updateAvailable : t.offlineReady}</p>
      {needRefresh && (
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-ink"
        >
          {t.update}
        </button>
      )}
      <button type="button" onClick={close} className="px-2 py-2 text-sm text-muted">
        {t.close}
      </button>
    </div>
  )
}
