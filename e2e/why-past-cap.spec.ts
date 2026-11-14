import { expect, test, type Page } from '@playwright/test'
import { emptyDatabase } from '../src/store/defaults'
import { localDate } from '../src/domain/time'
import type { Database } from '../src/domain/types'

async function stored(page: Page): Promise<Database | null> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? 'null'))
}

test.describe('M2: why past the cap', () => {
  test('over-limit session offers optional why past the cap, persists on end, survives reload, shown in journal', async ({ page }) => {
    const today = localDate(new Date())
    const db: Database = {
      ...emptyDatabase(),
      onboardingComplete: true,
      startedOn: today,
      events: [
        {
          id: 'pause-over-1',
          at: new Date().toISOString(),
          date: today,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 4,
          seeking: 'boredom',
          seekingNote: '',
          choice: 'open',
          overLimit: true,
          elapsedSeconds: 12,
          dayNumber: 5,
          phase: 'boundary',
        },
      ],
      sessions: [
        {
          id: 'sess-over-1',
          pauseId: 'pause-over-1',
          triggerId: 'instagram',
          startedAt: new Date().toISOString(),
          date: today,
          plannedMinutes: 15,
          extendedMinutes: 0,
          awarenessAtStart: 4,
          seeking: 'boredom',
          overLimit: true,
        },
      ],
    }

    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await expect(page.getByText('Notice the impulse. Opening is allowed.')).toBeVisible()

    await page.evaluate((extra) => {
      const raw = JSON.parse(localStorage.getItem('supacon.v1') ?? '{}')
      raw.events = extra.events
      raw.sessions = extra.sessions
      localStorage.setItem('supacon.v1', JSON.stringify(raw))
    }, { events: db.events, sessions: db.sessions })
    await page.reload()

    // Navigate to active session
    await page.goto('/#/session/sess-over-1')
    await expect(page.getByRole('heading', { name: 'Session running' })).toBeVisible()
    await expect(page.getByText('Session over the limit. Logged honestly')).toBeVisible()

    // Trigger end flow
    await page.getByRole('button', { name: 'End session' }).click()
    await expect(page.getByText('Why past the cap (optional)')).toBeVisible()

    // Preset chips
    const workChip = page.getByRole('button', { name: 'work / tasks', exact: true })
    await expect(workChip).toBeVisible()
    await expect(workChip).toHaveAttribute('aria-pressed', 'false')

    // 48px touch targets
    const box = await workChip.boundingBox()
    expect(box).toBeTruthy()
    expect(box!.width).toBeGreaterThanOrEqual(48)
    expect(box!.height).toBeGreaterThanOrEqual(48)

    // Toggle behavior
    await workChip.click()
    await expect(workChip).toHaveAttribute('aria-pressed', 'true')
    const input = page.locator('#why-past-cap')
    await expect(input).toHaveValue('work / tasks')

    // Edit input with free text
    await input.fill('urgent server alert')

    // Mid-session reload maintains state
    await page.reload()
    await page.getByRole('button', { name: 'End session' }).click()
    await expect(page.locator('#why-past-cap')).toHaveValue('urgent server alert')

    // End session with answer
    await page.getByRole('button', { name: 'Partly', exact: true }).click()
    await expect(page).toHaveURL(/#\/today/)

    // Verify stored session and event
    const saved = await stored(page)
    expect(saved).not.toBeNull()
    const session = saved!.sessions.find((s) => s.id === 'sess-over-1')
    expect(session?.whyPastCap).toBe('urgent server alert')
    expect(session?.found).toBe('partly')
    const event = saved!.events.find((e) => e.id === 'pause-over-1')
    expect(event?.whyPastCap).toBe('urgent server alert')

    // Check Journal displays why note
    await page.goto('/#/journal')
    await expect(page.getByText('Open past the limit (urgent server alert)')).toBeVisible()
  })

  test('ending over-limit session without choosing why past the cap works and never blocks', async ({ page }) => {
    const today = localDate(new Date())
    const db: Database = {
      ...emptyDatabase(),
      onboardingComplete: true,
      startedOn: today,
      events: [
        {
          id: 'p-skip',
          at: new Date().toISOString(),
          date: today,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 5,
          seeking: 'habit',
          seekingNote: '',
          choice: 'open',
          overLimit: true,
          elapsedSeconds: 10,
          dayNumber: 5,
          phase: 'boundary',
        },
      ],
      sessions: [
        {
          id: 's-skip',
          pauseId: 'p-skip',
          triggerId: 'instagram',
          startedAt: new Date().toISOString(),
          date: today,
          plannedMinutes: 15,
          extendedMinutes: 0,
          awarenessAtStart: 5,
          seeking: 'habit',
          overLimit: true,
        },
      ],
    }

    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await expect(page.getByText('Notice the impulse. Opening is allowed.')).toBeVisible()

    await page.evaluate((extra) => {
      const raw = JSON.parse(localStorage.getItem('supacon.v1') ?? '{}')
      raw.events = extra.events
      raw.sessions = extra.sessions
      localStorage.setItem('supacon.v1', JSON.stringify(raw))
    }, { events: db.events, sessions: db.sessions })
    await page.reload()

    await page.goto('/#/session/s-skip')
    await page.getByRole('button', { name: 'End session' }).click()
    // Do not touch whyPastCap chips or input, just click Yes
    await page.getByRole('button', { name: 'Yes', exact: true }).click()
    await expect(page).toHaveURL(/#\/today/)

    const saved = await stored(page)
    const session = saved!.sessions.find((s) => s.id === 's-skip')
    expect(session?.whyPastCap).toBeUndefined()
    expect(session?.found).toBe('yes')
  })
})
