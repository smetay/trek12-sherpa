import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { midGameKagkot, storeWith } from './fixtures.ts'

// README screenshots, regenerated on demand only: SCREENSHOTS=1 pnpm e2e
const out = (name: string) => fileURLToPath(new URL(`../../../docs/img/${name}`, import.meta.url))

test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/img')
test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  colorScheme: 'light',
  serviceWorkers: 'block', // no "ready offline" toast in the pictures
})

for (const lang of ['fr', 'en'] as const) {
  test(`screenshots (${lang})`, async ({ page }) => {
    await page.addInitScript(
      (payload) => {
        localStorage.setItem('sherpa.v1', payload)
      },
      storeWith(midGameKagkot, lang),
    )
    await page.goto('#/play')
    const yellow = page.getByRole('group', { name: /Dé jaune|Yellow die/ })
    await yellow.getByRole('button', { name: '2' }).click()
    await page
      .getByRole('group', { name: /Dé rouge|Red die/ })
      .getByRole('button', { name: '5' })
      .click()
    await expect(page.getByRole('button', { name: /^(Jouer :|Play:)/ })).toBeVisible()
    await page.waitForTimeout(2500) // let the advisor finish its rounds
    await page.screenshot({ path: out(`play-${lang}.jpg`), type: 'jpeg', quality: 80 })
  })
}
