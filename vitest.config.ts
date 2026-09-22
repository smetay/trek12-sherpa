import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const setup = fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))

// One project per workspace package. Each inherits this root config (`extends: true`).
// Web components are covered by Playwright (from M4); only pure logic is unit-tested here.
const project = (name: string, root: string) => ({
  extends: true as const,
  test: { name, root, environment: 'node' as const },
})

// Deep property runs (FC_RUNS=5000) legitimately take minutes; give them room.
const deep = Number(process.env.FC_RUNS ?? 100) > 100

export default defineConfig({
  test: {
    passWithNoTests: true,
    setupFiles: [setup],
    testTimeout: deep ? 600_000 : 5_000,
    projects: [
      project('engine', './packages/engine'),
      project('solver', './packages/solver'),
      project('bench', './apps/bench'),
      project('web', './apps/web'),
    ],
  },
})
