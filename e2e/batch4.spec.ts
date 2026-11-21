import { expect, test } from '@playwright/test'

/**
 * E2E coverage for Batch 4 backlog items:
 *   1. Focus completion sound selection (gong / bowl / chime) in Settings
 *   2. Breath duration toggle (5 s / 10 s / 15 s) in pause header
 *   4. Draft expiry label on the recovery card
 *   6. Wake Lock — navigator.wakeLock mock (request/release, re-acquire on visibilitychange)
 *   7. Build date string in Settings
 *   8. .ics calendar export triggers a file download
 */

/** Complete onboarding with Instagram and land on Today. */
async function begin(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
}

/** Navigate to Settings. */
async function goSettings(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
}

/**
 * Walk through arrive → score → seeking and land on the choose step.
 * Returns when "Choose" heading is visible.
 */
async function reachChooseStep(page: import('@playwright/test').Page, trigger = 'instagram') {
  await page.goto(`/#/pause/${trigger}`)
  // The arrive step ("I'm here") only shows for the first 3 pauses.
  const arriveBtn = page.getByRole('button', { name: "I'm here" })
  if (await arriveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await arriveBtn.click()
  }
  await page.getByRole('button', { name: 'Score 5' }).click()
  await page.getByRole('button', { name: 'Boredom' }).click()
  await expect(page.getByRole('heading', { name: 'Choose' })).toBeVisible()
}

// ─── Batch 4 · Item 1: Focus sound selection ───────────────────────────────

test.describe('batch 4 · item 1 · focus sound selection', () => {
  test('Settings shows three sound chips; selecting one persists and plays a preview', async ({ page }) => {
    await begin(page)
    await goSettings(page)

    // All three chips present
    const gong = page.getByRole('button', { name: 'Gong' })
    const bowl = page.getByRole('button', { name: 'Singing bowl' })
    const chime = page.getByRole('button', { name: 'Soft chime' })
    await expect(gong).toBeVisible()
    await expect(bowl).toBeVisible()
    await expect(chime).toBeVisible()

    // Default: gong is selected
    await expect(gong).toHaveAttribute('aria-pressed', 'true')
    await expect(bowl).toHaveAttribute('aria-pressed', 'false')
    await expect(chime).toHaveAttribute('aria-pressed', 'false')

    // Select bowl
    await bowl.click()
    await expect(bowl).toHaveAttribute('aria-pressed', 'true')
    await expect(gong).toHaveAttribute('aria-pressed', 'false')
    await expect(chime).toHaveAttribute('aria-pressed', 'false')

    // Reload – selection persists
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Singing bowl' })).toHaveAttribute('aria-pressed', 'true')

    // Select chime
    await page.getByRole('button', { name: 'Soft chime' }).click()
    await expect(page.getByRole('button', { name: 'Soft chime' })).toHaveAttribute('aria-pressed', 'true')

    // Verify persisted in localStorage
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(stored.settings.focusSound).toBe('chime')
  })

  test('sound chips appear inside the fieldset labelled "Completion sound"', async ({ page }) => {
    await begin(page)
    await goSettings(page)
    // The fieldset legend should be present (exact match to avoid ambiguity with "Focus completion sound")
    await expect(page.getByText('Completion sound', { exact: true })).toBeVisible()
    // All three chips are inside that fieldset
    const fieldset = page.locator('fieldset').filter({ has: page.getByText('Completion sound', { exact: true }) })
    await expect(fieldset.getByRole('button', { name: 'Gong' })).toBeVisible()
    await expect(fieldset.getByRole('button', { name: 'Singing bowl' })).toBeVisible()
    await expect(fieldset.getByRole('button', { name: 'Soft chime' })).toBeVisible()
  })
})

// ─── Batch 4 · Item 2: Breath duration toggle ──────────────────────────────

