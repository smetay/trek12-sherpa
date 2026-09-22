import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

const setup = fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))

// One project per workspace package. Each inherits this root config (`extends: true`).
// Web components are covered by Playwright (from M4); only pure logic is unit-tested here.
const project = (name: string, root: string, include: string) => ({
  extends: true as const,
  test: { name, root, environment: 'node' as const, include: [include] },
})

// Property tests are CPU-bound and deterministic; shared CI runners can be 2-3x slower than a laptop.
// Deep runs (FC_RUNS=5000) legitimately take minutes.
const deep = Number(process.env.FC_RUNS ?? 100) > 100

export default defineConfig({
  test: {
    passWithNoTests: true,
    setupFiles: [setup],
    testTimeout: deep ? 600_000 : 30_000,
    projects: [
      project('engine', './packages/engine', 'test/**/*.test.ts'),
      project('solver', './packages/solver', 'test/**/*.test.ts'),
      project('bench', './apps/bench', 'test/**/*.test.ts'),
      // Playwright specs live in apps/web/e2e and must not be picked up here.
      project('web', './apps/web', 'src/**/*.test.ts'),
    ],
  },
})
