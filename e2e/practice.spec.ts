import { expect, test } from '@playwright/test'

async function begin(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
}

test('a pause can name the impulse and postpone it', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await page.getByRole('link', { name: 'Pause', exact: true }).click()
  await page.getByRole('link', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 4' }).click()
  await page.getByRole('button', { name: 'Boredom' }).click()
  await expect(page.getByRole('button', { name: 'Postpone 30 min' })).toBeDisabled()
  await page.clock.fastForward(11_000)
  await expect(page.getByRole('button', { name: 'Postpone 30 min' })).toBeEnabled()
  await page.getByRole('button', { name: 'Postpone 30 min' }).click()
  await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByText('Instagram is postponed.')).toBeVisible()
  await expect(page.getByText('No pauses yet today.')).toHaveCount(0)
})

test('opening starts a measured session and records whether it was enough', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await page.getByRole('link', { name: 'Pause', exact: true }).click()
  await page.getByRole('link', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 6' }).click()
  await page.getByRole('button', { name: 'Habit' }).click()
  await page.clock.fastForward(11_000)
  await page.getByLabel('Enough looks like').fill('One message')
  await page.getByRole('button', { name: 'Open', exact: true }).click()
  await expect(page.getByText('Enough: One message')).toBeVisible()
  await page.getByRole('button', { name: 'Skip' }).click()
  await expect(page.getByRole('heading', { name: 'Session running' })).toBeVisible()
  await expect(page.getByText('Enough was: One message')).toBeVisible()
  await page.getByRole('button', { name: 'End session' }).click()
  await page.getByRole('button', { name: 'No', exact: true }).click()
  await expect(page.getByText('Session logged.')).toBeVisible()
  await expect(page.getByText('1 session')).toBeVisible()
})

test('morning, focus, and evening land back on today', async ({ page }) => {
  await begin(page)
  await page.getByRole('link', { name: 'Morning check-in' }).click()
  await page.getByRole('button', { name: 'Score 7' }).click()
  await page.getByLabel('The first desire').fill('Coffee before the phone')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Morning · 7')).toBeVisible()

  await page.getByRole('link', { name: 'Focus block', exact: true }).click()
  await page.getByRole('button', { name: 'Start 45 min' }).click()
  await expect(page.getByRole('heading', { name: 'Put the phone in another room.' })).toBeVisible()
  await page.getByRole('button', { name: 'I stopped early' }).click()
  await expect(page.getByText('Stopped early. Logged as it was.')).toBeVisible()

  await page.getByRole('link', { name: 'Evening review' }).click()
  await page.getByLabel('When was awareness lowest?').fill('Late, on the couch')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('link', { name: 'Evening review saved' })).toBeVisible()
})

test('the record can switch language and show an example week', async ({ page }) => {
  await begin(page)
  await page.getByRole('link', { name: 'Insights' }).click()
  await page.getByRole('button', { name: 'Show an example week' }).click()
  await expect(page.getByRole('heading', { name: 'What the record says' })).toBeVisible()
  await expect(page.getByText(/Below 7/).first()).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Русский' }).click()
  await expect(page.getByRole('link', { name: 'Сегодня' })).toBeVisible()
  await expect(page.getByText('Всё остаётся на этом устройстве.')).toBeVisible()
})

test('day 7 asks for the diagnosis', async ({ page }) => {
  await begin(page)
  await page.evaluate(() => {
    const raw = localStorage.getItem('supacon.v1')
    if (!raw) throw new Error('missing record')
    const db = JSON.parse(raw) as { startedOn: string }
    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6)
    const month = String(start.getMonth() + 1).padStart(2, '0')
    const day = String(start.getDate()).padStart(2, '0')
    db.startedOn = `${start.getFullYear()}-${month}-${day}`
    localStorage.setItem('supacon.v1', JSON.stringify(db))
  })
  await page.reload()
  await expect(page.getByText('Day 7 · Diagnosis')).toBeVisible()
  await page.getByRole('link', { name: 'Evening review' }).click()
  await expect(page.getByText('Where did the protocol break?')).toBeVisible()
  await page.getByLabel('Where did the protocol break?').fill('The second open, before the score.')
  await page.getByRole('button', { name: 'Yes', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.locator('li.is-done', { hasText: 'Diagnosis written' })).toBeVisible()
})

