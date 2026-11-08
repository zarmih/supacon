import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * axe-core sweep across every screen in both themes (ink = dark, paper = light).
 * Uses WCAG 2.2 A/AA rules; any violation fails with a readable summary.
 */

type Theme = 'ink' | 'paper'
const STORAGE_KEY = 'supacon.v1'
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

async function audit(page: Page, label: string) {
  // Let transitions settle so contrast is measured on final colours.
  await page.waitForTimeout(350)
  // axe cannot compute contrast over CSS gradients and reports such nodes as "incomplete".
  // The gradients here are a faint decorative glow; flatten them to the base surface colour
  // so every text node is actually measured.
  await page.addStyleTag({ content: '*, *::before, *::after { background-image: none !important; }' }).catch(() => {})
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = results.violations
    .map((v) => `${label} · ${v.id} (${v.impact}): ${v.help}\n${v.nodes.map((n) => `    ${n.target.join(' ')} — ${n.failureSummary?.split('\n')[1]?.trim() ?? ''}`).join('\n')}`)
    .join('\n')
  expect.soft(results.violations.length, summary || label).toBe(0)
}

async function begin(page: Page, theme: Theme) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
  await page.evaluate(
    ([key, value]) => {
      const db = JSON.parse(localStorage.getItem(key) ?? '{}')
      db.settings.theme = value
      localStorage.setItem(key, JSON.stringify(db))
    },
    [STORAGE_KEY, theme] as const,
  )
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme)
}

async function visit(page: Page, hash: string, label: string) {
  await page.goto(`/#/${hash}`)
  await expect(page.locator('h1').first()).toBeVisible()
  await audit(page, label)
}

for (const theme of ['ink', 'paper'] as const) {
  test.describe(`axe · ${theme}`, () => {
    test.use({ colorScheme: theme === 'ink' ? 'dark' : 'light' })

    test('onboarding', async ({ page }) => {
      await page.emulateMedia({ colorScheme: theme === 'ink' ? 'dark' : 'light' })
      await page.goto('/')
      await page.evaluate((value) => {
        // Onboarding renders before any record exists; force the theme for the sweep.
        document.documentElement.dataset.theme = value
      }, theme)
      await expect(page.locator('h1').first()).toBeVisible()
      await audit(page, `${theme} onboarding`)
    })

    test('static screens', async ({ page }) => {
      await begin(page, theme)
      await audit(page, `${theme} today`)
      for (const hash of [
        'insights',
        'morning',
        'evening',
        'focus',
        'triggers',
        'protocol',
        'settings',
        'practice',
        'plan',
        'bridge',
        'miss',
        'journal',
        'history',
        'pause',
        'post',
      ]) {
        await visit(page, hash, `${theme} ${hash}`)
      }
    })

    test('pause ritual, session and dialogs', async ({ page }) => {
      await page.clock.install()
      await begin(page, theme)
      await page.getByRole('link', { name: 'Pause', exact: true }).click()
      await page.getByRole('link', { name: 'Instagram' }).click()
      await audit(page, `${theme} pause · arrive`)
      await page.getByRole('button', { name: "I'm here" }).click()
      await audit(page, `${theme} pause · score`)
      await page.getByRole('button', { name: 'Score 6' }).click()
      await audit(page, `${theme} pause · seeking`)
      await page.getByRole('button', { name: 'Habit' }).click()
      await audit(page, `${theme} pause · choose (breathing)`)
      await page.clock.fastForward(11_000)
      await audit(page, `${theme} pause · choose (ready)`)
      await page.getByRole('button', { name: 'Open', exact: true }).click()
      await audit(page, `${theme} pause · after`)
      await page.getByRole('button', { name: 'Skip' }).click()
      await expect(page.getByRole('heading', { name: 'Session running' })).toBeVisible()
      await audit(page, `${theme} session`)
      await page.getByRole('button', { name: 'End session' }).click()
      await audit(page, `${theme} session · end`)
      await page.getByRole('button', { name: 'No', exact: true }).click()
      await audit(page, `${theme} today · with data + toast`)

      await page.getByRole('link', { name: 'Focus block', exact: true }).click()
      await page.getByRole('button', { name: /^Start/ }).click()
      await audit(page, `${theme} focus · running`)
      await page.getByRole('button', { name: 'I stopped early' }).click()

      await page.goto('/#/insights')
      await page.getByRole('button', { name: 'Show an example week' }).click()
      await audit(page, `${theme} insights · example week`)
      await visit(page, 'journal', `${theme} journal · example week`)

      await page.goto('/#/settings')
      await page.getByRole('button', { name: /erase/i }).first().click()
      await expect(page.getByRole('alertdialog')).toBeVisible()
      await audit(page, `${theme} settings · erase dialog`)
    })
  })
}

test.describe('keyboard and focus', () => {
  test('focus survives re-renders and lands on the new screen heading', async ({ page }) => {
    await begin(page, 'ink')
    await page.goto('/#/settings')
    const increase = page.getByRole('group', { name: 'Sessions a day' }).getByRole('button', { name: 'Increase' })
    await increase.focus()
    await page.keyboard.press('Enter')
    // The whole screen re-rendered, but the keyboard user is still on the same control.
    await expect(increase).toBeFocused()

    await page.getByRole('link', { name: 'Pause history' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#step-title')).toBeFocused()
  })

  test('pause ritual is operable by keyboard with focus kept on the ritual', async ({ page }) => {
    await page.clock.install()
    await begin(page, 'ink')
    await page.goto('/#/pause')
    await page.getByRole('link', { name: 'Instagram' }).click()
    await expect(page.locator('#step-title')).toBeFocused()
    await page.getByRole('button', { name: "I'm here" }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('heading', { name: 'How present are you right now?' })).toBeFocused()
  })

  test('confirm dialog takes focus, traps it, and returns it to the opener', async ({ page }) => {
    await begin(page, 'ink')
    await page.goto('/#/settings')
    const erase = page.getByRole('button', { name: /erase/i }).first()
    await erase.focus()
    await page.keyboard.press('Enter')
    const dialog = page.getByRole('alertdialog')
    await expect(dialog).toBeFocused()
    await expect(dialog).toHaveAccessibleName(/.+/)
    for (let i = 0; i < 4; i += 1) {
      await page.keyboard.press('Tab')
      expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true)
    }
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(erase).toBeFocused()
  })
})
