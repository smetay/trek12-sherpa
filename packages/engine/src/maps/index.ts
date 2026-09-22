import type { MapDef } from '../map.ts'
import { practiceMap } from './practice.ts'

export const MAPS: readonly MapDef[] = [practiceMap]

export function getMapDef(id: string): MapDef | undefined {
  return MAPS.find((m) => m.id === id)
}
