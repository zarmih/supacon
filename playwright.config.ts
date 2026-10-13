import { defineConfig } from '@playwright/test'

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
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
})
