import { defineConfig, devices } from '@playwright/test'

const mobileSpecs = /mobile\.spec\.ts$/
const pwaSpecs = /pwa\.spec\.ts$/

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    locale: 'en-US',
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
    { name: 'pwa', testMatch: pwaSpecs, use: { ...devices['Pixel 7'], baseURL: 'http://127.0.0.1:4174' } },
  ],
  webServer: [
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npx vite build --logLevel warn && npx vite preview --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
})
