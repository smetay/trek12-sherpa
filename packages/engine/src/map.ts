import { OP_COUNT } from './dice.ts'
import { DEFAULT_RULESET, type Ruleset } from './ruleset.ts'

/** Cells are stored in an Int32 bitmask; keep one bit spare for the sign. */
export const MAX_CELLS = 30
export const MAX_DEGREE = 6

export type CellDef = {
  /** 0-based, contiguous, equal to the index in `cells`. */
  id: number
  /** Position in an arbitrary unit (neighbouring circles are ~1 apart); used for rendering and validation. */
  x: number
  y: number
  /** Highest number that may be written: 12 (normal) or 6 (dangerous). */
  max: number
}

export type MapStatus = 'draft' | 'verified' | 'practice'

export type MapDef = {
  id: string
  name: string
  /** Bumped whenever cells/edges change; stored in game records. */
  rev: number
  status: MapStatus
  /** Score threshold printed on the sheet ("65+"). */
  summit: number
  /** Reputation stars printed on the sheet [summit, race to the summit, record] — Expedition mode only. */
  stars?: [number, number, number]
  cells: CellDef[]
  /** Undirected adjacency, each pair listed once. */
  edges: [number, number][]
  /** Ticks available per operation [low, high, diff, sum, prod]. */
  opLimits: [number, number, number, number, number]
  /** Pairs that are geometrically close but do NOT touch on the sheet (silences the validator). */
  nonAdjacentPairs?: [number, number][]
}

export type CompiledMap = {
  def: MapDef
  rules: Ruleset
  n: number
  allMask: number
  /** CSR adjacency: neighbours of `c` are `nbrList[nbrStart[c] .. nbrStart[c + 1])`. */
  nbrStart: Int32Array
  nbrList: Int32Array
  nbrMask: Int32Array
  cellMax: Int32Array
  opLimits: Int32Array
  // State layout (offsets into the Int32Array state), see state.ts.
  oVal: number
  oUp: number
  oDown: number
  oEnd: number
  oZid: number
  oZsize: number
  oTicks: number
  oMeta: number
  stateSize: number
}

const isInt = (v: unknown): v is number => Number.isInteger(v)
const isFiniteNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

