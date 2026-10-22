import { expect, test, type Page } from '@playwright/test'

/**
 * Production-build PWA checks (project `pwa`, served by `vite preview`):
 * manifest completeness, Chrome installability, and a full offline reload.
 */

interface Manifest {
  name: string
  short_name: string
  start_url: string
  display: string
  icons: { src: string; sizes: string; purpose?: string }[]
  shortcuts?: { name: string; url: string; icons?: { src: string }[] }[]
  screenshots?: { src: string; sizes: string; form_factor?: string; label?: string }[]
}

async function manifestOf(page: Page): Promise<Manifest> {
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBeTruthy()
  const response = await page.request.get(new URL(href ?? '', page.url()).toString())
  expect(response.ok()).toBe(true)
  return (await response.json()) as Manifest
}

async function controlled(page: Page) {
  await page.goto('/')
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  if (!(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))) {
    await page.reload()
  }
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true)
}

test('manifest is complete: maskable icons, shortcuts, screenshots', async ({ page }) => {
  await page.goto('/')
  const manifest = await manifestOf(page)
  expect(manifest.display).toBe('standalone')
  const purposes = manifest.icons.map((icon) => `${icon.sizes}:${icon.purpose ?? 'any'}`)
  expect(purposes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '192x192:maskable', '512x512:maskable']))

  const pause = manifest.shortcuts?.find((shortcut) => shortcut.url.endsWith('#/pause'))
  expect(pause, 'a shortcut starts a pause').toBeTruthy()
  expect(manifest.screenshots?.some((shot) => shot.form_factor === 'narrow')).toBe(true)
  expect(manifest.screenshots?.some((shot) => shot.form_factor === 'wide')).toBe(true)

  const assets = [
    ...manifest.icons.map((icon) => icon.src),
    ...(manifest.shortcuts ?? []).flatMap((shortcut) => (shortcut.icons ?? []).map((icon) => icon.src)),
    ...(manifest.screenshots ?? []).map((shot) => shot.src),
  ]
  for (const src of assets) {
    const response = await page.request.get(new URL(src, page.url()).toString())
    expect(response.ok(), src).toBe(true)
    expect(response.headers()['content-type'], src).toContain('image/png')
  }
  for (const shot of manifest.screenshots ?? []) {
    const [width, height] = shot.sizes.split('x').map(Number)
    const actual = await page.evaluate(async (src) => {
      const img = new Image()
      img.src = src
      await img.decode()
      return [img.naturalWidth, img.naturalHeight]
    }, shot.src)
    expect(actual, shot.src).toEqual([width, height])
  }
})

test('Chrome reports the app as installable', async ({ page }) => {
  await controlled(page)
  const cdp = await page.context().newCDPSession(page)
  const { installabilityErrors } = (await cdp.send('Page.getInstallabilityErrors')) as {
    installabilityErrors: { errorId: string }[]
  }
  expect(installabilityErrors.map((error) => error.errorId)).toEqual([])
})

test('works fully offline after the first visit, including a pause shortcut', async ({ page, context }) => {
  await controlled(page)
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
  await expect(page.locator('.offline-banner')).toBeVisible()

  // Launching the "Start a pause" shortcut while offline.
  await page.goto('/#/pause')
  await page.getByRole('link', { name: 'Instagram' }).click()
  await expect(page.getByRole('button', { name: "I'm here" })).toBeVisible()
  // Fonts are precached, so the serif heading still renders in Literata offline.
  expect(await page.evaluate(() => document.fonts.check('16px "Literata Variable"'))).toBe(true)
  await context.setOffline(false)
})
