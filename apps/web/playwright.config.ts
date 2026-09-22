import { defineConfig, devices } from '@playwright/test'

const base = '/trek12-sherpa/'

/** Smoke tests run against the production build served by `vite preview` (workers, SW, base path). */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:4173${base}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm build && pnpm preview --port 4173 --strictPort',
    url: `http://localhost:4173${base}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'mobile-chromium', use: { ...devices['Pixel 7'] } }],
})
