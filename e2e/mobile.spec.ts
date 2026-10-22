import { expect, test, type Page } from '@playwright/test'

/**
 * Mobile smoke, run by the `iphone` and `pixel` projects (touch, DPR, mobile UA).
 * Taps through the core loop and checks phone ergonomics on every screen:
 * no sideways scroll, ≥44px tap targets, inputs that don't trigger iOS zoom.
 */

const SCREENS = ['today', 'insights', 'morning', 'evening', 'focus', 'triggers', 'protocol', 'settings', 'practice', 'plan', 'bridge', 'miss', 'journal', 'pause']
const MIN_TARGET = 44

async function begin(page: Page) {
  await page.goto('/')
  await expect(page.locator('h1').first()).toBeVisible()
  await ergonomics(page, 'onboarding')
  await page.getByRole('button', { name: 'Instagram' }).tap()
  await page.getByRole('button', { name: 'Begin day 1' }).tap()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
}

async function ergonomics(page: Page, label: string) {
  const report = await page.evaluate((min) => {
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect()
      const style = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && style.visibility !== 'hidden'
    }
    const controls = [...document.querySelectorAll('a[href], button, input:not([type=hidden]), textarea, select, [role=button]')]
      .filter(visible)
      // Inline links inside running text are exempt (WCAG 2.5.8 "inline" exception).
      .filter((el) => !(el.tagName === 'A' && el.closest('p, li > span') && getComputedStyle(el).display === 'inline'))
    const small = controls
      .map((el) => {
        const r = el.getBoundingClientRect()
        return { what: `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 30)}"`, w: Math.round(r.width), h: Math.round(r.height) }
      })
      .filter((t) => t.w < min - 0.5 || t.h < min - 0.5)
    const zoomy = [...document.querySelectorAll('input, textarea, select')]
      .filter(visible)
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.id || el.tagName)
    return { overflow: document.documentElement.scrollWidth - window.innerWidth, small, zoomy }
  }, MIN_TARGET)
  expect.soft(report.overflow, `${label}: horizontal overflow`).toBeLessThanOrEqual(0)
  expect.soft(report.small, `${label}: tap targets under ${MIN_TARGET}px`).toEqual([])
  expect.soft(report.zoomy, `${label}: inputs under 16px zoom on iOS focus`).toEqual([])
}

test('core loop by touch', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await ergonomics(page, 'today')
  await page.getByRole('link', { name: 'Pause', exact: true }).tap()
  await page.getByRole('link', { name: 'Instagram' }).tap()
  await ergonomics(page, 'pause · arrive')
  await page.getByRole('button', { name: "I'm here" }).tap()
  await ergonomics(page, 'pause · score')
  await page.getByRole('button', { name: 'Score 5' }).tap()
  await page.getByRole('button', { name: 'Boredom' }).tap()
  await page.clock.fastForward(11_000)
  await ergonomics(page, 'pause · choose')
  await page.getByRole('button', { name: 'Postpone 30 min' }).tap()
  await page.getByRole('button', { name: 'Skip' }).tap()
  await expect(page.getByText('Instagram is postponed.')).toBeVisible()

  // The tab bar stays inside the viewport and isn't covered by the toast.
  const tabbar = await page.locator('.tabbar').boundingBox()
  const viewport = page.viewportSize()
  expect(tabbar && viewport && tabbar.y + tabbar.height).toBeLessThanOrEqual(viewport?.height ?? 0)
})

test('every screen fits a phone', async ({ page }) => {
  await begin(page)
  for (const screen of SCREENS) {
    await page.goto(`/#/${screen}`)
    await expect(page.locator('h1').first()).toBeVisible()
    await ergonomics(page, screen)
  }
})

test('narrowest phones (320px) do not scroll sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 })
  await begin(page)
  for (const screen of SCREENS) {
    await page.goto(`/#/${screen}`)
    await expect(page.locator('h1').first()).toBeVisible()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect.soft(overflow, `${screen} @320px`).toBeLessThanOrEqual(0)
  }
})

test('honours reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await begin(page)
  const durations = await page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .map((el) => getComputedStyle(el))
      .flatMap((s) => [...s.transitionDuration.split(','), ...s.animationDuration.split(',')])
      .map((d) => parseFloat(d) * (d.trim().endsWith('ms') ? 1 : 1000))
      .filter((ms) => ms > 1),
  )
  expect(durations).toEqual([])
})
