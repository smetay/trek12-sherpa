import type { CompiledMap } from './map.ts'
import {
  bonusFor,
  chainPoints,
  EMPTY,
  isNumber,
  SAD,
  SAD_PENALTY,
  type State,
  zonePoints,
} from './state.ts'

export type ChainScore = { cells: number[]; min: number; max: number; points: number }
export type ZoneScore = { cells: number[]; value: number; points: number }

/** The score sheet, computed from scratch — the reference the incremental META fields are tested against. */
export type ScoreBreakdown = {
  chains: ChainScore[]
  longestChain: number
  chainBonus: number
  zones: ZoneScore[]
  largestZone: number
  zoneBonus: number
  sadCells: number[]
  orphanCells: number[]
  penalty: number
  total: number
}

export function scoreBreakdown(map: CompiledMap, s: State): ScoreBreakdown {
  const n = map.n
  const { oVal, oUp, oDown } = map

  const chains: ChainScore[] = []
  const inChain = new Uint8Array(n)
  for (let c = 0; c < n; c++) {
    if (!isNumber(s[oVal + c]) || s[oDown + c] !== EMPTY || s[oUp + c] === EMPTY) continue
    const cells = [c]
    let cur = c
    while (s[oUp + cur] !== EMPTY) {
      cur = s[oUp + cur]
      cells.push(cur)
    }
    for (const x of cells) inChain[x] = 1
    const min = s[oVal + c]
    const max = s[oVal + cur]
    chains.push({ cells, min, max, points: chainPoints(min, max) })
  }

  const zones: ZoneScore[] = []
  const inZone = new Uint8Array(n)
  const visited = new Uint8Array(n)
  for (let root = 0; root < n; root++) {
    const v = s[oVal + root]
    if (!isNumber(v) || visited[root]) continue
    const cells: number[] = []
    const stack = [root]
    visited[root] = 1
    while (stack.length > 0) {
      const c = stack.pop() as number
      cells.push(c)
      for (let i = map.nbrStart[c]; i < map.nbrStart[c + 1]; i++) {
        const nb = map.nbrList[i]
        if (s[oVal + nb] === v && !visited[nb]) {
          visited[nb] = 1
          stack.push(nb)
        }
      }
    }
    if (cells.length < 2) continue
    cells.sort((a, b) => a - b)
    for (const x of cells) inZone[x] = 1
    zones.push({ cells, value: v, points: zonePoints(v, cells.length) })
  }

  const sadCells: number[] = []
  const orphanCells: number[] = []
  for (let c = 0; c < n; c++) {
    const v = s[oVal + c]
    if (v === SAD) sadCells.push(c)
    else if (isNumber(v) && !inChain[c] && !inZone[c]) orphanCells.push(c)
  }

  const longestChain = chains.reduce((m, ch) => Math.max(m, ch.cells.length), 0)
  const largestZone = zones.reduce((m, z) => Math.max(m, z.cells.length), 0)
  const chainBonus = bonusFor(longestChain)
  const zoneBonus = bonusFor(largestZone)
  const penalty = SAD_PENALTY * (sadCells.length + orphanCells.length)
  const total =
    chains.reduce((sum, ch) => sum + ch.points, 0) +
    chainBonus +
    zones.reduce((sum, z) => sum + z.points, 0) +
    zoneBonus -
    penalty

  return {
    chains,
    longestChain,
    chainBonus,
    zones,
    largestZone,
    zoneBonus,
    sadCells,
    orphanCells,
    penalty,
    total,
  }
}
