import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const setup = fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))

// One project per workspace package. Each inherits this root config (`extends: true`).
// Web components are covered by Playwright (from M4); only pure logic is unit-tested here.
const project = (name: string, root: string) => ({
  extends: true as const,
  test: { name, root, environment: 'node' as const },
})

export default defineConfig({
  test: {
    passWithNoTests: true,
    setupFiles: [setup],
    projects: [
      project('engine', './packages/engine'),
      project('solver', './packages/solver'),
      project('bench', './apps/bench'),
      project('web', './apps/web'),
    ],
  },
})
