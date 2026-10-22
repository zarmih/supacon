import { expect, test } from '@playwright/test'

/** Epoch for 2026-10-13 hh:mm in the browser's zone, so the test does not depend on when it runs. */
function wallClock(hhmm: string): number {
  const zone = test.info().project.use.timezoneId ?? Intl.DateTimeFormat().resolvedOptions().timeZone
  const [hour, minute] = hhmm.split(':').map(Number)
  const guess = Date.UTC(2026, 9, 13, hour, minute)
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(guess)
      .map((part) => [part.type, Number(part.value)]),
  )
  return guess - (Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute) - guess)
}

test('day 7 opens the seven-day report and the evening lists every pause', async ({ page }) => {
  // Evening of day 7: the evening card is on Today too, so the checklist row is picked by data-card below.
  await page.clock.install({ time: wallClock('21:00') })
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await page.evaluate(() => {
    const raw = localStorage.getItem('supacon.v1')
    if (!raw) throw new Error('missing record')
    const db = JSON.parse(raw) as { startedOn: string; events: unknown[] }
    const pad = (n: number) => String(n).padStart(2, '0')
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    db.startedOn = iso(start)
    const today = iso(now)
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30).toISOString()
    db.events = [
      {
        id: 'e2e-low',
        at,
        date: today,
        intent: 'browse',
        triggerId: 'instagram',
        awarenessBefore: 3,
        seeking: 'boredom',
        seekingNote: '',
        choice: 'open',
        overLimit: false,
        elapsedSeconds: 10,
        dayNumber: 7,
        phase: 'diagnosis',
      },
    ]
    localStorage.setItem('supacon.v1', JSON.stringify(db))
  })
  await page.reload()
  await page.getByRole('link', { name: /Seven-day report/ }).click()
  await expect(page.getByRole('heading', { name: 'What the seven days recorded' })).toBeVisible()
  await expect(page.getByText('Pauses that happened: 1. Misses: 0.')).toBeVisible()
  await page.getByRole('link', { name: 'Back' }).click()
  await page.locator('a[data-card="eveningReviewLink"]').click()
  await expect(page.getByText('Every pause today')).toBeVisible()
  await expect(page.getByText('Lowest in the record: 00:30 · Instagram · 3.')).toBeVisible()
})
