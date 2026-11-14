# Product & Technical Backlog

Ideas identified during the quality, accessibility, and offline robustness audit for future consideration (not currently implemented).

1. **Focus completion chime options:** Provide a selection between gentle gong, Tibetan singing bowl, and soft chime for the focus completion bell, catering to varying sensory sensitivities in shared or quiet spaces.
2. **In-pause breath duration control:** Expose the existing `pauseSeconds` setting (5s, 10s, 15s) directly as a subtle toggle in the pause screen header, allowing real-time pacing adjustments without navigating away to Settings.
3. **Journal date interval and impulse filtering:** Expand `#/journal` filtering beyond triggers to include date spans (this week, last 7 days, all-time) and seeking impulses, making pattern reviews effortless as records grow past dozens of entries.
4. **Draft expiration visual cue:** Show remaining validity time on Today's "Unfinished pause" draft recovery card (drafts expire after 24 hours), so people understand why an older abandoned draft is cleared.
5. **Multi-snapshot local backups in IndexedDB:** Supplement the single `supacon.v1.bak` key with a rolling history of timestamped weekly snapshots in IndexedDB, giving users multi-version point-in-time recovery without external files.
6. **Screen Wake Lock for focus blocks:** Optionally request the Screen Wake Lock API during active focus blocks with a minimal, dark clock face, removing the urge to touch the phone to verify remaining focus time.
7. **Service worker cache provenance in Settings:** Display the active service worker build date/version hash in Settings so offline PWA users can confirm their precached assets are up to date.
8. **Calendar export (.ics) for focus blocks:** Support exporting logged focus blocks and planned sessions as an `.ics` calendar file, allowing people to integrate their mindful work intervals with existing calendar tooling.
