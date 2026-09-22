import { useRegisterSW } from 'virtual:pwa-register/react'

/** Update toast for the `registerType: 'prompt'` service worker — the user decides when to reload. */
export function ReloadPrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()

  if (!offlineReady && !needRefresh) return null

  const close = () => {
    setOfflineReady(false)
    setNeedRefresh(false)
  }

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-4 flex items-center gap-3 rounded-2xl border border-slate-600 bg-slate-900 p-4 shadow-xl"
    >
      <p className="flex-1 text-sm">
        {needRefresh
          ? 'Une nouvelle version est disponible.'
          : "L'application est prête à fonctionner hors-ligne."}
      </p>
      {needRefresh && (
        <button
          type="button"
          onClick={() => updateServiceWorker(true)}
          className="rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-slate-950"
        >
          Mettre à jour
        </button>
      )}
      <button type="button" onClick={close} className="px-2 py-2 text-sm text-slate-400">
        Fermer
      </button>
    </div>
  )
}