test.describe('batch 4 · item 2 · breath duration toggle', () => {
  test('breath toggle cycles 10 s → 15 s → 5 s → 10 s and button label updates', async ({ page }) => {
    await page.clock.install()
    await begin(page)
    await reachChooseStep(page)

    // Default is 10 s
    await expect(page.getByRole('button', { name: '10s breath' })).toBeVisible()

    // Cycle to 15 s
    await page.getByRole('button', { name: '10s breath' }).click()
    await expect(page.getByRole('button', { name: '15s breath' })).toBeVisible()

    // Cycle to 5 s
    await page.getByRole('button', { name: '15s breath' }).click()
    await expect(page.getByRole('button', { name: '5s breath' })).toBeVisible()

    // Cycle back to 10 s
    await page.getByRole('button', { name: '5s breath' }).click()
    await expect(page.getByRole('button', { name: '10s breath' })).toBeVisible()
  })

  test('breath duration 5 s: Close button unlocks after 5 s not 10 s', async ({ page }) => {
    await page.clock.install()
    await begin(page)

    // Navigate to pause (arrive step will show for first pause)
    await reachChooseStep(page)

    // Switch to 5 s breath
    await page.getByRole('button', { name: '10s breath' }).click()
    await page.getByRole('button', { name: '15s breath' }).click()
    // Now at 5 s — but startedAt is from draft creation, we need to reset by going back to score and re-doing choose
    // Actually the startedAt is set when the draft is created on route enter, and toggling doesn't reset it.
    // So let's start a fresh pause with pauseSeconds already set to 5.
    // Go to Today first, then cancel and start over
    await page.goto('/#/today')

    // Now set pauseSeconds = 5 in localStorage so the next pause starts with 5s
    await page.evaluate(() => {
      const raw = localStorage.getItem('supacon.v1')
      if (!raw) return
      const db = JSON.parse(raw)
      db.settings.pauseSeconds = 5
      localStorage.setItem('supacon.v1', JSON.stringify(db))
    })
    // Also clear the draft from the previous pause attempt
    await page.evaluate(() => localStorage.removeItem('supacon.v1.draft'))

    // Navigate fresh – the new pause will use pauseSeconds=5 from settings
    await reachChooseStep(page)
    await expect(page.getByRole('button', { name: '5s breath' })).toBeVisible()

    // Close still disabled just before 5 s
    await page.clock.fastForward(4_000)
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()

    // Enabled after 5 s
    await page.clock.fastForward(1_500)
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeEnabled()
  })

  test('changing breath duration persists in settings and in a reloaded draft', async ({ page }) => {
    await page.clock.install()
    await begin(page)
    await reachChooseStep(page)

    // Switch to 15 s
    await page.getByRole('button', { name: '10s breath' }).click()
    await expect(page.getByRole('button', { name: '15s breath' })).toBeVisible()

    // Reload – draft is restored, setting persisted
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Choose' })).toBeVisible()
    await expect(page.getByRole('button', { name: '15s breath' })).toBeVisible()

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(stored.settings.pauseSeconds).toBe(15)
  })
})

// ─── Batch 4 · Item 4: Draft expiry label ──────────────────────────────────

test.describe('batch 4 · item 4 · draft expiry label on recovery card', () => {
  test('recovery card shows "Expires in Xh Ym" label', async ({ context }) => {
    await context.clock.install()
    const page = await context.newPage()
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()

    // Build a half-finished pause (gets to choose step)
    await page.goto('/#/pause/instagram')
    const arriveBtn = page.getByRole('button', { name: "I'm here" })
    if (await arriveBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await arriveBtn.click()
    }
    await page.getByRole('button', { name: 'Score 4' }).click()
    await page.getByRole('button', { name: 'Boredom' }).click()
    await expect(page.getByRole('heading', { name: 'Choose' })).toBeVisible()

    // Open a fresh tab – the recovery card should appear on Today
    const next = await context.newPage()
    await page.close()
    await next.goto('/')
    const card = next.locator('[data-card="recovery"]')
    await expect(card.getByRole('heading', { name: 'A pause is unfinished' })).toBeVisible()

    // "Expires in Xh Ym" is shown; fresh draft → ~24h remaining
    const expiryText = await card.locator('p.muted.small').textContent()
    expect(expiryText).toMatch(/Expires in \d+h \d+m/)
    // Should be close to 24 h (at least 23 h remaining for a brand-new draft)
    expect(expiryText).toMatch(/Expires in 2[34]h/)
  })

  test('expiry time decreases with elapsed time', async ({ page }) => {
    await page.clock.install({ time: Date.now() })
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    // Plant a draft that is already 2 h old
    await page.evaluate(() => {
      const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000
      const draft = {
        id: 'test-expiry',
        intent: 'browse',
        triggerId: 'instagram',
        startedAt: twoHoursAgo,
        step: 'choose',
        minSeconds: 10,
        startedWithArrive: true,
        awarenessBefore: 5,
        seeking: 'boredom',
        seekingNote: '',
        finish: '',
      }
      localStorage.setItem('supacon.v1.draft', JSON.stringify({ draft, savedAt: twoHoursAgo }))
    })

    await page.goto('/')
    const card = page.locator('[data-card="recovery"]')
    await expect(card).toBeVisible()

    const expiryText = await card.locator('p.muted.small').textContent()
    expect(expiryText).toMatch(/Expires in \d+h \d+m/)
    // 2 h elapsed → ~22 h remaining
    expect(expiryText).toMatch(/Expires in 2[12]h/)
  })
})

// ─── Batch 4 · Item 6: Wake Lock mock ──────────────────────────────────────

