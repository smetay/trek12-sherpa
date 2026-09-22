/** A Kagkot game after 8 turns, with rope links and a zone — used for screenshots. */
export const midGameKagkot = {
  version: 1,
  mapId: 'kagkot',
  mapRev: 1,
  ruleset: { linkRule: 'mandatory' },
  history: [
    { y: 3, r: 4, op: 3, cell: 7, down: -1, up: -1 },
    { y: 2, r: 5, op: 1, cell: 4, down: -1, up: -1 },
    { y: 1, r: 3, op: 3, cell: 6, down: -1, up: 4 },
    { y: 4, r: 4, op: 3, cell: 9, down: 7, up: -1 },
    { y: 0, r: 6, op: 2, cell: 0, down: 4, up: -1 },
    { y: 2, r: 2, op: 4, cell: 10, down: -1, up: -1 },
    { y: 5, r: 6, op: 1, cell: 1, down: -1, up: -1 },
    { y: 1, r: 2, op: 4, cell: 14, down: -1, up: -1 },
  ],
}

/** Persisted store payload (zustand `persist`, key `sherpa.v1`). */
export function storeWith(record: unknown, lang: 'fr' | 'en' = 'fr'): string {
  return JSON.stringify({
    state: { record, redo: [], lang, thinkMs: 1500, workers: 0, cellMetric: 'points' },
    version: 1,
  })
}
