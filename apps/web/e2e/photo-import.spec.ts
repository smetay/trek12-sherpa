import { expect, type Page, test } from '@playwright/test'

test.use({ locale: 'fr-FR', serviceWorkers: 'block' })

/** Hands a PNG to the page as a File inside a DataTransfer (what a drop or a paste carries). */
async function transferOf(page: Page, png: Buffer) {
  return page.evaluateHandle((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const dt = new DataTransfer()
    dt.items.add(new File([bytes], 'photo.png', { type: 'image/png' }))
    return dt
  }, png.toString('base64'))
}

test('photos can be imported (gallery, drop, paste), not only taken with the camera', async ({
  page,
}) => {
  await page.goto('#/review')
  // Any real image will do: these checks are about how the photo reaches the scanner.
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: 120, height: 90 } })

  const dice = page.getByRole('group', { name: 'Scanner les dés' })
  await expect(dice.getByRole('button', { name: 'Photographier' })).toBeVisible()
  await expect(dice.getByRole('button', { name: 'Importer' })).toBeVisible()
  // The camera input opens the camera on phones; the import input must not (gallery and files).
  await expect(page.getByLabel('Scanner les dés : Photographier')).toHaveAttribute(
    'capture',
    'environment',
  )
  const gallery = page.getByLabel('Scanner les dés : Importer')
  await expect(gallery).not.toHaveAttribute('capture', /.*/)

  // 1. Import from the gallery.
  await gallery.setInputFiles({ name: 'des.png', mimeType: 'image/png', buffer: png })
  const scan = page.getByRole('dialog', { name: 'Scanner les dés' })
  await expect(scan.getByRole('button', { name: 'Lire les dés' })).toBeVisible()
  await scan.getByRole('button', { name: 'Lire les dés' }).click()
  await expect(scan.getByRole('status')).toContainText(/Aucun lancer reconnu|lu/)
  await scan.getByRole('button', { name: 'Annuler' }).click()
  await expect(scan).toHaveCount(0)

  // 2. Drop an image on the dice section.
  const dt = await transferOf(page, png)
  await page
    .locator('section[aria-labelledby="dice-h"]')
    .dispatchEvent('drop', { dataTransfer: dt })
  await expect(scan.getByRole('button', { name: 'Lire les dés' })).toBeVisible()
  await scan.getByRole('button', { name: 'Annuler' }).click()

  // 3. Paste an image: it goes to the dice log by default…
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'collee.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, png.toString('base64'))
  await expect(scan.getByRole('button', { name: 'Lire les dés' })).toBeVisible()
  await scan.getByRole('button', { name: 'Annuler' }).click()

  // …and a player's sheet can be imported too.
  await page.getByRole('button', { name: /Ajouter un joueur/ }).click()
  await page
    .getByLabel('Scanner la feuille (Joueur 1) : Importer')
    .setInputFiles({ name: 'feuille.png', mimeType: 'image/png', buffer: png })
  const sheetScan = page.getByRole('dialog', { name: 'Scanner la feuille' })
  await expect(sheetScan.getByText(/Touche le centre du cercle 1\/4/)).toBeVisible()
  await sheetScan.getByRole('button', { name: 'Annuler', exact: true }).click()
  await expect(sheetScan).toHaveCount(0)

  // A paste after touching the player's card goes to that player's sheet.
  await page.getByRole('textbox', { name: 'Prénom' }).click()
  await page.evaluate((b64) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))
    const data = new DataTransfer()
    data.items.add(new File([bytes], 'feuille.png', { type: 'image/png' }))
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }))
  }, png.toString('base64'))
  await expect(sheetScan.getByText(/Touche le centre du cercle 1\/4/)).toBeVisible()
  await expect(scan).toHaveCount(0)
})