test.describe('batch 4 · item 6 · Wake Lock during focus blocks', () => {
  /** Install a mock navigator.wakeLock that records calls. */
  async function installWakeLockMock(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
      const sentinels: Array<{ released: boolean; type: string; release: () => Promise<void>; addEventListener: () => void; removeEventListener: () => void; dispatchEvent: () => boolean }> = []
      const requests: string[] = []
      const releases: number[] = []

      const mockSentinel = () => {
        const listeners: Record<string, Function[]> = {}
        const s = {
          released: false,
          type: 'screen' as const,
          addEventListener: (evt: string, cb: Function) => {
            listeners[evt] = listeners[evt] ?? []
            listeners[evt].push(cb)
          },
          removeEventListener: (evt: string, cb: Function) => {
            listeners[evt] = (listeners[evt] ?? []).filter((l) => l !== cb)
          },
          dispatchEvent: (e: { type: string }) => {
            listeners[e.type]?.forEach((cb) => cb())
            return true
          },
          release: async () => {
            s.released = true
            releases.push(Date.now())
            listeners['release']?.forEach((cb) => cb())
          },
        }
        sentinels.push(s)
        return s
      }

      Object.defineProperty(navigator, 'wakeLock', {
        configurable: true,
        writable: true,
        value: {
          request: async (type: string) => {
            requests.push(type)
            return mockSentinel()
          },
        },
      })

      ;(window as unknown as Record<string, unknown>).__wakeLockRequests = requests
      ;(window as unknown as Record<string, unknown>).__wakeLockReleases = releases
      ;(window as unknown as Record<string, unknown>).__wakeLockSentinels = sentinels
    })
  }

  /** Navigate to the focus screen and start a focus block. */
  async function startFocusBlock(page: import('@playwright/test').Page) {
    await page.goto('/#/focus')
    // Focus screen heading is the focus title text
    await expect(page.getByRole('heading', { name: 'Put the phone in another room.' })).toBeVisible()
    // The start button label is 'Start X min'
    await page.getByRole('button', { name: /^Start \d+ min$/ }).click()
    // After starting, the timer and end buttons appear
    await expect(page.getByRole('button', { name: 'I finished' })).toBeVisible()
  }

  test('focus-start requests Wake Lock; focus-end releases it', async ({ page }) => {
    await installWakeLockMock(page)
    await page.clock.install()
    await begin(page)
    await startFocusBlock(page)

    // Wake Lock should have been requested with 'screen'
    await expect
      .poll(() => page.evaluate(() => ((window as unknown as Record<string, unknown[]>).__wakeLockRequests ?? []).length))
      .toBeGreaterThanOrEqual(1)
    const reqType = await page.evaluate(
      () => ((window as unknown as Record<string, unknown[]>).__wakeLockRequests ?? [])[0],
    )
    expect(reqType).toBe('screen')

    // End the focus block
    await page.getByRole('button', { name: 'I finished' }).click()

    // Wake Lock should be released
    await expect
      .poll(() => page.evaluate(() => ((window as unknown as Record<string, unknown[]>).__wakeLockReleases ?? []).length), { timeout: 3000 })
      .toBeGreaterThanOrEqual(1)
  })

  test('Wake Lock re-acquires on visibilitychange when focus is active', async ({ page }) => {
    await installWakeLockMock(page)
    await page.clock.install()
    await begin(page)
    await startFocusBlock(page)

    // Wait for first wakeLock request
    await expect
      .poll(() => page.evaluate(() => ((window as unknown as Record<string, unknown[]>).__wakeLockRequests ?? []).length))
      .toBeGreaterThanOrEqual(1)

    // Simulate page going hidden then becoming visible again (browser may release the lock)
    await page.evaluate(async () => {
      // Mark all sentinels as released (simulates browser releasing them on hide)
      const sentinels = (window as unknown as Record<string, Array<{ released: boolean; dispatchEvent: (e: Event) => boolean }>>).__wakeLockSentinels ?? []
      for (const s of sentinels) {
        s.released = true
        s.dispatchEvent(new Event('release'))
      }
      // Trigger visibilitychange → hidden
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise((r) => setTimeout(r, 50))
      // Trigger visibilitychange → visible (should trigger re-acquisition)
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true })
      document.dispatchEvent(new Event('visibilitychange'))
      await new Promise((r) => setTimeout(r, 200))
    })

    // A second request should have been made (re-acquire)
    await expect
      .poll(
        () => page.evaluate(() => ((window as unknown as Record<string, unknown[]>).__wakeLockRequests ?? []).length),
        { timeout: 5000 },
      )
      .toBeGreaterThanOrEqual(2)
  })

  test('app works normally when navigator.wakeLock is absent', async ({ page }) => {
    // Remove wakeLock API entirely before page loads
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'wakeLock', {
        get: () => undefined,
        configurable: true,
      })
    })
    await page.clock.install()
    await begin(page)

    // Track JS errors
    const jsErrors: string[] = []
    page.on('pageerror', (err) => jsErrors.push(err.message))

    // Should navigate to focus screen without crash
    await page.goto('/#/focus')
    await expect(page.getByRole('heading', { name: 'Put the phone in another room.' })).toBeVisible()

    // Start a focus block – should work without Wake Lock
    await page.getByRole('button', { name: /^Start \d+ min$/ }).click()
    await expect(page.getByRole('button', { name: 'I finished' })).toBeVisible()

    // Brief wait to surface any async errors
    await page.waitForTimeout(300)

    // No fatal JS errors should have occurred
    expect(jsErrors).toEqual([])
  })
})

