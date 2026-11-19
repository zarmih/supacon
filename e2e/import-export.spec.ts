import { expect, test } from '@playwright/test'

async function begin(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
}

test.describe('export and import round-trip', () => {
  test('export JSON → erase → preview & confirm import → identical data', async ({ page }) => {
    await page.clock.install()
    await begin(page)

    // Complete a pause to create rich data
    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()
    await page.getByRole('button', { name: 'Score 4' }).click()
    await page.getByRole('button', { name: 'Boredom' }).click()
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeDisabled()
    await page.clock.fastForward(11_000)
    await expect(page.getByRole('button', { name: 'Close', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
    await page.getByRole('button', { name: 'Score 6' }).click()
    await page.getByRole('button', { name: 'Save this score' }).click()
    await expect(page.getByText('Closed. The pause counted.')).toBeVisible()

    // Navigate to settings
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Export JSON
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export JSON' }).click()
    const download = await downloadPromise
    const stream = await download.createReadStream()
    let text = ''
    for await (const chunk of stream) {
      text += chunk
    }
    const exportedDb = JSON.parse(text)
    expect(exportedDb.events).toHaveLength(1)
    expect(exportedDb.events[0].choice).toBe('close')

    // Erase all data
    await page.getByRole('button', { name: 'Erase all data' }).click()
    await expect(page.getByRole('heading', { name: 'Erase everything on this device?' })).toBeVisible()
    await page.getByRole('button', { name: 'Erase', exact: true }).click()

    // App returns to fresh state (onboarding)
    await expect(page.getByRole('heading', { name: 'Instincts are fuel.' })).toBeVisible()
    const rawAfterErase = await page.evaluate(() => localStorage.getItem('supacon.v1'))
    const dbAfterErase = JSON.parse(rawAfterErase ?? '{}')
    expect(dbAfterErase.events).toHaveLength(0)

    // Complete fresh onboarding with a different trigger to enter app
    await page.getByRole('button', { name: 'TikTok' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()

    // Navigate to settings to test import
    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    // Test rejection of invalid file (no crash, toast shown, no overwrite)
    await page.locator('#import-file').setInputFiles({
      name: 'corrupt.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{not-json', 'utf-8'),
    })
    await expect(page.locator('.toast')).toContainText('That file is not a Supacon export.')
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toHaveCount(0)

    // Select valid export file
    await page.locator('#import-file').setInputFiles({
      name: 'supacon-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text, 'utf-8'),
    })

    // Confirm dialog is shown with preview of counts (no silent overwrite!)
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toBeVisible()
    await expect(page.locator('#dialog-body')).toContainText('1 pause')

    // Click Cancel — verify dialog dismisses and data remains unchanged
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toHaveCount(0)
    const cancelledDb = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(cancelledDb.events).toHaveLength(0)

    // Select valid export file again and confirm import
    await page.locator('#import-file').setInputFiles({
      name: 'supacon-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(text, 'utf-8'),
    })
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toBeVisible()
    await page.getByRole('button', { name: 'Import', exact: true }).click()

    // Redirects to Today with imported flash message
    await expect(page.getByText('Imported.')).toBeVisible()

    // Database in localStorage matches original exported database
    const restoredDb = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(restoredDb.events).toEqual(exportedDb.events)
    expect(restoredDb.startedOn).toEqual(exportedDb.startedOn)
    expect(restoredDb.settings).toEqual(exportedDb.settings)
  })

  test('(a) import valid backup into empty profile — counts, dates, free text and report match', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()
    await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()

    const pad = (n: number) => String(n).padStart(2, '0')
    const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    const now = new Date()
    const today = iso(now)
    const startDate = iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6))

    const richDb = {
      version: 2,
      settings: {
        lang: 'en',
        theme: 'ink',
        maxSessionsPerDay: 3,
        sessionMinutes: 15,
        postponeMinutes: 30,
        focusMinutes: 45,
        pauseSeconds: 10,
        notifications: false,
        haptics: true,
        sound: true,
        eveningReminder: null,
        windows: [],
        windowMinutes: 45,
        nightStart: null,
        nightEnd: null,
        replacements: { approval: '', belonging: '', status: '', novelty: '', avoidance: '', loss: '' },
      },
      triggers: [
        { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-10-01T00:00:00.000Z' },
      ],
      startedOn: startDate,
      onboardingComplete: true,
      practiceMode: null,
      events: [
        {
          id: 'ev-1',
          at: `${today}T10:00:00.000Z`,
          date: today,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 4,
          feelingBefore: 'anxious',
          seeking: 'validation',
          seekingNote: 'after tough meeting',
          choice: 'open',
          awarenessAfter: 6,
          feelingAfter: 'calm',
          overLimit: false,
          elapsedSeconds: 12,
          dayNumber: 7,
          finish: 'check one message',
          phase: 'diagnosis',
        },
        {
          id: 'ev-2',
          at: `${today}T15:30:00.000Z`,
          date: today,
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 3,
          seeking: 'relief',
          seekingNote: 'tired afternoon',
          choice: 'open',
          overLimit: true,
          whyPastCap: 'urgent work reply',
          elapsedSeconds: 14,
          dayNumber: 7,
          phase: 'diagnosis',
        },
      ],
      sessions: [
        {
          id: 's-1',
          pauseId: 'ev-1',
          triggerId: 'instagram',
          startedAt: `${today}T10:00:00.000Z`,
          date: today,
          plannedMinutes: 15,
          extendedMinutes: 0,
          awarenessAtStart: 4,
          seeking: 'validation',
          overLimit: false,
        },
        {
          id: 's-2',
          pauseId: 'ev-2',
          triggerId: 'instagram',
          startedAt: `${today}T15:30:00.000Z`,
          date: today,
          plannedMinutes: 15,
          extendedMinutes: 0,
          awarenessAtStart: 3,
          seeking: 'relief',
          overLimit: true,
          whyPastCap: 'urgent work reply',
        },
      ],
      mornings: [
        {
          date: today,
          at: `${today}T07:00:00.000Z`,
          awareness: 5,
          firstDesire: 'morning walk outside',
          phoneFirst15: 'no',
        },
      ],
      evenings: [
        {
          date: today,
          at: `${today}T21:00:00.000Z`,
          lowestMoment: 'late afternoon slump',
          note: 'peaceful day overall',
          unloggedMisses: 0,
          whereItBroke: 'bedtime scrolling',
          likesChanged: 'yes',
        },
      ],
      focuses: [],
      postpones: [],
      misses: [
        {
          id: 'm-1',
          at: `${today}T12:00:00.000Z`,
          date: today,
          triggerId: 'instagram',
          awareness: 4,
          seeking: 'boredom',
          note: 'almost missed pause',
        },
      ],
      dayMarks: [
        {
          date: today,
          realContact: true,
          contactNote: 'lunch with best friend',
        },
      ],
      experiments: [],
      weekly: [],
      demo: false,
    }

    await page.getByRole('link', { name: 'Settings' }).click()
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()

    await page.locator('#import-file').setInputFiles({
      name: 'rich-backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(richDb), 'utf-8'),
    })

    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toBeVisible()
    await expect(page.locator('#dialog-body')).toContainText('2 pauses')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(page.getByText('Imported.')).toBeVisible()

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(stored.events).toHaveLength(2)
    expect(stored.events[0].seekingNote).toBe('after tough meeting')
    expect(stored.events[0].feelingBefore).toBe('anxious')
    expect(stored.events[0].feelingAfter).toBe('calm')
    expect(stored.events[0].finish).toBe('check one message')
    expect(stored.events[1].whyPastCap).toBe('urgent work reply')
    expect(stored.mornings[0].firstDesire).toBe('morning walk outside')
    expect(stored.evenings[0].whereItBroke).toBe('bedtime scrolling')
    expect(stored.evenings[0].lowestMoment).toBe('late afternoon slump')
    expect(stored.dayMarks[0].contactNote).toBe('lunch with best friend')
    expect(stored.misses[0].note).toBe('almost missed pause')

    await page.getByRole('link', { name: /Seven-day report/ }).click()
    await expect(page.getByRole('heading', { name: 'What the seven days recorded' })).toBeVisible()
    await expect(page.getByText('Pauses that happened: 2. Misses: 1.')).toBeVisible()
    await expect(page.getByText('bedtime scrolling')).toBeVisible()

    await page.goto('/#/journal')
    await expect(page.getByText('after tough meeting')).toBeVisible()
    await expect(page.getByText('urgent work reply')).toBeVisible()
  })

  test('(b) import corrupt file — rejection, previous diary readable without changes', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    // Create a distinctive pause with custom note
    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()
    await page.getByRole('button', { name: 'Score 5' }).click()
    await page.getByRole('button', { name: 'Something else' }).click()
    await page.locator('#seeking-note').fill('my precious diary entry')
    await page.getByRole('button', { name: 'Continue' }).click()
    await page.clock.fastForward(11_000)
    await page.getByRole('button', { name: 'Close', exact: true }).click()
    await page.getByRole('button', { name: 'Skip' }).click()

    await page.goto('/#/journal')
    await expect(page.getByText('my precious diary entry')).toBeVisible()

    await page.getByRole('link', { name: 'Settings' }).click()

    await page.locator('#import-file').setInputFiles({
      name: 'broken-syntax.json',
      mimeType: 'application/json',
      buffer: Buffer.from('{"version": 2, "truncated":', 'utf-8'),
    })
    await expect(page.locator('.toast')).toContainText('That file is not a Supacon export.')
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toHaveCount(0)

    await page.locator('#import-file').setInputFiles({
      name: 'unsupported-version.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify({ version: 99, events: [] }), 'utf-8'),
    })
    await expect(page.locator('.toast')).toContainText('That file is not a Supacon export.')
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toHaveCount(0)

    await page.locator('#import-file').setInputFiles({
      name: 'array.json',
      mimeType: 'application/json',
      buffer: Buffer.from('[1, 2, 3]', 'utf-8'),
    })
    await expect(page.locator('.toast')).toContainText('That file is not a Supacon export.')
    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toHaveCount(0)

    await page.goto('/#/journal')
    await expect(page.getByText('my precious diary entry')).toBeVisible()
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(stored.events).toHaveLength(1)
    expect(stored.events[0].seekingNote).toBe('my precious diary entry')
  })

  test('(c) old format (schema v1) migrates without loss', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    await page.getByRole('link', { name: 'Settings' }).click()

    const v1Data = {
      version: 1,
      settings: {
        lang: 'en',
        theme: 'paper',
        maxSessionsPerDay: 2,
        sessionMinutes: 20,
        postponeMinutes: 15,
        focusMinutes: 25,
        pauseSeconds: 5,
        notifications: true,
        eveningReminder: '21:30',
      },
      triggers: [
        { id: 'instagram', label: 'Instagram', preset: true, enabled: true, createdAt: '2026-09-01T08:00:00.000Z' },
      ],
      startedOn: '2026-09-01',
      onboardingComplete: true,
      practiceMode: null,
      events: [
        {
          id: 'v1-e1',
          at: '2026-09-01T19:10:00.000Z',
          date: '2026-09-01',
          intent: 'browse',
          triggerId: 'instagram',
          awarenessBefore: 4,
          seeking: 'boredom',
          seekingNote: 'v1 preserved note',
          choice: 'close',
          awarenessAfter: 5,
          overLimit: false,
          elapsedSeconds: 10,
          dayNumber: 1,
          phase: 'calibration',
        },
      ],
      sessions: [],
      mornings: [{ date: '2026-09-01', at: '2026-09-01T06:00:00.000Z', awareness: 5, firstDesire: 'v1 desire' }],
      evenings: [{ date: '2026-09-01', at: '2026-09-01T21:00:00.000Z', lowestMoment: 'v1 evening lowest', note: '', unloggedMisses: 0 }],
      focuses: [],
      postpones: [],
      misses: [],
      dayMarks: [],
      experiments: [],
      demo: false,
    }

    await page.locator('#import-file').setInputFiles({
      name: 'v1-export.json',
      mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(v1Data), 'utf-8'),
    })

    await expect(page.getByRole('heading', { name: 'Replace this record with imported file?' })).toBeVisible()
    await expect(page.locator('#dialog-body')).toContainText('1 pause')
    await page.getByRole('button', { name: 'Import', exact: true }).click()
    await expect(page.getByText('Imported.')).toBeVisible()

    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('supacon.v1') ?? '{}'))
    expect(stored.version).toBe(2)
    expect(stored.events).toHaveLength(1)
    expect(stored.events[0].id).toBe('v1-e1')
    expect(stored.events[0].seekingNote).toBe('v1 preserved note')
    expect(stored.mornings[0].firstDesire).toBe('v1 desire')
    expect(stored.evenings[0].lowestMoment).toBe('v1 evening lowest')

    expect(stored.settings.haptics).toBe(true)
    expect(stored.settings.sound).toBe(true)
    expect(stored.settings.windows).toEqual([])

    await page.goto('/#/journal')
    await expect(page.getByText('v1 preserved note')).toBeVisible()
  })
})
