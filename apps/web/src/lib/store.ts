import {
  DEFAULT_RULESET,
  type GameRecord,
  getMapDef,
  type HistoryEntry,
  isGameRecord,
} from '@trek12/engine'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Lang } from './i18n.ts'

type Store = {
  record: GameRecord | null
  redo: HistoryEntry[]
  lang: Lang
  thinkMs: number
  workers: number
  startGame(mapId: string): void
  playEntry(entry: HistoryEntry): void
  undo(): void
  redoMove(): void
  abandon(): void
  importRecord(record: GameRecord): boolean
  setLang(lang: Lang): void
  setThinkMs(ms: number): void
  setWorkers(n: number): void
}

const browserLang = (): Lang =>
  typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('fr')
    ? 'fr'
    : 'en'

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      record: null,
      redo: [],
      lang: browserLang(),
      thinkMs: 1500,
      workers: 0, // 0 = automatic
      startGame(mapId) {
        const def = getMapDef(mapId)
        if (!def) return
        set({
          record: {
            version: 1,
            mapId,
            mapRev: def.rev,
            ruleset: { ...DEFAULT_RULESET },
            history: [],
          },
          redo: [],
        })
      },
      playEntry(entry) {
        const { record } = get()
        if (!record) return
        set({ record: { ...record, history: [...record.history, entry] }, redo: [] })
      },
      undo() {
        const { record, redo } = get()
        if (!record || record.history.length === 0) return
        const history = record.history.slice(0, -1)
        set({
          record: { ...record, history },
          redo: [record.history[record.history.length - 1], ...redo],
        })
      },
      redoMove() {
        const { record, redo } = get()
        if (!record || redo.length === 0) return
        const [next, ...rest] = redo
        set({ record: { ...record, history: [...record.history, next] }, redo: rest })
      },
      abandon() {
        set({ record: null, redo: [] })
      },
      importRecord(record) {
        if (!isGameRecord(record)) return false
        const def = getMapDef(record.mapId)
        if (!def || def.rev !== record.mapRev) return false
        set({ record, redo: [] })
        return true
      },
      setLang: (lang) => set({ lang }),
      setThinkMs: (thinkMs) => set({ thinkMs }),
      setWorkers: (workers) => set({ workers }),
    }),
    {
      name: 'sherpa.v1',
      version: 1,
      partialize: (s) => ({
        record: s.record,
        redo: s.redo,
        lang: s.lang,
        thinkMs: s.thinkMs,
        workers: s.workers,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<Store>
        // A corrupted or foreign record is dropped rather than crashing the app.
        const record = p.record && isGameRecord(p.record) ? p.record : null
        return { ...current, ...p, record, redo: Array.isArray(p.redo) ? p.redo : [] }
      },
    },
  ),
)
