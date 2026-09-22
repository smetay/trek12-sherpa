import type { MapDef } from '../map.ts'
import { dhaulagiriMap } from './dhaulagiri.ts'
import { dunaiMap } from './dunai.ts'
import { kagkotMap } from './kagkot.ts'
import { practiceMap } from './practice.ts'

/** Base-game sheets in rulebook order (easiest first), then the synthetic practice map. */
export const MAPS: readonly MapDef[] = [dunaiMap, kagkotMap, dhaulagiriMap, practiceMap]

export function getMapDef(id: string): MapDef | undefined {
  return MAPS.find((m) => m.id === id)
}

export { dhaulagiriMap, dunaiMap, kagkotMap, practiceMap }
