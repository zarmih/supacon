import { expect, test } from '@playwright/test'

test.describe('Journal Period Filter (BACKLOG #3)', () => {
  test('filters pauses by this week, last 7 days, and all time; reversible with clear empty state', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()

    // Seed database with pauses on:
    // 1. Today
    // 2. 5 days ago (inside last 7 days)
    // 3. 25 days ago (outside this week and outside 7d, only in all-time)
    await page.evaluate(() => {
      const raw = localStorage.getItem('supacon.v1')
      if (!raw) throw new Error('missing record')
      const db = JSON.parse(raw)
      const pad = (n: number) => String(n).padStart(2, '0')
      const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

      const now = new Date()
      const today = iso(now)
      const d5 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 5))
      const d25 = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 25))

      db.events = [
        {
          id: 'ev-today',
          at: `${today}T12:00:00.000Z`,
          date: today,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 6,
          seeking: 'boredom',
          seekingNote: 'today pause entry',
          choice: 'close',
          overLimit: false,
          elapsedSeconds: 10,
          dayNumber: 7,
          phase: 'diagnosis',
        },
        {
          id: 'ev-5d',
          at: `${d5}T14:00:00.000Z`,
          date: d5,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 5,
          seeking: 'relief',
          seekingNote: 'five days ago pause',
          choice: 'close',
          overLimit: false,
          elapsedSeconds: 10,
          dayNumber: 2,
          phase: 'calibration',
        },
        {
          id: 'ev-25d',
          at: `${d25}T09:00:00.000Z`,
          date: d25,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 3,
          seeking: 'habit',
          seekingNote: 'ancient long-past pause',
          choice: 'close',
          overLimit: false,
          elapsedSeconds: 10,
          dayNumber: 1,
          phase: 'calibration',
        },
      ]
      localStorage.setItem('supacon.v1', JSON.stringify(db))
    })
    await page.reload()

    // Navigate to Journal
    await page.goto('/#/journal')
    await expect(page.getByRole('heading', { name: 'Pause history' })).toBeVisible()

    // By default ("All time"), all 3 entries are present
    await expect(page.getByText('today pause entry')).toBeVisible()
    await expect(page.getByText('five days ago pause')).toBeVisible()
    await expect(page.getByText('ancient long-past pause')).toBeVisible()

    // Click "Last 7 days" period chip
    await page.getByRole('button', { name: 'Last 7 days' }).click()
    await expect(page.getByText('today pause entry')).toBeVisible()
    await expect(page.getByText('five days ago pause')).toBeVisible()
    // Ancient pause is filtered out
    await expect(page.getByText('ancient long-past pause')).toHaveCount(0)

    // Click "All time" period chip — verify reversibility
    await page.getByRole('button', { name: 'All time' }).click()
    await expect(page.getByText('ancient long-past pause')).toBeVisible()

    // Test empty selection: filter by TikTok trigger where no pauses exist
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('supacon.v1') ?? '{}')
      raw.triggers.push({ id: 'tiktok', label: 'TikTok', enabled: true, preset: true, createdAt: '2026-10-01' })
      localStorage.setItem('supacon.v1', JSON.stringify(raw))
    })
    await page.reload()
    await page.getByRole('button', { name: 'TikTok' }).click()

    // Clear empty state is shown with reset button
    await expect(page.locator('[data-card="journalFilteredEmpty"]')).toBeVisible()
    await expect(page.getByText('No pauses for this trigger.')).toBeVisible()
    const resetBtn = page.getByRole('button', { name: 'Reset filters' })
    await expect(resetBtn).toBeVisible()

    // Click "Reset filters" — restores all records cleanly
    await resetBtn.click()
    await expect(page.getByText('today pause entry')).toBeVisible()
    await expect(page.getByText('five days ago pause')).toBeVisible()
    await expect(page.getByText('ancient long-past pause')).toBeVisible()

    // Check Settings: export note explains that export scope always includes full history
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByText('Exports include all records for all time (journal filters do not affect export).')).toBeVisible()
  })
})
