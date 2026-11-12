import { expect, test } from '@playwright/test'

test.describe('Ritual and Input Resilience', () => {
  test('browse pause adheres strictly to breath interval and keyboard controls', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    await page.goto('/#/pause/instagram')
    await page.getByRole('button', { name: "I'm here" }).click()

    // Awareness score via keyboard digit 7
    await page.keyboard.press('7')
    await expect(page.getByRole('heading', { name: 'What are you seeking?' })).toBeVisible()

    // Navigate seeking impulses using arrow keys and select with Enter
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')

    // On choose step: choices must remain disabled before breath seconds elapse
    const closeBtn = page.getByRole('button', { name: 'Close' })
    await expect(closeBtn).toBeDisabled()

    // Pressing 'C' before breath finishes must not trigger choice
    await page.keyboard.press('KeyC')
    await expect(page.getByRole('button', { name: 'Close' })).toBeVisible()

    // Fast-forward breath timer (11s)
    await page.clock.fastForward(11_000)
    await expect(closeBtn).toBeEnabled()

    // Now press 'C' to choose Close
    await page.keyboard.press('KeyC')

    // Optional second score step appears
    await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()

    // Navigated back to today with counted pause
    await expect(page).toHaveURL(/#\/today/)
    await expect(page.getByText('Closed. The pause counted.')).toBeVisible()
  })

  test('post pause ritual works as expected with motives and draft choice', async ({ page }) => {
    await page.clock.install()
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    await page.goto('/#/post/instagram')
    await page.getByRole('button', { name: 'Score 6' }).click()
    await page.getByRole('button', { name: 'Something true' }).click()

    const draftBtn = page.getByRole('button', { name: 'Keep the draft' })
    await expect(draftBtn).toBeDisabled()

    await page.clock.fastForward(11_000)
    await expect(draftBtn).toBeEnabled()
    await draftBtn.click()

    await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
    await page.getByRole('button', { name: 'Skip' }).click()

    await expect(page).toHaveURL(/#\/today/)
    await expect(page.getByText('Left as a draft. The pause counted.')).toBeVisible()
  })

  test('long Russian input survives background ticks and retains cursor position', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    await page.goto('/#/plan')
    const replInput = page.locator('#repl-approval')
    const longRussianText = 'Длинный текст на русском языке: проверка устойчивости фокуса и сохранения позиции курсора во время тиков таймера'
    await replInput.focus()
    await replInput.fill(longRussianText)

    // Wait across multiple timer ticks (3 seconds)
    await page.waitForTimeout(3000)

    // Verify input value remained intact
    await expect(replInput).toHaveValue(longRussianText)

    // Verify cursor/selection is preserved
    const val = await replInput.inputValue()
    expect(val).toBe(longRussianText)
  })

  test('today checklist navigation opens correct screens and preserves state', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'Instagram' }).click()
    await page.getByRole('button', { name: 'Begin day 1' }).click()

    // Morning check-in item
    const morningLink = page.getByRole('link', { name: 'Morning check-in' })
    await expect(morningLink).toBeVisible()
    await morningLink.click()
    await expect(page).toHaveURL(/#\/morning/)
    await page.getByRole('button', { name: 'Score 8' }).click()
    await page.getByLabel('The first desire').fill('Water and deep breath')
    await page.getByRole('button', { name: 'Save' }).click()

    await expect(page).toHaveURL(/#\/today/)
    // Checklist item now reflects completed state
    await expect(page.locator('.checks.interactive li.is-done')).toHaveCount(1)
    await expect(page.getByText('Morning · 8')).toBeVisible()

    // Focus block item
    const focusLink = page.getByRole('link', { name: 'Focus block' })
    await focusLink.click()
    await expect(page).toHaveURL(/#\/focus/)
    await page.getByRole('link', { name: 'Back' }).click()

    // Evening review item
    const eveningLink = page.locator('a[data-card="eveningReviewLink"]')
    await eveningLink.click()
    await expect(page).toHaveURL(/#\/evening/)
  })
})
