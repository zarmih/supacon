import { defineConfig, devices } from '@playwright/test'

const mobileSpecs = /mobile\.spec\.ts$/
const pwaSpecs = /pwa\.spec\.ts$/

// Several dev servers can share one machine; E2E_PORT keeps this suite on its own.
const port = Number(process.env.E2E_PORT ?? process.env.PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`
// The PWA project needs the production build; it gets the next port unless E2E_PREVIEW_PORT says otherwise.
const previewPort = Number(process.env.E2E_PREVIEW_PORT ?? port + 1)
const previewURL = `http://127.0.0.1:${previewPort}`
// Reusing a server is opt-in: on a shared machine these ports may belong to another checkout.
const reuseExistingServer = !process.env.CI && process.env.E2E_REUSE_SERVER === '1'

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL,
    locale: 'en-US',
    // Day boundaries and the evening card depend on the local clock; pin the zone.
    timezoneId: process.env.E2E_TZ ?? 'Europe/Moscow',
    viewport: { width: 390, height: 844 },
    colorScheme: 'dark',
  },
  projects: [
    { name: 'chromium', testIgnore: [mobileSpecs, pwaSpecs] },
    // Mobile smoke on real device profiles (viewport, DPR, touch, UA). CI installs only Chromium,
    // so the iPhone profile keeps its metrics but is driven by Chromium.
    { name: 'iphone', testMatch: mobileSpecs, use: { ...devices['iPhone 13'], browserName: 'chromium', defaultBrowserType: 'chromium' } },
    { name: 'pixel', testMatch: mobileSpecs, use: { ...devices['Pixel 7'] } },
    // Service worker, manifest and offline need the production build (the SW is off in dev).
    { name: 'pwa', testMatch: pwaSpecs, use: { ...devices['Pixel 7'], baseURL: previewURL } },
  ],
  webServer: [
    {
      command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
      url: baseURL,
      reuseExistingServer,
    },
    {
      command: `npx vite build --logLevel warn && npx vite preview --host 127.0.0.1 --port ${previewPort} --strictPort`,
      url: previewURL,
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
})