test('an address opens one enabled trigger and does not substitute another', async ({ page }) => {
  await begin(page)
  await page.goto('/#/pause?trigger=instagram')
  await expect(page.getByRole('heading', { name: 'Stop.' })).toBeVisible()
  await expect(page.getByText('Instagram', { exact: true })).toBeVisible()

  await page.evaluate(() => {
    const raw = localStorage.getItem('supacon.v1')
    if (!raw) throw new Error('missing record')
    const db = JSON.parse(raw) as { triggers: { id: string; enabled: boolean }[] }
    for (const trigger of db.triggers) {
      if (trigger.id === 'instagram') trigger.enabled = false
    }
    localStorage.setItem('supacon.v1', JSON.stringify(db))
  })
  await page.goto('/#/pause/instagram')
  await page.reload()
  await expect(page.getByRole('heading', { name: 'That trigger is not on your list.' })).toBeVisible()
  await expect(page.getByRole('button', { name: "I'm here" })).toHaveCount(0)

  await page.goto('/#/protocol')
  await page.getByRole('link', { name: 'Put the pause in front' }).click()
  await expect(page.getByRole('heading', { name: 'In front of the other app' })).toBeVisible()
  await expect(page.getByText('Supacon does not close it and does not keep it closed.')).toBeVisible()
  await expect(page.getByText('#/pause/instagram')).toHaveCount(0)
  await expect(page.getByText('#/pause/other')).toBeVisible()
})

test('screenshots of the pause and the record', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await page.screenshot({ path: '/tmp/supacon-shots/01-onboarding.png' })
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'YouTube' }).click()
  await page.getByRole('button', { name: 'News' }).click()
  await page.screenshot({ path: '/tmp/supacon-shots/02-onboarding-picked.png' })
  await page.getByRole('button', { name: 'Begin day 1' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
  await expect(page.getByText('The cap starts on day 3. Today is for noticing.')).toBeVisible()
  await page.screenshot({ path: '/tmp/supacon-shots/03-today.png' })
  await page.getByRole('link', { name: 'Pause', exact: true }).click()
  await page.getByRole('link', { name: 'Instagram' }).click()
  await page.screenshot({ path: '/tmp/supacon-shots/04-stop.png' })
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.getByRole('button', { name: 'Score 3' }).click()
  await page.screenshot({ path: '/tmp/supacon-shots/05-seeking.png' })
  await page.getByRole('button', { name: 'Validation' }).click()
  await page.screenshot({ path: '/tmp/supacon-shots/06-choose-waiting.png' })
  await page.clock.fastForward(11_000)
  await expect(page.getByRole('button', { name: 'Postpone 30 min' })).toBeEnabled()
  await expect(page.getByText('No cap yet. It starts on day 3.')).toBeVisible()
  const offset = Number(await page.locator('[data-ring]').getAttribute('stroke-dashoffset'))
  expect(offset).toBeLessThan(1)
  expect(await copperPixels(page)).toBeGreaterThan(80)
  await page.screenshot({ path: '/tmp/supacon-shots/07-choose-ready.png' })
  await page.getByRole('link', { name: 'Cancel' }).click()
  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Paper' }).click()
  await expect(page.locator('html[data-theme="paper"]')).toBeAttached()
  await expect(page.getByRole('button', { name: 'Paper' })).toHaveAttribute('aria-pressed', 'true')
  const erase = page.getByRole('button', { name: 'Erase all data' })
  await expect(erase).toBeVisible()
  await erase.scrollIntoViewIfNeeded()
  const eraseBox = await erase.boundingBox()
  const tabbar = await page.locator('.tabbar').boundingBox()
  expect(eraseBox).not.toBeNull()
  expect(tabbar).not.toBeNull()
  expect((eraseBox?.y ?? 0) + (eraseBox?.height ?? 0)).toBeLessThanOrEqual((tabbar?.y ?? 0) + 1)
  await page.screenshot({ path: '/tmp/supacon-shots/08-settings-paper.png' })
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByRole('heading', { name: 'Notice the impulse. Opening is allowed.' })).toBeVisible()
  await page.screenshot({ path: '/tmp/supacon-shots/09-desktop.png' })
})

