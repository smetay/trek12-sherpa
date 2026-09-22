import {
  type CompiledMap,
  compileMap,
  EMPTY,
  type GameRecord,
  getMapDef,
  type Move,
  moveCell,
  moveDown,
  moveOp,
  moveResult,
  moveUp,
  OP_NAMES,
  replay,
  SAD,
  type State,
} from '@trek12/engine'
import { useMemo } from 'react'
import type { Dict } from './i18n.ts'

export type Game = { map: CompiledMap; state: State; record: GameRecord }

const mapCache = new Map<string, CompiledMap>()

export function compileFor(record: GameRecord): CompiledMap | undefined {
  const key = `${record.mapId}@${record.mapRev}:${record.ruleset.linkRule}`
  const cached = mapCache.get(key)
  if (cached) return cached
  const def = getMapDef(record.mapId)
  if (!def || def.rev !== record.mapRev) return undefined
  const map = compileMap(def, record.ruleset)
  mapCache.set(key, map)
  return map
}

/** Compiles the map and replays the record (a new record object on every move). */
export function useGame(record: GameRecord | null): Game | undefined {
  return useMemo(() => {
    if (!record) return undefined
    const map = compileFor(record)
    if (!map) return undefined
    try {
      return { map, state: replay(map, record), record }
    } catch {
      return undefined
    }
  }, [record])
}

export type MoveView = {
  move: Move
  cell: number
  op: string
  opIndex: number
  result: number
  sad: boolean
  down: number
  up: number
}

export function viewMove(map: CompiledMap, m: Move): MoveView {
  const cell = moveCell(m)
  const result = moveResult(m)
  return {
    move: m,
    cell,
    op: OP_NAMES[moveOp(m)],
    opIndex: moveOp(m),
    result,
    sad: result > map.cellMax[cell],
    down: moveDown(m),
    up: moveUp(m),
  }
}

export function describeLinks(v: MoveView, state: State, map: CompiledMap, t: Dict): string {
  const parts: string[] = []
  if (v.down !== EMPTY)
    parts.push(`${t.linkTo} ${state[map.oVal + v.down]} (${t.cell.toLowerCase()} ${v.down})`)
  if (v.up !== EMPTY)
    parts.push(`${t.linkTo} ${state[map.oVal + v.up]} (${t.cell.toLowerCase()} ${v.up})`)
  return parts.join(' · ')
}

export function cellLabel(value: number): string {
  if (value === EMPTY) return ''
  if (value === SAD) return '☹'
  return String(value)
}

/** Rope links currently drawn on the sheet. */
export function linksOf(map: CompiledMap, s: State): [number, number][] {
  const links: [number, number][] = []
  for (let c = 0; c < map.n; c++) if (s[map.oUp + c] !== EMPTY) links.push([c, s[map.oUp + c]])
  return links
}
