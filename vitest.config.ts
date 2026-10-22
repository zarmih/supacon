import { defineConfig } from 'vitest/config'

// Several older UI tests build "today at 20:00Z" and expect it to be the same local date,
// so results depended on the machine's zone (they fail e.g. in Asia/Tokyo). Pin a default zone
// for reproducible runs; override with TEST_TZ=Asia/Tokyo npm test to probe other zones.
// Tests that are about time zones pin their own zone with tests/helpers/tz.ts.
process.env.TZ = process.env.TEST_TZ ?? 'Europe/Moscow'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'src/main.ts'],
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      reportsDirectory: 'coverage',
    },
  },
})