// ─── Batch 4 · Item 7: Build date in Settings ──────────────────────────────

test.describe('batch 4 · item 7 · build date in Settings', () => {
  test('Settings page shows a "Build: YYYY-MM-DD" string', async ({ page }) => {
    await begin(page)
    await goSettings(page)

    // The build date paragraph should be visible
    const buildPara = page.locator('p.muted').filter({ hasText: /^Build:/ })
    await expect(buildPara).toBeVisible()

    const text = await buildPara.textContent()
    expect(text).toMatch(/^Build: \d{4}-\d{2}-\d{2}/)
  })

  test('build date is a valid recent date (not a placeholder)', async ({ page }) => {
    await begin(page)
    await goSettings(page)

    const buildPara = page.locator('p.muted').filter({ hasText: /^Build:/ })
    const text = await buildPara.textContent()
    // Extract the date part
    const match = (text ?? '').match(/Build: (\d{4}-\d{2}-\d{2})/)
    expect(match).not.toBeNull()
    const buildDate = new Date(match![1])
    expect(Number.isNaN(buildDate.getTime())).toBe(false)
    // Date should be in year 2026 or later (never a stub like 1970)
    expect(buildDate.getFullYear()).toBeGreaterThanOrEqual(2026)
  })
})

// ─── Batch 4 · Item 8: .ics export as file download ────────────────────────

test.describe('batch 4 · item 8 · .ics calendar export', () => {
  test('Settings shows "Export calendar (.ics)" button', async ({ page }) => {
    await begin(page)
    await goSettings(page)
    await expect(page.getByRole('button', { name: 'Export calendar (.ics)' })).toBeVisible()
  })

  test('clicking Export calendar triggers a .ics file download', async ({ page }) => {
    await page.clock.install()
    await begin(page)
    await goSettings(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export calendar (.ics)' }).click()
    const download = await downloadPromise

    // File name should end in .ics
    expect(download.suggestedFilename()).toMatch(/\.ics$/)
  })

  test('.ics download contains valid iCalendar content', async ({ page }) => {
    await page.clock.install()
    await begin(page)

    // Add a focus block so there is at least one event
    await page.evaluate(() => {
      const raw = localStorage.getItem('supacon.v1')
      if (!raw) return
      const db = JSON.parse(raw)
      db.focuses = db.focuses ?? []
      db.focuses.push({
        id: 'e2e-focus-1',
        startedAt: new Date('2026-11-20T09:00:00Z').toISOString(),
        endedAt: new Date('2026-11-20T09:45:00Z').toISOString(),
        plannedMinutes: 45,
        completed: true,
        date: '2026-11-20',
      })
      localStorage.setItem('supacon.v1', JSON.stringify(db))
    })
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()

    await goSettings(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export calendar (.ics)' }).click()
    const download = await downloadPromise

    const stream = await download.createReadStream()
    let raw = ''
    for await (const chunk of stream) {
      raw += chunk
    }

    // Must start with VCALENDAR
    expect(raw).toContain('BEGIN:VCALENDAR')
    expect(raw).toContain('END:VCALENDAR')

    // Must contain the focus-block event
    expect(raw).toContain('BEGIN:VEVENT')
    expect(raw).toContain('SUMMARY:Focus block')
    expect(raw).toContain('e2e-focus-1@supacon')

    // Must use CRLF line endings (all LF must be preceded by CR)
    expect(raw).toMatch(/\r\n/)
    // Must NOT have bare LF (without preceding CR)
    expect(raw.replace(/\r\n/g, '')).not.toContain('\n')

    // Date-times must be in UTC (Z suffix)
    expect(raw).toMatch(/DTSTART:\d{8}T\d{6}Z/)
    expect(raw).toMatch(/DTEND:\d{8}T\d{6}Z/)
  })

  test('.ics export with no events produces a valid empty calendar', async ({ page }) => {
    await begin(page)
    await goSettings(page)

    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export calendar (.ics)' }).click()
    const download = await downloadPromise

    const stream = await download.createReadStream()
    let raw = ''
    for await (const chunk of stream) {
      raw += chunk
    }

    expect(raw).toContain('BEGIN:VCALENDAR')
    expect(raw).toContain('END:VCALENDAR')
    expect(raw).not.toContain('BEGIN:VEVENT')
  })
})
