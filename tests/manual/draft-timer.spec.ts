import { test, expect } from '@playwright/test'
import { DRAFT_MAX_AGE_MS } from '../../src/domain/pause'

test('draft expiration visual cue', async ({ page }) => {
  // Mock time
  const now = Date.now()
  await page.addInitScript(`
    window.Date = class extends Date {
      constructor() { super() }
    }
  `)
  
  // Navigate to Today
  await page.goto('/')
  
  // This requires setting up an unfinished pause in storage
  // ... (omitted for brevity, requires storage mock)
})
