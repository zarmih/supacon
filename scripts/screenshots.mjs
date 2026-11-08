// Regenerates the manifest screenshots in public/screenshots.
// Usage: npm run build && npx vite preview --port 4173 & SCREENSHOT_URL=http://127.0.0.1:4173 node scripts/screenshots.mjs
import { mkdirSync } from 'node:fs'
import { chromium } from '@playwright/test'

const base = process.env.SCREENSHOT_URL ?? 'http://127.0.0.1:4173'
mkdirSync('public/screenshots', { recursive: true })
const browser = await chromium.launch()

async function seeded(viewport, deviceScaleFactor, example = true) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block' })
  const page = await context.newPage()
  await page.goto(base)
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  if (!example) return { context, page }
  await page.goto(`${base}/#/insights`)
  await page.getByRole('button', { name: 'Show an example week' }).click()
  const confirm = page.getByRole('alertdialog')
  if (await confirm.isVisible().catch(() => false)) await confirm.getByRole('button').first().click()
  await page.waitForTimeout(300)
  return { context, page }
}

const shot = (page, name) => page.screenshot({ path: `public/screenshots/${name}.png`, animations: 'disabled', caret: 'hide' })

{
  const { context, page } = await seeded({ width: 390, height: 844 }, 2)
  await page.goto(`${base}/#/today`)
  await page.waitForTimeout(300)
  await shot(page, 'today-narrow')
  await context.close()
}
{
  const { context, page } = await seeded({ width: 390, height: 844 }, 2, false)
  await page.goto(`${base}/#/pause`)
  await page.getByRole('link', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.waitForTimeout(300)
  await shot(page, 'pause-narrow')
  await context.close()
}
{
  const { context, page } = await seeded({ width: 1280, height: 800 }, 1)
  await page.goto(`${base}/#/insights`)
  await page.waitForTimeout(300)
  await shot(page, 'insights-wide')
  await context.close()
}
await browser.close()
console.log('screenshots written')
