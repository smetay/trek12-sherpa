/**
 * Independent, deliberately naive scorer used for differential testing.
 * It works on plain arrays and knows nothing about the engine's state layout or META fields.
 */
export type ReferenceInput = {
  values: number[] // -1 empty, 0..12, 13 = ☹
  links: [number, number][] // undirected rope links between adjacent cells
  edges: [number, number][]
}

export type ReferenceScore = {
  chains: number[]
  zones: number[]
  longest: number
  largest: number
  sad: number
  orphans: number
  total: number
}

function bonus(size: number): number {
  const table: Record<number, number> = { 3: 1, 4: 3, 5: 6, 6: 10, 7: 15, 8: 20, 9: 25 }
  if (size < 3) return 0
  if (size <= 9) return table[size]
  return 25 + 5 * (size - 9)
}

export function referenceScore({ values, links, edges }: ReferenceInput): ReferenceScore {
  const n = values.length
  const isNum = (c: number) => values[c] >= 0 && values[c] <= 12

  // Chains = connected components of the link graph.
  const linkAdj: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of links) {
    linkAdj[a].push(b)
    linkAdj[b].push(a)
  }
  const chainOf = new Array<number>(n).fill(-1)
  const chains: number[][] = []
  for (let c = 0; c < n; c++) {
    if (!isNum(c) || chainOf[c] !== -1 || linkAdj[c].length === 0) continue
    const members: number[] = []
    const stack = [c]
    chainOf[c] = chains.length
    while (stack.length) {
      const x = stack.pop() as number
      members.push(x)
      for (const y of linkAdj[x]) {
        if (chainOf[y] === -1) {
          chainOf[y] = chains.length
          stack.push(y)
        }
      }
    }
    chains.push(members)
  }
  const chainPoints = chains.map((m) => {
    const vals = m.map((c) => values[c])
    return Math.max(...vals) + (m.length - 1)
  })

  // Zones = connected components (via map edges) of equal values, size >= 2.
  const adj: number[][] = Array.from({ length: n }, () => [])
  for (const [a, b] of edges) {
    adj[a].push(b)
    adj[b].push(a)
  }
  const zoneOf = new Array<number>(n).fill(-1)
  const zones: number[][] = []
  for (let c = 0; c < n; c++) {
    if (!isNum(c) || zoneOf[c] !== -1) continue
    const members: number[] = []
    const stack = [c]
    zoneOf[c] = zones.length
    while (stack.length) {
      const x = stack.pop() as number
      members.push(x)
      for (const y of adj[x]) {
        if (values[y] === values[c] && zoneOf[y] === -1) {
          zoneOf[y] = zones.length
          stack.push(y)
        }
      }
    }
    if (members.length >= 2) zones.push(members)
    else for (const x of members) zoneOf[x] = -2 // singleton: not a zone
  }
  const zonePoints = zones.map((m) => values[m[0]] + (m.length - 1))

  let sad = 0
  let orphans = 0
  for (let c = 0; c < n; c++) {
    if (values[c] === 13) sad++
    else if (isNum(c) && chainOf[c] === -1 && zoneOf[c] < 0) orphans++
  }
  const longest = Math.max(0, ...chains.map((m) => m.length))
  const largest = Math.max(0, ...zones.map((m) => m.length))
  const total =
    chainPoints.reduce((a, b) => a + b, 0) +
    bonus(longest) +
    zonePoints.reduce((a, b) => a + b, 0) +
    bonus(largest) -
    3 * (sad + orphans)
  return { chains: chainPoints, zones: zonePoints, longest, largest, sad, orphans, total }
}
