import { compileMap, getMapDef } from '@trek12/engine'
import { getPolicy, heuristicPolicy, measureRollouts, positionAfter } from '@trek12/solver'
import type { PerfRequest, PerfResult } from './messages.ts'

self.onmessage = (event: MessageEvent<PerfRequest>) => {
  const { mapId, policies, budgetMs } = event.data
  const def = getMapDef(mapId)
  if (!def) throw new Error(`unknown map ${mapId}`)
  const map = compileMap(def)
  const from = positionAfter(map, heuristicPolicy, 1, 9)
  for (const name of policies) {
    const policy = getPolicy(name)
    if (!policy) continue
    const r = measureRollouts(map, from, policy, 1, budgetMs, () => performance.now())
    const reply: PerfResult = { t: 'perf', policy: name, ...r }
    self.postMessage(reply)
  }
  self.postMessage({ t: 'done' } satisfies PerfResult)
}
