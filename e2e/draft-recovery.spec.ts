import { expect, test, type Page } from '@playwright/test'

const TODAY = 'Notice the impulse. Opening is allowed.'

async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? 'null'))
}

async function storedDraft(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1.draft') ?? 'null'))
}

async function begin(page: Page, triggers: string[] = ['Instagram']) {
  await page.goto('/')
  for (const name of triggers) await page.getByRole('button', { name }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: TODAY })).toBeVisible()
}

/** Into the pause up to the choice step, without choosing. */
async function halfPause(page: Page, trigger = 'instagram') {
  await page.goto(`/#/pause/${trigger}`)
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 4' }).click()
  await page.getByRole('button', { name: 'Boredom' }).click()
  await expect(page.getByRole('heading', { name: 'Choose' })).toBeVisible()
}

test('a reload returns to the same step, and finishing records the pause once', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await halfPause(page)
  await page.getByLabel('Enough looks like').fill('one story')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Choose' })).toBeVisible()
  await expect(page.getByText('4 · Boredom · Instagram')).toBeVisible()
  await expect(page.getByLabel('Enough looks like')).toHaveValue('one story')
  await page.clock.fastForward(11_000)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByText('Closed. The pause counted.')).toBeVisible()
  expect((await stored(page)).events).toHaveLength(1)
  expect(await storedDraft(page)).toBeNull()
  // Coming back to the same link starts a fresh pause, not the finished one.
  await page.goto('/#/pause/instagram')
  await expect(page.getByRole('heading', { name: 'Stop.' })).toBeVisible()
})

test('a closed tab leaves the pause on Today, to continue or discard', async ({ context }) => {
  await context.clock.install()
  const page = await context.newPage()
  await begin(page)
  await halfPause(page)
  const next = await context.newPage()
  await page.close()
  await next.goto('/')
  const card = next.locator('[data-card="recovery"]')
  await expect(card.getByRole('heading', { name: 'A pause is unfinished' })).toBeVisible()
  await expect(card).toContainText('Instagram')
  await expect(card).toContainText('the choice')
  await card.getByRole('button', { name: 'Continue the pause' }).click()
  await expect(next.getByRole('heading', { name: 'Choose' })).toBeVisible()
  await expect(next.getByText('4 · Boredom · Instagram')).toBeVisible()

  // Leaving with answers keeps it; discarding removes it and records nothing.
  await next.goto('/#/today')
  await next.locator('[data-card="recovery"]').getByRole('button', { name: 'Discard it' }).click()
  await expect(next.locator('[data-card="recovery"]')).toHaveCount(0)
  expect(await storedDraft(next)).toBeNull()
  expect((await stored(next)).events).toHaveLength(0)
})

test('Cancel drops the unfinished pause; an untouched start is not offered back', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await halfPause(page)
  await page.getByRole('button', { name: 'Cancel' }).click()
  await expect(page.getByRole('heading', { name: TODAY })).toBeVisible()
  await expect(page.locator('[data-card="recovery"]')).toHaveCount(0)
  await page.goto('/#/pause/instagram')
  await page.goto('/#/today')
  await expect(page.locator('[data-card="recovery"]')).toHaveCount(0)
  expect(await storedDraft(page)).toBeNull()
})

test('a link for another trigger does not throw away the open pause', async ({ page }) => {
  await page.clock.install()
  await begin(page, ['Instagram', 'YouTube'])
  await halfPause(page)
  await page.goto('/#/pause/youtube')
  await expect(page.getByRole('heading', { name: 'A pause for Instagram is still open' })).toBeVisible()
  await page.getByRole('button', { name: 'Continue Instagram' }).click()
  await expect(page.getByText('4 · Boredom · Instagram')).toBeVisible()
  await page.goto('/#/pause/youtube')
  await page.getByRole('button', { name: 'Discard it and pause for YouTube' }).click()
  await expect(page.getByRole('heading', { name: 'Stop.' })).toBeVisible()
  await expect(page.locator('.ritual .kicker')).toHaveText('YouTube')
  expect((await storedDraft(page)).draft.triggerId).toBe('youtube')
})

test('the same pause finished in two tabs is recorded once', async ({ context }) => {
  await context.clock.install()
  const first = await context.newPage()
  await begin(first)
  await halfPause(first)
  const second = await context.newPage()
  await second.goto('/#/pause/instagram')
  // The second tab continues the same unfinished pause instead of starting another one.
  await expect(second.getByText('4 · Boredom · Instagram')).toBeVisible()
  await context.clock.fastForward(11_000)
  await second.getByRole('button', { name: 'Close', exact: true }).click()
  await second.getByRole('button', { name: 'Skip' }).click()
  await expect(second.getByText('Closed. The pause counted.')).toBeVisible()
  await expect(first.getByText('This pause was already saved in another tab. It is in the record once.')).toBeVisible()
  expect((await stored(first)).events).toHaveLength(1)
})

test('when storage refuses the draft the pause still works and says so', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await page.evaluate(() => {
    const original = Storage.prototype.setItem
    Storage.prototype.setItem = function (key: string, value: string) {
      if (key === 'supacon.v1.draft') throw new DOMException('full', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  })
  await halfPause(page)
  await expect(page.getByText('This device is refusing to store the unfinished pause.')).toBeVisible()
  await page.clock.fastForward(11_000)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByText('Closed. The pause counted.')).toBeVisible()
  expect((await stored(page)).events).toHaveLength(1)
})

test('a damaged or old-format draft never breaks the app', async ({ page }) => {
  await begin(page)
  await page.evaluate(() => localStorage.setItem('supacon.v1.draft', '{"draft":{"id":5}'))
  await page.reload()
  await expect(page.getByRole('heading', { name: TODAY })).toBeVisible()
  await expect(page.locator('[data-card="recovery"]')).toHaveCount(0)
  // A draft left in sessionStorage by the previous version is moved over and offered back.
  await page.evaluate(() => {
    localStorage.removeItem('supacon.v1.draft')
    sessionStorage.setItem(
      'supacon.pause',
      JSON.stringify({ id: 'legacy-1', intent: 'browse', triggerId: 'instagram', startedAt: Date.now() - 60_000, step: 'seeking', minSeconds: 10, startedWithArrive: true, awarenessBefore: 6, seekingNote: '', finish: '' }),
    )
  })
  await page.reload()
  await expect(page.locator('[data-card="recovery"]')).toContainText('what you seek')
})
