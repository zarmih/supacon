import { expect, test, type Page } from '@playwright/test'

async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? 'null'))
}

async function startPause(page: Page, score: string, seeking: string) {
  await page.getByRole('link', { name: 'Pause', exact: true }).click()
  await page.getByRole('link', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: score }).click()
  await page.getByRole('button', { name: seeking }).click()
}

test('two tabs keep each other’s pauses and settings, and a pause in progress survives', async ({ context }) => {
  await context.clock.install()
  const first = await context.newPage()
  await first.goto('/')
  await first.getByRole('button', { name: 'Instagram' }).click()
  await first.getByRole('button', { name: 'Begin day 1' }).click()
  const today = 'Notice the impulse. Opening is allowed.'
  await expect(first.getByRole('heading', { name: today })).toBeVisible()

  const second = await context.newPage()
  await second.goto('/')
  await expect(second.getByRole('heading', { name: today })).toBeVisible()

  // The first tab is midway through a pause when the second tab commits one.
  await startPause(first, 'Score 4', 'Boredom')
  await startPause(second, 'Score 6', 'Habit')
  await context.clock.fastForward(11_000)
  await second.getByRole('button', { name: 'Close', exact: true }).click()
  await second.getByRole('button', { name: 'Skip' }).click()
  await expect(second.getByText('Closed. The pause counted.')).toBeVisible()
  await expect.poll(async () => (await stored(first)).events.length).toBe(1)

  // The second tab then switches Instagram off. The pause already running in the first tab keeps going.
  await second.goto('/#/triggers')
  await second.locator('li', { hasText: 'Instagram' }).getByRole('button', { name: 'On' }).click()
  await expect(second.locator('li', { hasText: 'Instagram' }).getByRole('button', { name: 'Off' })).toBeVisible()
  await expect.poll(async () => (await stored(first)).triggers[0].enabled).toBe(false)

  // The pause in the first tab is untouched and commits on top of the other tab's record.
  await expect(first.getByRole('heading', { name: 'Choose' })).toBeVisible()
  await expect(first.getByText('4 · Boredom · Instagram')).toBeVisible()
  await first.getByRole('button', { name: 'Postpone 30 min' }).click()
  await first.getByRole('button', { name: 'Skip' }).click()
  await expect(first.getByText('Instagram is postponed.')).toBeVisible()

  const db = await stored(first)
  expect(db.events).toHaveLength(2)
  expect(new Set(db.events.map((item: { id: string }) => item.id)).size).toBe(2)
  expect(db.events.map((item: { seeking: string }) => item.seeking).sort()).toEqual(['boredom', 'habit'])
  expect(db.postpones).toHaveLength(1)

  // A settings change in one tab does not erase records from the other, and arrives there.
  await second.goto('/#/settings')
  await second.getByRole('button', { name: 'Paper' }).click()
  await expect.poll(() => first.evaluate(() => document.documentElement.dataset.theme)).toBe('paper')
  const after = await stored(second)
  expect(after.events).toHaveLength(2)
  expect(after.postpones).toHaveLength(1)
  expect(after.settings.theme).toBe('paper')
})
