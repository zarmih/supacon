import { expect, test } from '@playwright/test'

test('day 7 opens the seven-day report and the evening lists every pause', async ({ page }) => {
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
  await page.getByRole('link', { name: 'Evening review' }).click()
  await expect(page.getByText('Every pause today')).toBeVisible()
  await expect(page.getByText('Lowest in the record: 00:30 · Instagram · 3.')).toBeVisible()
})
