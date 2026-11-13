import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'

/**
 * A real service-worker update against the production build: a changed sw.js installs and waits;
 * the page is not reloaded under the person; the prompt appears at a safe moment and activates it.
 */
const SW = resolve('dist/sw.js')

async function controlled(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) await page.reload()
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('a new version waits during a pause and activates only when accepted', async ({ page }) => {
  const original = readFileSync(SW, 'utf8')
  try {
    await controlled(page)
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()
    await page.getByRole('button', { name: 'Score 4' }).click()
    await page.evaluate(() => {
      ;(window as unknown as { __marker: string }).__marker = 'same page'
    })

    writeFileSync(SW, `${original}\n// next version ${Date.now()}\n`)
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration()
      await registration?.update()
    })
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)), { timeout: 15_000 }).toBe(true)

    // Still the same page, still the pause, no prompt over it.
    expect(await page.evaluate(() => (window as unknown as { __marker?: string }).__marker)).toBe('same page')
    await expect(page.getByRole('heading', { name: 'What are you seeking?' })).toBeVisible()
    await expect(page.locator('[data-banner="update"]')).toHaveCount(0)

    await page.goto('/#/today')
    await expect(page.locator('[data-banner="update"]')).toBeVisible()
    await page.getByRole('button', { name: 'Update now' }).click()
    const marker = () => page.evaluate(() => (window as unknown as { __marker?: string }).__marker ?? 'reloaded').catch(() => 'navigating')
    await expect.poll(marker, { timeout: 15_000 }).toBe('reloaded')
    await page.waitForLoadState('load')
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting)).catch(() => true)).toBe(false)
    await expect(page.locator('[data-card="recovery"]')).toBeVisible()
  } finally {
    writeFileSync(SW, original)
  }
})
