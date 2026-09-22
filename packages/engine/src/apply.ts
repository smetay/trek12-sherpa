import {
  type CompiledMap,
  META_CHAIN_SUM,
  META_FILLED,
  META_FILLED_MASK,
  META_FRONTIER,
  META_MAX_CHAIN,
  META_MAX_ZONE,
  META_ORPHANS,
  META_SAD,
  META_ZONE_SUM,
} from './map.ts'
import { type Move, moveCell, moveDown, moveOp, moveResult, moveUp } from './moves.ts'
import { chainPoints, EMPTY, isNumber, SAD, type State, zonePoints } from './state.ts'

const roots = new Int32Array(8)

function isOrphan(map: CompiledMap, s: State, c: number): boolean {
  return (
    s[map.oUp + c] === EMPTY && s[map.oDown + c] === EMPTY && s[map.oZsize + s[map.oZid + c]] === 1
  )
}

/**
 * Plays a legal move in place, maintaining every derived field incrementally.
 * Callers that need the previous state copy it first (`cloneState`).
 */
export function applyMove(map: CompiledMap, s: State, m: Move): void {
  const { oVal, oUp, oDown, oEnd, oZid, oZsize, oTicks, oMeta, nbrStart, nbrList } = map
  const cell = moveCell(m)
  const op = moveOp(m)
  const result = moveResult(m)
  const down = moveDown(m)
  const up = moveUp(m)

  s[oTicks + op]++
  s[oMeta + META_FILLED]++
  const filledMask = s[oMeta + META_FILLED_MASK] | (1 << cell)
  s[oMeta + META_FILLED_MASK] = filledMask

  // A ☹ is a filled circle: later numbers may be written next to it (docs/RULES.md).
  s[oMeta + META_FRONTIER] = (s[oMeta + META_FRONTIER] | map.nbrMask[cell]) & ~filledMask

  if (result > map.cellMax[cell]) {
    s[oVal + cell] = SAD
    s[oMeta + META_SAD]++
    return
  }

  const v = result
  s[oVal + cell] = v

  let orphanDelta = 0

  // --- Rope path -----------------------------------------------------------------------------
  let bottom = cell
  let top = cell
  let oldChains = 0
  if (down !== EMPTY) {
    if (isOrphan(map, s, down)) orphanDelta--
    bottom = s[oEnd + down]
    oldChains += chainPoints(s[oVal + bottom], v - 1)
  }
  if (up !== EMPTY) {
    if (isOrphan(map, s, up)) orphanDelta--
    top = s[oEnd + up]
    oldChains += chainPoints(v + 1, s[oVal + top])
  }
  if (down !== EMPTY || up !== EMPTY) {
    if (down !== EMPTY) {
      s[oUp + down] = cell
      s[oDown + cell] = down
    }
    if (up !== EMPTY) {
      s[oDown + up] = cell
      s[oUp + cell] = up
    }
    s[oEnd + bottom] = top
    s[oEnd + top] = bottom
    const min = s[oVal + bottom]
    const max = s[oVal + top]
    s[oMeta + META_CHAIN_SUM] += chainPoints(min, max) - oldChains
    const len = max - min + 1
    if (len > s[oMeta + META_MAX_CHAIN]) s[oMeta + META_MAX_CHAIN] = len
  } else {
    s[oEnd + cell] = cell
  }

  // --- Zone ------------------------------------------------------------------------------------
  let nRoots = 0
  let size = 1
  let oldZones = 0
  for (let i = nbrStart[cell]; i < nbrStart[cell + 1]; i++) {
    const nb = nbrList[i]
    if (s[oVal + nb] !== v) continue
    const root = s[oZid + nb]
    let known = false
    for (let k = 0; k < nRoots; k++) if (roots[k] === root) known = true
    if (known) continue
    // A neighbour was an orphan only if its zone was a singleton; a singleton zone has one member.
    if (s[oZsize + root] === 1 && isOrphan(map, s, root)) orphanDelta--
    roots[nRoots++] = root
    size += s[oZsize + root]
    oldZones += zonePoints(v, s[oZsize + root])
  }
  if (nRoots === 0) {
    s[oZid + cell] = cell
    s[oZsize + cell] = 1
  } else {
    const newRoot = roots[0]
    if (nRoots > 1) {
      for (let c = 0; c < map.n; c++) {
        const z = s[oZid + c]
        if (z === -1 || z === newRoot) continue
        for (let k = 1; k < nRoots; k++) {
          if (z === roots[k]) {
            s[oZid + c] = newRoot
            break
          }
        }
      }
    }
    s[oZid + cell] = newRoot
    s[oZsize + newRoot] = size
    s[oMeta + META_ZONE_SUM] += zonePoints(v, size) - oldZones
    if (size > s[oMeta + META_MAX_ZONE]) s[oMeta + META_MAX_ZONE] = size
  }

  if (isNumber(v) && isOrphan(map, s, cell)) orphanDelta++
  s[oMeta + META_ORPHANS] += orphanDelta
}
