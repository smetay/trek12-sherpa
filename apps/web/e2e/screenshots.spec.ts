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

test('screenshot of the analysis (fr)', async ({ page }) => {
  test.setTimeout(180_000)
  await page.addInitScript(
    (payload) => {
      localStorage.setItem('sherpa.v1', payload)
    },
    storeWith(null, 'fr'),
  )
  await page.goto('#/review')
  await page.getByRole('button', { name: /Kagkot/ }).click()
  await page.getByRole('button', { name: 'Saisir en texte' }).click()
  await page.locator('#dice-text').fill('12 24 12 26 43 45 45 41 02 06 16 42 45 22 02 56 11 14 04')
  await page.getByRole('button', { name: 'Valider' }).click()
  await page.getByRole('button', { name: /Ajouter un joueur/ }).click()
  await page.getByRole('button', { name: /^Case 0 :/ }).click()
  const pad = page.locator('div.fixed.inset-x-0.bottom-0')
  for (const v of [2, 5, 4, 1, 3, 4, 2, 2, 2, 0, 2, 1, 1, 2, 3, 4, 5, 4, 5]) {
    await pad.getByRole('button', { name: String(v), exact: true }).click()
  }
  await page.getByRole('button', { name: 'Calculer et révéler les résultats' }).click()
  await expect(page.getByText(/recherches? indépendantes?/)).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/Analyse du tour/)).toHaveCount(0, { timeout: 90_000 })
  const report = page.getByText('Points perdus en décisions').locator('xpath=ancestor::section[1]')
  await report
    .getByRole('heading', { name: /coûté le plus/ })
    .locator('xpath=..')
    .locator('li button')
    .first()
    .click()
  await report.scrollIntoViewIfNeeded()
  await report.screenshot({ path: out('analysis-fr.jpg'), type: 'jpeg', quality: 80 })
})
