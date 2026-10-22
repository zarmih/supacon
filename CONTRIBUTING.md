# Contributing

## Setup

Node 20 or newer.

```bash
npm ci
npm run dev          # Vite dev server
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the module layout and data flow.

## Checks

```bash
npm run typecheck      # tsc --noEmit (src + tests)
npm test               # vitest, unit + property tests in tests/
npm run test:coverage  # same with v8 coverage → text summary + coverage/index.html
npm run build          # typecheck + production bundle
npm run test:e2e       # Playwright (e2e/), starts a dev server on 127.0.0.1:4173
```

All four of typecheck, test, build (and e2e when you touch the UI) should pass before a PR.

### Running e2e next to other servers

`playwright.config.ts` reuses an existing server on port 4173 outside CI. If something else may be
listening there, use a local, uncommitted config with another port, e.g. `playwright.local.config.ts`:

```ts
import base from './playwright.config'
export default {
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:4391' },
  webServer: { ...base.webServer, command: 'npm run dev -- --host 127.0.0.1 --port 4391 --strictPort', url: 'http://127.0.0.1:4391', reuseExistingServer: false },
}
```

and run `npx playwright test -c playwright.local.config.ts`.

## Writing tests

- Tests live in `tests/*.test.ts` (vitest, `node` environment). Domain and store code is pure,
  so most tests just build a `Database` and call functions.
- Builders: `tests/helpers/factory.ts` (`pauseEvent`, `session`, `dbWith`, `many`).
- Time zones: never rely on the machine zone. Wrap zone-sensitive assertions in
  `withTZ(zone, () => …)` from `tests/helpers/tz.ts`. The default test zone is `Europe/Moscow`
  (see `vitest.config.ts`); run `TEST_TZ=Asia/Tokyo npm test` to probe another one.
- Property-based tests use [fast-check](https://fast-check.dev/) (`fc.assert(fc.property(…))`).
  Good candidates: escaping / parsing round-trips, normalisation idempotence, state-machine invariants.
- A test that documents a real, not-yet-fixed bug is written as `it.fails(...)` with a comment
  saying what is wrong and what is expected. When the bug is fixed the test starts "failing";
  turn it into a plain `it(...)`. Ideas for later are `it.todo(...)`.

## Commits and branches

- Small, focused commits with conventional prefixes (`feat:`, `fix:`, `test:`, `docs:`, `refactor:`).
- Feature branches target `feat/practice-mvp` until it is merged into `main`.