/** Returns every problem found; an empty list means the map is valid. */
export function validateMap(input: unknown): string[] {
  const errors: string[] = []
  if (typeof input !== 'object' || input === null) return ['map must be an object']
  const def = input as Partial<MapDef>

  if (typeof def.id !== 'string' || !/^[a-z0-9-]+$/.test(def.id))
    errors.push('id must be a kebab-case string')
  if (typeof def.name !== 'string' || def.name.length === 0) errors.push('name is required')
  if (!isInt(def.rev) || def.rev < 1) errors.push('rev must be a positive integer')
  if (def.status !== 'draft' && def.status !== 'verified' && def.status !== 'practice') {
    errors.push('status must be draft, verified or practice')
  }
  if (!isInt(def.summit) || def.summit <= 0) errors.push('summit must be a positive integer')

  if (!Array.isArray(def.cells) || def.cells.length === 0) {
    errors.push('cells must be a non-empty array')
    return errors
  }
  const n = def.cells.length
  if (n > MAX_CELLS) errors.push(`at most ${MAX_CELLS} cells are supported (got ${n})`)
  def.cells.forEach((cell, i) => {
    if (typeof cell !== 'object' || cell === null) {
      errors.push(`cell ${i} must be an object`)
      return
    }
    if (cell.id !== i) errors.push(`cell ${i} must have id ${i} (got ${String(cell.id)})`)
    if (!isFiniteNum(cell.x) || !isFiniteNum(cell.y)) errors.push(`cell ${i} needs finite x/y`)
    if (!isInt(cell.max) || cell.max < 0)
      errors.push(`cell ${i} max must be a non-negative integer`)
  })

  if (!Array.isArray(def.opLimits) || def.opLimits.length !== OP_COUNT) {
    errors.push(`opLimits must have ${OP_COUNT} entries`)
  } else {
    if (!def.opLimits.every((l) => isInt(l) && l >= 0))
      errors.push('opLimits must be non-negative integers')
    else if (def.opLimits.reduce((a, b) => a + b, 0) < n) {
      errors.push(
        'sum of opLimits must be at least the number of cells (a game must always be finishable)',
      )
    }
  }

  if (!Array.isArray(def.edges)) {
    errors.push('edges must be an array')
    return errors
  }
  const seen = new Set<string>()
  const degree = new Array<number>(n).fill(0)
  const adjacency = Array.from({ length: n }, () => new Set<number>())
  for (const edge of def.edges) {
    if (!Array.isArray(edge) || edge.length !== 2 || !isInt(edge[0]) || !isInt(edge[1])) {
      errors.push(`edge ${JSON.stringify(edge)} must be a pair of integers`)
      continue
    }
    const [a, b] = edge
    if (a < 0 || a >= n || b < 0 || b >= n) {
      errors.push(`edge ${a}-${b} refers to a missing cell`)
      continue
    }
    if (a === b) {
      errors.push(`edge ${a}-${b} is a self-loop`)
      continue
    }
    const key = a < b ? `${a}-${b}` : `${b}-${a}`
    if (seen.has(key)) {
      errors.push(`edge ${key} is listed twice`)
      continue
    }
    seen.add(key)
    degree[a]++
    degree[b]++
    adjacency[a].add(b)
    adjacency[b].add(a)
  }
  degree.forEach((d, i) => {
    if (d > MAX_DEGREE) errors.push(`cell ${i} has ${d} neighbours (max ${MAX_DEGREE})`)
  })

  if (errors.length > 0) return errors

  // Connectivity: every cell must be reachable, otherwise some circles could never be filled.
  const reached = new Set<number>([0])
  const stack = [0]
  while (stack.length > 0) {
    const c = stack.pop() as number
    for (const nb of adjacency[c]) {
      if (!reached.has(nb)) {
        reached.add(nb)
        stack.push(nb)
      }
    }
  }
  if (reached.size !== n)
    errors.push(`graph is not connected (${n - reached.size} unreachable cells)`)

  // Geometry (real sheets only): catches the two likely digitisation mistakes — a missing edge
  // between touching circles, and an edge between circles that are far apart.
  if (def.status === 'practice') return errors
  const cells = def.cells as CellDef[]
  const dist = (a: number, b: number) =>
    Math.hypot(cells[a].x - cells[b].x, cells[a].y - cells[b].y)
  const lengths = def.edges.map(([a, b]) => dist(a, b)).sort((p, q) => p - q)
  if (lengths.length > 0) {
    const median = lengths[lengths.length >> 1]
    for (const [a, b] of def.edges) {
      const d = dist(a, b)
      if (d < 0.6 * median || d > 1.4 * median) {
        errors.push(`edge ${a}-${b} has length ${d.toFixed(2)} (median ${median.toFixed(2)})`)
      }
    }
    const exempt = new Set(
      (def.nonAdjacentPairs ?? []).map(([a, b]) => (a < b ? `${a}-${b}` : `${b}-${a}`)),
    )
    for (let a = 0; a < n; a++) {
      for (let b = a + 1; b < n; b++) {
        if (adjacency[a].has(b)) continue
        const key = `${a}-${b}`
        if (dist(a, b) < 1.25 * median && !exempt.has(key)) {
          errors.push(
            `cells ${key} are close but not adjacent — add the edge or list them in nonAdjacentPairs`,
          )
        }
      }
    }
  }
  return errors
}

export function compileMap(def: MapDef, rules: Ruleset = DEFAULT_RULESET): CompiledMap {
  const errors = validateMap(def)
  if (errors.length > 0) throw new Error(`invalid map "${def.id}": ${errors.join('; ')}`)

  const n = def.cells.length
  const lists: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of def.edges) {
    lists[a].push(b)
    lists[b].push(a)
  }
  const nbrStart = new Int32Array(n + 1)
  const nbrList = new Int32Array(def.edges.length * 2)
  const nbrMask = new Int32Array(n)
  for (let c = 0; c < n; c++) {
    lists[c].sort((p, q) => p - q)
    nbrStart[c + 1] = nbrStart[c] + lists[c].length
    lists[c].forEach((nb, i) => {
      nbrList[nbrStart[c] + i] = nb
      nbrMask[c] |= 1 << nb
    })
  }

  return {
    def,
    rules: { ...rules },
    n,
    allMask: n === 31 ? -1 : (1 << n) - 1,
    nbrStart,
    nbrList,
    nbrMask,
    cellMax: Int32Array.from(def.cells, (c) => c.max),
    opLimits: Int32Array.from(def.opLimits),
    oVal: 0,
    oUp: n,
    oDown: 2 * n,
    oEnd: 3 * n,
    oZid: 4 * n,
    oZsize: 5 * n,
    oTicks: 6 * n,
    oMeta: 6 * n + OP_COUNT,
    stateSize: 6 * n + OP_COUNT + META_COUNT,
  }
}

// Meta slots (indices relative to `oMeta`). Kept here so map.ts can size the state.
export const META_FILLED = 0
export const META_CHAIN_SUM = 1
export const META_ZONE_SUM = 2
export const META_MAX_CHAIN = 3
export const META_MAX_ZONE = 4
export const META_SAD = 5
export const META_ORPHANS = 6
export const META_FILLED_MASK = 7
export const META_FRONTIER = 8
export const META_COUNT = 9
