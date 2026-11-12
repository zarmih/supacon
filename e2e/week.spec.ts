import { expect, test, type Page } from '@playwright/test'

/** Epoch for a wall-clock time in the browser's zone (see timezoneId in the config). */
function wall(day: number, hhmm = '12:00'): number {
  const zone = test.info().project.use.timezoneId ?? 'Europe/Moscow'
  const [hour, minute] = hhmm.split(':').map(Number)
  const guess = Date.UTC(2026, 10, day, hour, minute)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(guess)
      .map((part) => [part.type, Number(part.value)]),
  )
  return guess - (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - guess)
}

async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? 'null'))
}

/** Onboard on 1 November, then move to the given November day in deepening practice. */
async function practiceOn(page: Page, day: number, patch: (db: Record<string, unknown>) => void = () => {}) {
  await page.clock.install({ time: wall(1, '10:00') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
  await page.evaluate((source) => {
    const db = JSON.parse(localStorage.getItem('supacon.v1')!)
    db.practiceMode = 'deepening'
    new Function('db', source)(db)
    localStorage.setItem('supacon.v1', JSON.stringify(db))
  }, `(${patch.toString()})(db)`)
  await page.clock.setSystemTime(wall(day))
  await page.reload()
}

async function closePause(page: Page) {
  await page.goto('/#/pause/instagram')
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 5' }).click()
  await page.getByRole('button', { name: 'Boredom' }).click()
  await page.clock.fastForward(11_000)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByText('Closed. The pause counted.')).toBeVisible()
}

test('a weekly experiment runs a full cycle: intention, mark, edit, review, next week', async ({ page }) => {
  await practiceOn(page, 10)
  const card = page.locator('[data-card="experimentCard"]')
  await expect(card).toHaveAttribute('href', '#/experiment')
  await card.click()
  await expect(page.getByRole('heading', { name: 'Experiment of the week' })).toBeVisible()

  // An empty intention is refused with a hint, nothing is stored.
  await page.getByRole('button', { name: 'Start the week' }).click()
  await expect(page.getByText('Write the intention. A few words are enough.')).toBeVisible()
  expect((await stored(page)).weekly).toEqual([])

  await page.getByLabel('Intention for the week').fill('Say aloud what I am seeking')
  await expect(page.getByText('10 Nov – 16 Nov')).toBeVisible()
  await page.getByRole('button', { name: 'Start the week' }).click()
  await expect(page.getByRole('heading', { name: 'Say aloud what I am seeking' })).toBeVisible()
  await expect(page.getByText('Day 1 of 7')).toBeVisible()

  await page.getByLabel('Note (optional)').fill('Twice, before YouTube')
  await page.getByRole('button', { name: 'Partly' }).click()
  await expect(page.getByText('Marked: Partly. You can change it.')).toBeVisible()
  await page.getByRole('button', { name: 'It happened' }).click()
  await expect(page.getByRole('button', { name: 'It happened' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: 'Change the intention' }).click()
  await page.getByLabel('Intention for the week').fill('Say it aloud once a day')
  await page.getByRole('button', { name: 'Save the intention' }).click()
  await expect(page.getByRole('heading', { name: 'Say it aloud once a day' })).toBeVisible()

  let db = await stored(page)
  expect(db.weekly).toHaveLength(1)
  expect(db.weekly[0]).toMatchObject({ intention: 'Say it aloud once a day', startDate: '2026-11-10', endDate: '2026-11-16', status: 'active' })
  expect(db.weekly[0].checks).toEqual([expect.objectContaining({ date: '2026-11-10', result: 'did', note: 'Twice, before YouTube' })])

  // Today shows the intention and the mark, without a streak.
  await page.goto('/#/today')
  await expect(card).toContainText('Say it aloud once a day')
  await expect(card).toContainText('Today: It happened')
  await expect(card).not.toContainText(/streak/i)

  // The week passes.
  await page.clock.setSystemTime(wall(17))
  await page.reload()
  await card.getByRole('link', { name: /Weekly review/ }).click()
  await expect(page.getByRole('heading', { name: 'Weekly review' })).toBeVisible()
  await expect(page.getByText('10 Nov – 16 Nov · the week is over')).toBeVisible()
  const sections = page.locator('[data-section]')
  await expect(sections).toHaveCount(3)
  await expect(page.locator('[data-section="observations"]')).toContainText('Intention: happened 1 · partly 0 · not today 0 · no mark 6')
  await expect(page.locator('[data-limit="small-sample"]')).toContainText('Only 0 pauses')
  await expect(page.locator('[data-limit="not-causal"]')).toBeVisible()
  await expect(page.locator('[data-section="next"] [data-step]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Start the next week' }).click()
  await expect(page).toHaveURL(/#\/experiment$/)
  await expect(page.getByText('Experiment ended. The history is kept.')).toBeVisible()
  await expect(page.getByText(/Say it aloud once a day · 10 Nov – 16 Nov · 1 mark/)).toBeVisible()
  db = await stored(page)
  expect(db.weekly[0].status).toBe('finished')
})

test('the weekly review with two pauses shows the count and compares nothing', async ({ page }) => {
  await practiceOn(page, 10)
  await page.goto('/#/experiment')
  await page.getByLabel('Intention for the week').fill('Name enough before opening')
  await page.getByRole('button', { name: 'Start the week' }).click()
  await closePause(page)
  await closePause(page)
  await page.goto('/#/week')
  const observations = page.locator('[data-section="observations"]')
  await expect(observations).toContainText('2 browse pauses in this week')
  await expect(observations).toContainText('Opened 0 · postponed 0 · closed 2')
  await expect(observations).not.toContainText('Week before')
  await expect(page.locator('[data-limit="small-sample"]')).toContainText('Only 2 pauses. At least 4 are needed')
  await expect(page.locator('[data-limit="partial-week"]')).toContainText('1 of 7 days')
  await expect(page.locator('[data-step="more-pauses"]')).toBeVisible()
  // Ending early keeps the record as "ended early".
  await page.getByRole('link', { name: 'Open the experiment' }).click()
  await page.getByRole('button', { name: 'End the experiment' }).click()
  await expect(page.getByText('Experiment ended. The history is kept.')).toBeVisible()
  expect((await stored(page)).weekly[0].status).toBe('stopped')
  expect((await stored(page)).events).toHaveLength(2)
})

test('after a break, an older file without weekly data offers to continue, keeping history', async ({ page }) => {
  await practiceOn(page, 9, (db) => {
    delete db.weekly
  })
  const welcome = page.locator('[data-card="break"]')
  await expect(welcome.getByRole('heading', { name: 'Welcome back' })).toBeVisible()
  await expect(welcome).toContainText('8 days ago. The history is all here.')
  await expect(welcome).not.toContainText(/streak|lost|failed/i)
  await welcome.getByRole('link', { name: /Start a week with one intention/ }).click()
  await page.getByRole('button', { name: 'Say it out loud' }).click()
  await expect(page.getByLabel('Intention for the week')).not.toHaveValue('')
  await page.getByRole('button', { name: 'Start the week' }).click()
  await page.goto('/#/today')
  await expect(page.locator('[data-card="break"]')).toHaveCount(0)
  const db = await stored(page)
  expect(db.weekly).toHaveLength(1)
  expect(db.weekly[0].source).toBe('name-aloud')
  expect(db.startedOn).toBe('2026-11-01')
})
