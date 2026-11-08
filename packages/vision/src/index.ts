/**
 * @trek12/vision — reads photographed Trek 12 paper on the device.
 *
 * Constraints (tsconfig `types: []` / `lib: ES2023`): no DOM, no Node, no dependencies. Images come in
 * as plain grayscale buffers; decoding and canvas work stay in the app.
 */
export const VISION_VERSION = '0.1.0'

export * from './classify.ts'
export * from './dicelog.ts'
export * from './homography.ts'
export * from './image.ts'
export * from './sheet.ts'
