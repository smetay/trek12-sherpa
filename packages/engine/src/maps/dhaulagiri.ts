import type { MapDef } from '../map.ts'

/**
 * Dhaulagiri — base game sheet (75+).
 * The hardest sheet: sparse, with six dangerous circles including the summit.
 *
 * Digitised from a photo of the sheet (circle detection + outline-width classification), then
 * checked by eye pair by pair; only abstract graph data is stored.
 * Verified circle by circle against a physical sheet with the in-app verification screen
 * (19/19 OK, 2026-09-22).
 */
export const dhaulagiriMap: MapDef = {
  id: 'dhaulagiri',
  name: 'Dhaulagiri',
  rev: 1,
  status: 'verified',
  summit: 75,
  stars: [5, 3, 1],
  opLimits: [4, 4, 4, 4, 4],
  cells: [
    { id: 0, x: -0.315, y: -2.152, max: 6 },
    { id: 1, x: 0.274, y: -1.336, max: 12 },
    { id: 2, x: -1.609, y: -0.779, max: 12 },
    { id: 3, x: -0.615, y: -0.886, max: 12 },
    { id: 4, x: 1.185, y: -0.934, max: 6 },
    { id: 5, x: -1.62, y: 0.225, max: 12 },
    { id: 6, x: -0.633, y: 0.114, max: 12 },
    { id: 7, x: 1.274, y: 0.075, max: 6 },
    { id: 8, x: -3.268, y: 0.88, max: 12 },
    { id: 9, x: -2.281, y: 0.975, max: 12 },
    { id: 10, x: 0.072, y: 0.843, max: 6 },
    { id: 11, x: 1.65, y: 0.99, max: 6 },
    { id: 12, x: 2.646, y: 1.123, max: 12 },
    { id: 13, x: -2.853, y: 1.791, max: 12 },
    { id: 14, x: -0.709, y: 1.469, max: 12 },
    { id: 15, x: 0.03, y: 2.152, max: 12 },
    { id: 16, x: 0.804, y: 1.532, max: 6 },
    { id: 17, x: 2.29, y: 2.052, max: 12 },
    { id: 18, x: 3.268, y: 1.88, max: 12 },
  ],
  edges: [
    [0, 1],
    [1, 3],
    [1, 4],
    [2, 3],
    [2, 5],
    [3, 6],
    [4, 7],
    [5, 6],
    [5, 9],
    [6, 10],
    [7, 11],
    [8, 9],
    [8, 13],
    [9, 13],
    [10, 14],
    [10, 16],
    [11, 12],
    [11, 16],
    [12, 17],
    [12, 18],
    [14, 15],
    [15, 16],
    [17, 18],
  ],
  nonAdjacentPairs: [[11, 17]],
}
