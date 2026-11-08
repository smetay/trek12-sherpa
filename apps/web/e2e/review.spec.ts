import { expect, test } from '@playwright/test'

test.use({ locale: 'fr-FR' })

const DICE = '12 24 12 26 43 45 45 41 02 06 16 42 45 22 02 56 11 14 04'
/** A sheet the heuristic policy actually played with these dice on Kagkot (circle by circle). */
const SHEET = [2, 5, 4, 1, 3, 4, 2, 2, 2, 0, 2, 1, 1, 2, 3, 4, 5, 4, 5]

test('analysis: enter dice and a sheet without spoilers, then reveal everything at the end', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await page.goto('#/')
  await page.getByRole('link', { name: /Analyser une partie/ }).click()
  await page.getByRole('button', { name: /Kagkot/ }).click()

  await page.getByRole('button', { name: 'Saisir en texte' }).click()
  await page.locator('#dice-text').fill(DICE)
  await page.getByRole('button', { name: 'Valider' }).click()
  await expect(page.getByText('19/19 lancers')).toBeVisible()

  await page.getByRole('button', { name: /Ajouter un joueur/ }).click()
  await page.getByRole('button', { name: /^Case 0 :/ }).click()
  const pad = page.locator('div.fixed.inset-x-0.bottom-0')
  for (const v of SHEET) await pad.getByRole('button', { name: String(v), exact: true }).click()
  await expect(page.getByText(/Feuille cohérente avec les dés/)).toBeVisible()
  await expect(page.getByText('Joueur 1 : feuille prête')).toBeVisible()

  // Nothing about the best play is shown (or computed) before the reveal.
  await expect(page.getByText('Résultats cachés')).toBeVisible()
  await expect(page.getByText('Score maximal possible')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Analyser la partie' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Calculer et révéler les résultats' }).click()
  await expect(page.getByRole('heading', { name: 'Résultats', exact: true })).toBeVisible()
  await expect(page.getByText(/recherches? indépendantes?/)).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText('Points perdus en décisions')).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/Analyse du tour/)).toHaveCount(0, { timeout: 90_000 })
  await expect(page.getByText(/bons? coups?/).first()).toBeVisible()
  await expect(page.getByText(/pts perdus/)).toBeVisible()

  // Everything survives a reload (persisted analysis, still revealed).
  await page.reload()
  await expect(page.getByText('Points perdus en décisions')).toBeVisible()

  // Results can be hidden again (e.g. to hand the phone to another player).
  await page.getByRole('button', { name: 'Masquer les résultats' }).click()
  await expect(page.getByText('Résultats cachés')).toBeVisible()
  await expect(page.getByText('Points perdus en décisions')).toHaveCount(0)
})
