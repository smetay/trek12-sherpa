import type { MapDef } from '../map.ts'

/**
 * Kagkot — base game sheet (70+).
 * A diagonal ridge with four dangerous circles scattered along it.
 *
 * Digitised from a photo of the sheet (circle detection + outline-width classification), then
 * checked by eye pair by pair; only abstract graph data is stored. Verify in the app before
 * trusting it (`status: 'verified'` once a human has confirmed every adjacency on a real sheet).
 */
export const kagkotMap: MapDef = {
  id: 'kagkot',
  name: 'Kagkot',
  rev: 1,
  status: 'draft',
  summit: 70,
  stars: [3, 2, 1],
  opLimits: [4, 4, 4, 4, 4],
  cells: [
    { id: 0, x: -0.631, y: -2.017, max: 12 },
    { id: 1, x: 0.31, y: -2.371, max: 12 },
    { id: 2, x: 1.796, y: -2.235, max: 12 },
    { id: 3, x: 0.996, y: -1.641, max: 6 },
    { id: 4, x: -1.14, y: -1.166, max: 6 },
    { id: 5, x: 1.916, y: -1.249, max: 12 },
    { id: 6, x: -0.18, y: -0.846, max: 12 },
    { id: 7, x: -1.884, y: -0.482, max: 12 },
    { id: 8, x: -0.925, y: -0.177, max: 12 },
    { id: 9, x: -2.571, y: 0.251, max: 12 },
    { id: 10, x: 0.042, y: 0.13, max: 6 },
    { id: 11, x: 1.034, y: 0.128, max: 12 },
    { id: 12, x: -1.94, y: 1.046, max: 12 },
    { id: 13, x: -0.448, y: 1.004, max: 12 },
    { id: 14, x: 0.548, y: 0.988, max: 12 },
    { id: 15, x: 1.539, y: 0.983, max: 6 },
    { id: 16, x: 2.464, y: 1.387, max: 12 },
    { id: 17, x: 1.655, y: 1.973, max: 12 },
    { id: 18, x: 2.571, y: 2.371, max: 12 },
  ],
  edges: [
    [0, 1],
    [0, 4],
    [1, 3],
    [2, 3],
    [2, 5],
    [3, 5],
    [4, 6],
    [4, 7],
    [4, 8],
    [6, 8],
    [6, 10],
    [7, 8],
    [7, 9],
    [8, 10],
    [9, 12],
    [10, 11],
    [10, 13],
    [10, 14],
    [11, 14],
    [11, 15],
    [13, 14],
    [14, 15],
    [15, 16],
    [15, 17],
    [16, 17],
    [16, 18],
    [17, 18],
  ],
  nonAdjacentPairs: [],
}
