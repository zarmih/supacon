import { expect, test, type Page } from '@playwright/test'

const TODAY = 'Notice the impulse. Opening is allowed.'

async function begin(page: Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: TODAY })).toBeVisible()
}

/** What the service worker registration does when a new version is waiting (dev hook; the SW is off in dev). */
async function offerUpdate(page: Page) {
  await page.evaluate(() => {
    ;(window as unknown as { __updates: number }).__updates = 0
    ;(window as unknown as { __supaconOfferUpdate: (apply: () => void) => void }).__supaconOfferUpdate(() => {
      ;(window as unknown as { __updates: number }).__updates += 1
      location.reload()
    })
  })
}

const banner = (page: Page) => page.locator('[data-banner="update"]')

test('an update waits while a pause is being typed, then reloads without losing it', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await page.goto('/#/pause/instagram')
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 3' }).click()
  await page.getByRole('button', { name: 'Something else' }).click()
  const note = page.locator('#seeking-note')
  await note.fill('the group chat')
  await offerUpdate(page)
  await page.clock.fastForward(2_000)
  await expect(banner(page)).toHaveCount(0)
  await expect(note).toHaveValue('the group chat')
  await expect(note).toBeFocused()

  // Leaving the pause keeps it as unfinished; Today is a safe moment.
  await page.goto('/#/today')
  await expect(banner(page)).toBeVisible()
  await expect(page.getByText('A new version of Supacon is ready.')).toBeVisible()
  await page.getByRole('button', { name: 'Update now' }).click()
  await page.waitForLoadState('load')
  await expect(page.getByRole('heading', { name: TODAY })).toBeVisible()
  const card = page.locator('[data-card="recovery"]')
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'Continue the pause' }).click()
  await expect(page.locator('#seeking-note')).toHaveValue('the group chat')
})

test('no update while an evening review is open; Later puts it off', async ({ page }) => {
  await begin(page)
  await page.goto('/#/evening')
  await page.locator('#note').fill('long day')
  await offerUpdate(page)
  await page.locator('#note').blur()
  await page.waitForTimeout(600)
  await expect(banner(page)).toHaveCount(0)
  await expect(page.locator('#note')).toHaveValue('long day')
  await page.goto('/#/today')
  await expect(banner(page)).toBeVisible()
  await page.getByRole('button', { name: 'Later' }).click()
  await expect(banner(page)).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { __updates: number }).__updates)).toBe(0)
})

test('no reload is offered while changes are unsaved', async ({ page }) => {
  await begin(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'supacon.v1') throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await page.goto('/#/settings')
  await page.getByRole('button', { name: 'Paper' }).click()
  await expect(page.locator('.storage-banner')).toBeVisible()
  await offerUpdate(page)
  await page.goto('/#/today')
  await page.waitForTimeout(600)
  await expect(banner(page)).toHaveCount(0)
})