/** Counts copper pixels in the breath ring after computed stroke styles are inlined. */
async function copperPixels(page: import('@playwright/test').Page): Promise<number> {
  return page.evaluate(() => {
    const svg = document.querySelector('svg.ring')
    if (!(svg instanceof SVGSVGElement)) return 0
    const clone = svg.cloneNode(true) as SVGSVGElement
    const sources = svg.querySelectorAll('circle')
    const copies = clone.querySelectorAll('circle')
    sources.forEach((source, index) => {
      const copy = copies[index]
      if (!copy) return
      const style = getComputedStyle(source)
      copy.setAttribute('stroke', style.stroke)
      copy.setAttribute('stroke-width', style.strokeWidth)
      copy.setAttribute('fill', 'none')
      copy.setAttribute('stroke-linecap', style.strokeLinecap)
      const dash = source.getAttribute('stroke-dasharray')
      const off = source.getAttribute('stroke-dashoffset')
      if (dash) copy.setAttribute('stroke-dasharray', dash)
      if (off) copy.setAttribute('stroke-dashoffset', off)
      copy.setAttribute('transform', 'rotate(-90 40 40)')
    })
    clone.setAttribute('width', '160')
    clone.setAttribute('height', '160')
    const xml = new XMLSerializer().serializeToString(clone)
    return new Promise<number>((resolve) => {
      const image = new Image()
      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 160
        canvas.height = 160
        const context = canvas.getContext('2d')
        if (!context) {
          resolve(0)
          return
        }
        context.drawImage(image, 0, 0)
        const data = context.getImageData(0, 0, 160, 160).data
        let count = 0
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index] ?? 0
          const green = data[index + 1] ?? 0
          const blue = data[index + 2] ?? 0
          const alpha = data[index + 3] ?? 0
          if (alpha > 40 && red > 140 && green > 70 && blue < 140 && red > blue) count += 1
        }
        resolve(count)
      }
      image.onerror = () => resolve(0)
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`
    })
  })
}

test('a logged miss stays on the day', async ({ page }) => {
  await begin(page)
  await page.getByRole('link', { name: 'Log a miss' }).click()
  await page.getByRole('button', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: 'Score 2' }).click()
  await page.getByRole('button', { name: 'Habit' }).click()
  await page.getByRole('button', { name: 'Log the miss' }).click()
  await expect(page.getByText('The miss is part of the record.')).toBeVisible()
})

test('a calm plan saves one check window', async ({ page }) => {
  await begin(page)
  await page.getByRole('link', { name: 'Windows and replacements' }).click()
  await expect(page.getByRole('heading', { name: 'Before the hand moves' })).toBeVisible()
  await page.locator('#window-1').fill('09:30')
  await page.getByRole('button', { name: 'Save the plan' }).click()
  await expect(page.getByRole('status')).toHaveText('The plan is saved.')
  const raw = await page.evaluate(() => localStorage.getItem('supacon.v1'))
  const db = JSON.parse(raw ?? '') as { settings: { windows: string[] } }
  expect(db.settings.windows).toEqual(['09:30'])
})

test('settings offer markdown diary and csv export buttons', async ({ page }) => {
  await begin(page)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('button', { name: 'Export diary (.md)' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Export CSV (.csv)' })).toBeVisible()
})

test('keyboard shortcuts can navigate and choose in pause', async ({ page }) => {
  await page.clock.install()
  await begin(page)
  await page.getByRole('link', { name: 'Pause', exact: true }).click()
  await page.getByRole('link', { name: 'Instagram' }).click()
  await page.getByRole('button', { name: "I'm here" }).click()
  await page.keyboard.press('4')
  await expect(page.getByRole('heading', { name: 'What are you seeking?' })).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('button', { name: 'Postpone 30 min' })).toBeDisabled()
  await page.keyboard.press('p')
  await expect(page.getByRole('button', { name: 'Postpone 30 min' })).toBeDisabled()
  await page.clock.fastForward(11_000)
  await expect(page.getByRole('button', { name: 'Postpone 30 min' })).toBeEnabled()
  await page.keyboard.press('p')
  await expect(page.getByRole('heading', { name: 'Did the number move?' })).toBeVisible()
  await page.keyboard.press('6')
  await page.getByRole('button', { name: 'Save this score' }).click()
  await expect(page.getByText('Instagram is postponed.')).toBeVisible()
})

test('offline banner appears when offline event fires', async ({ page }) => {
  await begin(page)
  await expect(page.locator('.offline-banner')).toHaveCount(0)
  await page.evaluate(() => {
    window.dispatchEvent(new Event('offline'))
  })
  const banner = page.locator('.offline-banner')
  await expect(banner).toBeVisible()
  await expect(page.locator('[role="status"].offline-banner')).toBeVisible()
  await expect(banner).toContainText('Supacon works entirely locally. No internet needed.')

  await page.evaluate(() => {
    window.dispatchEvent(new Event('online'))
  })
  await expect(banner).toHaveCount(0)
})

