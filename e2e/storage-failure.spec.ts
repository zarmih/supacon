import { expect, test } from '@playwright/test'

test.describe('Honest persistence and storage failure recovery', () => {
  test('saving plan during storage failure prevents false success, preserves fields, and allows recovery on retry', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    await page.getByRole('link', { name: 'Windows and replacements' }).click()
    await page.locator('#window-1').fill('11:00')

    // Inject storage write failure
    await page.evaluate(() => {
      ;(window as any).__origSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'supacon.v1') {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        }
        return (window as any).__origSetItem.call(this, key, value)
      }
    })

    // Try saving the plan
    await page.getByRole('button', { name: 'Save the plan' }).click()

    // 1. Must NOT show "The plan is saved."
    await expect(page.locator('.toast')).toHaveCount(0)

    // 2. Must NOT lose entered fields
    await expect(page.locator('#window-1')).toHaveValue('11:00')

    // 3. Must show persistent accessible storage alert banner
    const alert = page.locator('.storage-banner[role="alert"]')
    await expect(alert).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Retry saving' })).toBeVisible()
    await expect(alert.getByRole('button', { name: 'Export JSON' })).toBeVisible()

    // 3b. Beforeunload warns the user when unsaved changes exist
    const isPrevented = await page.evaluate(() => {
      const ev = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(ev)
      return ev.defaultPrevented
    })
    expect(isPrevented).toBe(true)

    // 4. In storage, the change is NOT yet saved
    const storedBefore = await page.evaluate(() => localStorage.getItem('supacon.v1'))
    const parsedBefore = JSON.parse(storedBefore!)
    expect(parsedBefore.settings.windows).not.toContain('11:00')

    // 5. Restore storage write capability
    await page.evaluate(() => {
      Storage.prototype.setItem = (window as any).__origSetItem
    })

    // 6. Click "Retry saving"
    await alert.getByRole('button', { name: 'Retry saving' }).click()

    // 7. Banner is dismissed and confirmation toast is displayed
    await expect(alert).toHaveCount(0)
    await expect(page.locator('.toast')).toContainText('Saved to storage.')

    // 8. The database in localStorage now has the change honestly saved
    const storedAfter = await page.evaluate(() => localStorage.getItem('supacon.v1'))
    const parsedAfter = JSON.parse(storedAfter!)
    expect(parsedAfter.settings.windows).toContain('11:00')
  })

  test('pause completion under storage failure does not lose pause or create duplicate on retry', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    await page.getByRole('link', { name: 'Pause', exact: true }).click()
    await page.getByRole('link', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: "I'm here" }).click()
    await page.getByRole('button', { name: 'Score 5' }).click()
    await page.getByRole('button', { name: 'Boredom' }).click()

    await page.clock.fastForward(11_000)
    await expect(page.getByRole('button', { name: 'Close' })).toBeEnabled()

    // Inject storage failure
    await page.evaluate(() => {
      ;(window as any).__origSetItem = Storage.prototype.setItem
      Storage.prototype.setItem = function (key: string, value: string) {
        if (key === 'supacon.v1') {
          throw new DOMException('QuotaExceededError', 'QuotaExceededError')
        }
        return (window as any).__origSetItem.call(this, key, value)
      }
    })

    await page.getByRole('button', { name: 'Close' }).click()
    // Skip second score if present
    const skipBtn = page.getByRole('button', { name: 'Skip' })
    if (await skipBtn.isVisible().catch(() => false)) {
      await skipBtn.click()
    }

    // Must show storage alert banner and NOT show normal success flash
    const alert = page.locator('.storage-banner[role="alert"]')
    await expect(alert).toBeVisible()
    await expect(page.locator('.flash')).toHaveCount(0)

    // Unblock storage
    await page.evaluate(() => {
      Storage.prototype.setItem = (window as any).__origSetItem
    })

    // Retry save
    await alert.getByRole('button', { name: 'Retry saving' }).click()
    await expect(alert).toHaveCount(0)

    // Verify localStorage has exactly 1 event (no duplicates!)
    const raw = await page.evaluate(() => localStorage.getItem('supacon.v1'))
    const db = JSON.parse(raw!)
    const events = db.events.filter((e: any) => e.triggerId === 'instagram')
    expect(events.length).toBe(1)
  })
})
