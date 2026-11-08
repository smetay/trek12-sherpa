import { expect, test } from '@playwright/test'

test.use({ locale: 'fr-FR' })

const DICE = '12 24 12 26 43 45 45 41 02 06 16 42 45 22 02 56 11 14 04'
/** A sheet the heuristic policy actually played with these dice on Kagkot (circle by circle). */
const SHEET = [2, 5, 4, 1, 3, 4, 2, 2, 2, 0, 2, 1, 1, 2, 3, 4, 5, 4, 5]

test('analysis: typed dice give the clairvoyant maximum, a typed sheet gets a review', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto('#/')
  await page.getByRole('link', { name: /Analyser une partie/ }).click()
  await page.getByRole('button', { name: /Kagkot/ }).click()

  await page.getByRole('button', { name: 'Saisir en texte' }).click()
  await page.locator('#dice-text').fill(DICE)
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByText('19/19')).toBeVisible()

  // The maximum is searched in the workers as soon as the 19 rolls are known.
  await expect(page.getByText(/recherches? indépendantes?/)).toBeVisible({ timeout: 90_000 })

  await page.getByRole('button', { name: /Ajouter un joueur/ }).click()
  await page.getByRole('button', { name: /^Case 0 :/ }).click()
  const pad = page.locator('div.fixed.inset-x-0.bottom-0')
  for (const v of SHEET) await pad.getByRole('button', { name: String(v), exact: true }).click()
  await expect(page.getByText(/Feuille cohérente avec les dés/)).toBeVisible()

  await page.getByRole('button', { name: 'Analyser la partie' }).click()
  await expect(page.getByText('Points perdus en décisions')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText(/Analyse du tour/)).toHaveCount(0, { timeout: 90_000 })
  await expect(page.getByText(/bons? coups?/).first()).toBeVisible()

  // Everything survives a reload (persisted analysis).
  await page.reload()
  await expect(page.getByText('Points perdus en décisions')).toBeVisible()
})
