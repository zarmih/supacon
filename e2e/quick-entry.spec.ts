import { expect, test, type Page } from '@playwright/test'

const TODAY = 'Notice the impulse. Opening is allowed.'

async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? 'null'))
}

test('new install → trigger → quick link → test launch → pause → choice → one saved record', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only')
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'YouTube' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: TODAY })).toBeVisible()

  // The first pause is reachable straight away; the setup is one link away, not a manual.
  const first = page.locator('[data-card="firstPause"]')
  await expect(first).toContainText('Your first pause takes about twenty seconds')
  await first.getByRole('link', { name: 'Get a link for your phone' }).click()
  await expect(page.getByRole('heading', { name: 'Quick entry to the pause' })).toBeVisible()

  await page.getByRole('link', { name: 'YouTube' }).click()
  await expect(page.locator('#quick-link')).toHaveValue(/^http:\/\/127\.0\.0\.1:\d+\/#\/pause\/youtube$/)
  await page.getByRole('button', { name: 'Copy link' }).click()
  await expect(page.getByText('Link copied')).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toMatch(/#\/pause\/youtube$/)

  await page.getByRole('link', { name: 'Test the link' }).click()
  await expect(page.getByRole('heading', { name: 'The link works' })).toBeVisible()
  await expect(page.getByText('It opened the pause for YouTube. This was a test, nothing was recorded.')).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('supacon.v1.draft'))).toBeNull()

  // Open the copied link the way a phone shortcut does: a fresh load of the full address.
  await page.goto(copied)
  await expect(page.getByRole('heading', { name: 'Stop.' })).toBeVisible()
  await expect(page.locator('.ritual .kicker')).toHaveText('YouTube')
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 5' }).click()
  await page.getByRole('button', { name: 'Habit' }).click()
  await page.clock.fastForward(11_000)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Score 7' }).click()
  await page.getByRole('button', { name: 'Save this score' }).click()
  await expect(page.getByText('Closed. The pause counted.')).toBeVisible()
  await expect(page.locator('[data-card="firstPause"]')).toHaveCount(0)

  await page.reload()
  const db = await stored(page)
  expect(db.events).toHaveLength(1)
  expect(db.events[0]).toMatchObject({ triggerId: 'youtube', choice: 'close', awarenessBefore: 5, awarenessAfter: 7, seeking: 'habit' })
})

test('a switched-off trigger can be turned on from its link; an unknown one is not replaced', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'TikTok' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await page.goto('/#/triggers')
  await page.locator('li', { hasText: 'TikTok' }).getByRole('button', { name: 'On' }).click()

  await page.goto('/#/pause/tiktok')
  await expect(page.getByRole('heading', { name: 'TikTok is switched off' })).toBeVisible()
  await expect(page.getByText('A switched-off trigger is not replaced by another one.')).toBeVisible()
  await page.getByRole('button', { name: 'Turn it on and pause' }).click()
  await expect(page.getByRole('heading', { name: 'Stop.' })).toBeVisible()
  await expect(page.locator('.ritual .kicker')).toHaveText('TikTok')
  expect((await stored(page)).triggers.find((t: { id: string }) => t.id === 'tiktok').enabled).toBe(true)

  await page.goto('/#/pause/snapchat')
  await expect(page.getByRole('heading', { name: 'This trigger is not on your list' })).toBeVisible()
  await expect(page.getByText('The link points to “snapchat”.')).toBeVisible()
  await expect(page.getByRole('button', { name: "I'm here" })).toHaveCount(0)
  await page.getByRole('link', { name: 'Pause for another trigger' }).click()
  await expect(page.getByRole('heading', { name: 'What is pulling?' })).toBeVisible()
})

test('opening the link while a session runs says so and leads back to it', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await page.goto('/#/pause/instagram')
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 6' }).click()
  await page.getByRole('button', { name: 'Habit' }).click()
  await page.clock.fastForward(11_000)
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page).toHaveURL(/#\/session\//)

  await page.goto('/#/pause/instagram')
  const note = page.locator('[data-note="session-running"]')
  await expect(note).toContainText('Your Instagram session is still running')
  await note.getByRole('link', { name: 'Back to the session' }).click()
  await expect(page).toHaveURL(/#\/session\//)
  expect((await stored(page)).sessions).toHaveLength(1)
})
