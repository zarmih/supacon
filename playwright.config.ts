import { defineConfig } from '@playwright/test'

// Several dev servers can share one machine; E2E_PORT keeps this suite on its own.
const port = Number(process.env.E2E_PORT ?? process.env.PORT ?? 4173)
const baseURL = `http://127.0.0.1:${port}`

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
  webServer: {
    command: `npm run dev -- --host 127.0.0.1 --port ${port} --strictPort`,
    url: baseURL,
    // Reusing a server is opt-in: on a shared machine port 4173 may belong to another checkout.
    reuseExistingServer: !process.env.CI && process.env.E2E_REUSE_SERVER === '1',
  },
})
