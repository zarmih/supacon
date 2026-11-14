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

test.describe('feeling word before/after', () => {
  test('pick a word before and after, reload mid-pause restores it, record saved once', async ({ page }) => {
    await page.clock.install()
    await begin(page)

    // Start a pause
    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()
    await expect(page.getByRole('heading', { name: 'How present are you right now?' })).toBeVisible()

    // Feeling chips are present and accessible toggle buttons
    const anxiousChip = page.getByRole('button', { name: 'anxious', exact: true })
    const boredChip = page.getByRole('button', { name: 'bored', exact: true })
    const calmChip = page.getByRole('button', { name: 'calm', exact: true })
    await expect(anxiousChip).toBeVisible()
    await expect(anxiousChip).toHaveAttribute('aria-pressed', 'false')

    // Touch targets are at least 48px
    const box = await anxiousChip.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThanOrEqual(48)
    expect(box!.height).toBeGreaterThanOrEqual(48)

    // Toggle button behavior: click once to turn on, click again to turn off
    await anxiousChip.click()
    await expect(anxiousChip).toHaveAttribute('aria-pressed', 'true')
    await anxiousChip.click()
    await expect(anxiousChip).toHaveAttribute('aria-pressed', 'false')

    // Select bored before score
    await boredChip.click()
    await expect(boredChip).toHaveAttribute('aria-pressed', 'true')

    // Select score and proceed
    await page.getByRole('button', { name: 'Score 5' }).click()
    await expect(page.getByRole('heading', { name: 'What are you seeking?' })).toBeVisible()
    await page.getByRole('button', { name: 'Boredom' }).click()

    await expect(page.getByRole('heading', { name: 'Choose' })).toBeVisible()
    await page.clock.fastForward(11_000)
    await page.getByRole('button', { name: 'Close', exact: true }).click()

    // Now on after step
    await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
    const afterCalmChip = page.getByRole('button', { name: 'calm', exact: true })
    await expect(afterCalmChip).toBeVisible()
    await afterCalmChip.click()
    await expect(afterCalmChip).toHaveAttribute('aria-pressed', 'true')

    await page.getByRole('button', { name: 'Score 7' }).click()

    // Reload mid-pause: draft recovery must keep chosen words and scores
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'calm', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Score 7' })).toHaveAttribute('aria-pressed', 'true')

    // Finish the pause
    await page.getByRole('button', { name: 'Save this score' }).click()
    await expect(page.getByText('Closed. The pause counted.')).toBeVisible()

    // Pause is committed exactly once with feelings recorded
    const db = await stored(page)
    expect(db.events).toHaveLength(1)
    expect(db.events[0]).toMatchObject({
      triggerId: 'instagram',
      awarenessBefore: 5,
      feelingBefore: 'bored',
      awarenessAfter: 7,
      feelingAfter: 'calm',
      choice: 'close',
    })
    expect(await storedDraft(page)).toBeNull()
  })

  test('optional free text feeling up to 40 characters is preserved and clipped', async ({ page }) => {
    await page.clock.install()
    await begin(page)

    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()

    // Custom feeling before via text input
    const longText = 'restless, wanting to see if anything happened online'
    const customBefore = page.locator('#feeling-before')
    await customBefore.fill(longText)
    await page.getByRole('button', { name: 'Score 4' }).click()

    await page.getByRole('button', { name: 'Habit' }).click()
    await page.clock.fastForward(11_000)
    await page.getByRole('button', { name: 'Close', exact: true }).click()

    // Custom feeling after
    const customAfter = page.locator('#feeling-after')
    await customAfter.fill('settled down')

    await page.getByRole('button', { name: 'Save this score' }).click()
    await expect(page.getByText('Closed. The pause counted.')).toBeVisible()

    const db = await stored(page)
    expect(db.events).toHaveLength(1)
    expect(db.events[0].feelingBefore).toBe(longText.slice(0, 40).trim())
    expect(db.events[0].feelingBefore.length).toBeLessThanOrEqual(40)
    expect(db.events[0].feelingAfter).toBe('settled down')
  })

  test('pause works at 320px viewport without horizontal overflow', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 })
    await begin(page)

    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()

    // Check no horizontal scroll on score step with feeling chips
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    const clientWidth = await page.evaluate(() => document.documentElement.clientWidth)
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth)

    // Chips still have >= 48px target height
    const chip = page.getByRole('button', { name: 'curious', exact: true })
    const box = await chip.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.height).toBeGreaterThanOrEqual(48)
  })
})
