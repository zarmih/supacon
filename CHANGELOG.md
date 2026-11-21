# Changelog

All notable changes to the Supacon project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0-rc.1] - 2026-11-21

Release Candidate 1 for Supacon: a local-first Progressive Web Application (PWA) supporting the seven-day mindful awareness protocol.

### Added

- **Release Readiness & Quality Gates (Task 3):**
  - **Service Worker Update Prompt:** Prompt-mode service worker (`registerType: 'prompt'`) that detects new versions and defers reloading until a safe moment (idle state, no active pause, no open input, no unsaved storage error).
  - **Offline Launch & Cold Start Verification:** Zero-external-dependency local startup; automated precaching of all HTML, JS, CSS, variable fonts (Literata and Manrope), manifest, and icons.
  - **Bundle Size Budget (+10% threshold):** Automated budget checking script (`scripts/check-bundle-size.mjs`) and test suite (`tests/bundle-size.test.ts`) that strictly fail if main JS chunk, CSS chunk, total JS, total bundle, or total precache size exceed baseline +10%. Added `npm run check:bundle` script.
  - **Release Checklist (`docs/RELEASE_CHECKLIST.md`):** Comprehensive pre-flight release checklist detailing deployment requirements and items awaiting Mikhail's business decisions (HTTPS/hosting, physical mobile device acceptance, localStorage 5MB diary limit, and IndexedDB backup trade-offs).
- **Sensory Settings & Ritual Customization (Backlog Batch 4):**
  - **Focus Completion Chimes:** WebAudio-synthesized sound options for focus blocks (gentle gong, singing bowl, soft chime) with volume and mute control (`src/platform/audio.ts`).
  - **In-Pause Breath Duration Control:** Header toggle during the pause ritual allowing immediate switching between 5s, 10s, and 15s pacing without leaving the screen.
  - **Draft Expiration Visual Cue:** Live 24-hour remaining countdown displayed on Today's unfinished pause recovery card.
  - **Screen Wake Lock API:** Keeps the display awake during active focus blocks with dark ambient clock face; automatically re-acquires the lock on `visibilitychange` after screen lock/tab switch.
  - **Service Worker Provenance in Settings:** Formatted build date and version hash displayed in Settings (`Build: YYYY-MM-DD (v...)`) for offline users to verify precache freshness.
  - **iCalendar (.ics) Calendar Export:** RFC 5545-compliant calendar export for focus blocks and planned sessions, featuring 75-octet line folding, strict CRLF endings, UTC timestamps, and UTF-8 multi-byte boundary protection.
- **Journal & Analysis Enhancements (Audit S1 & Batch 2):**
  - **Date Range Filtering in Journal:** Filter diary entries by "This week", "Last 7 days", or "All time" with clear empty states and export scope indication.
  - **Over-Limit Reflection ("Why past the cap"):** Optional reason prompt when completing a session beyond the daily session limit (Gap M2).
  - **Insights Diagnostics:** Display total trigger session minutes and sample notes in the Insights tab (Gap M3).
  - **Quiet Post-Pause Cues:** Subtle guidance cues on days 3–4 of the protocol (Gap M4).
  - **Day-by-Day Report Breakdown:** Detailed 7-day progress breakdown with "most-broken" trigger indicator (Gap M8).
- **Protocol & Workflow Integrations (Batch 3 & M1):**
  - **Soft Close & Morning Check-in:** Reminders for evening review closure and morning intentionality check (Gaps M5, M7).
  - **Import Preview Dialog:** Pre-import schema validation and confirmation modal showing event count and date range before overwriting local state.
  - **Optional Feeling Words:** Pre- and post-pause emotional awareness tagging using curated feeling chips or freeform custom text (Gap M1); included in CSV and Markdown diary exports.
  - **Quick Entry System:** Direct deep-link pause launcher (`#/pause/:trigger`) with link generator and clipboard copy utility.
  - **Weekly Experiments:** Structured weekly commitments with dated intentions, daily completion checkmarks, and 3-stage reflection.

### Changed

- Migrated service worker registration from `autoUpdate` to `prompt` mode with `cleanupOutdatedCaches: true`.
- Shifted font delivery to local `@fontsource-variable/literata` and `@fontsource-variable/manrope` packages to eliminate external network requests.
- Hardened `localStorage` persistence layer with an automatic atomic backup key (`supacon.v1.bak`).
- Switched cross-tab communication to non-destructive storage event merging.
- Expanded test coverage to 46 test files and 573 automated tests in Vitest.

### Fixed

- Preserved multi-byte UTF-8 character boundaries during RFC 5545 75-octet iCalendar line folding.
- Fixed wake lock release race condition by re-acquiring lock when returning from background visibility state.
- Resolved draft unwrapping issue when recovering interrupted pauses across browser reloads.
- Protected user data against `QuotaExceededError` storage failures by displaying a persistent error banner with immediate one-click JSON rescue download.
- Prevented unreadable corrupted imports from wiping out valid local databases.
- Enforced strict escaping on CSV and Markdown export fields to prevent injection or broken table formatting.

### Accessibility (a11y) & Internationalization (i18n)

- Verified WCAG 2.1 AA compliance across light and dark themes using Axe automated sweeps.
- Implemented focus-trap management in modal dialogs and preserved focus position across virtual re-renders.
- Guaranteed minimum 44×44px interactive tap targets across all mobile viewports down to 320px width.
- Maintained 100% bilingual parity between Russian (`ru`) and English (`en`) dictionaries, including proper Russian pluralization rules (`1 секунда`, `2 секунды`, `5 секунд`).

---

## [0.1.0-alpha] - 2026-10-13

Initial prototype release of the Supacon practice tool.

### Added

- Core seven-day mindful awareness protocol state machine.
- Local-first zero-framework single page application using TypeScript and Vite.
- Pause ritual flow: breathe, score awareness (1–10), identify impulse, choose response.
- Session timer with postpone and cap controls.
- Local storage persistence with JSON export/import.
- Light and dark theme switching.
