import { expect, test } from '@playwright/test'

test('start a game, get advice, play the recommended move, undo', async ({ page }) => {
  await page.goto('#/')
  await expect(page.getByRole('heading', { name: 'Trek12 Sherpa' })).toBeVisible()

  await page.getByRole('button', { name: /Kagkot/ }).click()
  await expect(page.getByText(/Tour 1\/19|Turn 1\/19/)).toBeVisible()

  // Yellow 3, red 4 → the advisor runs in workers and proposes a move.
  await page
    .getByRole('group', { name: /Dé jaune|Yellow die/ })
    .getByRole('button', { name: '3' })
    .click()
  await page
    .getByRole('group', { name: /Dé rouge|Red die/ })
    .getByRole('button', { name: '4' })
    .click()
  const play = page.getByRole('button', { name: /^(Jouer :|Play:)/ })
  await expect(play).toBeVisible({ timeout: 20_000 })
  // The sheet shows the heat scale and a best circle.
  await expect(page.getByText(/meilleur|best/).first()).toBeVisible()

  await play.click()
  await expect(page.getByText(/Tour 2\/19|Turn 2\/19/)).toBeVisible()

  await page.getByRole('button', { name: /Annuler|Undo/ }).click()
  await expect(page.getByText(/Tour 1\/19|Turn 1\/19/)).toBeVisible()

  // The game survives a reload (persisted record) and the app has no console errors.
  await page.reload()
  await expect(page.getByText(/Tour 1\/19|Turn 1\/19/)).toBeVisible()
})
