import { expect, test } from '@playwright/test'

async function begin(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
}

test.describe('export and import round-trip', () => {
  test('export JSON → erase → preview & confirm import → identical data', async ({ page }) => {
    await page.clock.install()
    await begin(page)

    // Complete a pause to create rich data
    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()
    await page.getByRole('button', { name: 'Score 4' }).click()
    await page.getByRole('button', { name: 'Boredom' }).click()
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
    await page.clock.fastForward(11_000)
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
    await page.getByRole('button', { name: 'Score 6' }).click()
    await page.getByRole('button', { name: 'Save this score' }).click()
    await expect(page.getByText('Closed. The pause counted.')).toBeVisible()

    // Navigate to settings
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Export JSON
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON' }).click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    let text = ''
    for await (const chunk of stream) {
      text += chunk
    }
    const exportedDb = JSON.parse(text)
    expect(exportedDb.events).toHaveLength(1)
    expect(exportedDb.events[0].choice).toBe('close')

    // Erase all data
    await page.getByRole('button', { name: 'Erase all data' }).click()
    await expect(page.getByRole('heading', { name: 'Erase everything on this device?' })).toBeVisible()
    await page.getByRole('button', { name: 'Erase', exact: true }).click()

    // App returns to fresh state (onboarding)
    await expect(page.getByRole('heading', { name: 'Instincts are fuel.' })).toBeVisible()
    const rawAfterErase = await page.evaluate(() => localStorage.getItem('supacon.v1'))
    const dbAfterErase = JSON.parse(rawAfterErase ?? '{}')
    expect(dbAfterErase.events).toHaveLength(0)

    // Complete fresh onboarding with a different trigger to enter app
    await page.getByRole('button', { name: 'TikTok' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()

    // Navigate to settings to test import
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Test rejection of invalid file (no crash, toast shown, no overwrite)
    await page.locator('#import-file').setInputFiles({
      name: 'corrupt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{not-json', 'utf-8'),
    })
    await expect(page.locator('.toast')).toContainText('That file is not a Supacon export.')
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toHaveCount(0)

    // Select valid export file
    await page.locator('#import-file').setInputFiles({
      name: 'supacon-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text, 'utf-8'),
    })

    // Confirm dialog is shown with preview of counts (no silent overwrite!)
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toBeVisible()
    await expect(page.locator('#dialog-body')).toContainText('1 pause')

    // Click Cancel — verify dialog dismisses and data remains unchanged
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toHaveCount(0)
    const cancelledDb = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(cancelledDb.events).toHaveLength(0)

    // Select valid export file again and confirm import
    await page.locator('#import-file').setInputFiles({
      name: 'supacon-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text, 'utf-8'),
    })
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toBeVisible()
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    // Redirects to Today with imported flash message
    await expect(page.getByText('Imported.')).toBeVisible()

    // Database in localStorage matches original exported database
    const restoredDb = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(restoredDb.events).toEqual(exportedDb.events)
    expect(restoredDb.startedOn).toEqual(exportedDb.startedOn)
    expect(restoredDb.settings).toEqual(exportedDb.settings)
  })
})
