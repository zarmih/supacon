# Supacon

A thin awareness layer between an ancient impulse and the next tap.

Supacon is not a blocker and not a detox. Instincts stay. The practice is to notice one, stay with it for a breath, name what you are seeking, and then choose. Opening is always allowed. The record is what you learn from.

The seven-day protocol lives in [PROTOCOL.md](PROTOCOL.md). The original screen sketch is [APP_SPEC.md](APP_SPEC.md). The decisions behind this app are in [PRODUCT.md](PRODUCT.md).

## Run

Requires Node 20 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually http://localhost:5173). The app is a local-first PWA: the record is a JSON document in `localStorage` under the key `supacon.v1`. There is no account and no server.

```bash
npm run typecheck   # tsc --noEmit
npm test            # domain and storage tests
npm run build       # typecheck, then the production bundle in dist/
npm run preview     # serve dist/
npm run test:e2e    # Playwright against the dev server
npm run icons       # regenerate the PWA icons
```

## Use

1. On the first screen, mark what pulls you. Instagram, YouTube, a chat, a custom name. At least one. Supacon always keeps “Something else” available.
2. Begin day 1, or skip the seven days and practice without a cap.
3. When the pull shows up, open Supacon first and tap **Pause**. The first three browse pauses include an arrival beat (“I’m here”). Then you score awareness from 1 to 10, name what you are seeking, and choose **Open**, **Postpone**, or **Close**. The choice stays locked until the breath finishes (10 seconds by default) and both answers exist. A second score afterwards is optional.
4. Days 1–2 are calibration: there is no session cap, so the baseline is honest. From day 3 the default cap is 3 sessions of 15 minutes. Opening past the cap is labeled and logged. It is never hidden.
5. When you choose Open, you can name what “enough” looks like. An open without that line is logged as unfinished. Closing or postponing shows one replacement for the function you named: a person, a finite rep, a saved piece with an ending.
6. **Windows and replacements**, from Today or Settings, is the plan you write while calm: up to three check times, a night hour with the phone out of reach, and your own replacement lines. The pause will mention them. It will not stop you.
7. Morning check-in, one focus block, and the evening review sit on Today. Days 5–6 ask whether a real conversation happened. Day 7 asks for a short diagnosis.
8. After day 7, choose how to continue: keep the cap, add one small weekly experiment, or drop the cap until you set a new one.
9. Insights stay quiet until a few pauses exist. You can load an example week to see the shape of a finished record, then erase it. The letter only states claims the numbers support: a threshold, a trained loop where the open did not deliver, a finish-line gap, one leading function. It does not sort people by sex, and it does not call this a detox.

Language follows the device and can be switched to English or Russian in Settings. Themes are Ink, Paper, and System.

### Install

After `npm run build`, serve `dist/` over HTTPS (or localhost). In Chrome or Edge, Settings offers install when the browser fires `beforeinstallprompt`.

On iPhone: Safari → Share → Add to Home Screen. The installed icon opens Supacon fullscreen. iOS will not run a scheduled notification after you leave the page. The card on Today is the reminder that still works.

### What a website cannot do

Supacon cannot stand in front of Instagram, a browser tab, or any other app. That is a platform limit, not a missing feature. The rep is opening Supacon first, or placing its icon beside the thing that pulls you. A future native shell could sit closer to the other app. The pause itself would stay the same.

Notifications for a postponed wait, a finished focus block, or the evening review fire only while this page is open and permission is granted.

## Privacy

Everything stays on this device. Export writes `supacon-YYYY-MM-DD.json`. Import replaces the record after checking the schema. A record from the first version is read and kept. A file this version does not understand is refused, and the previous record is copied to `supacon.v1.bak` when a save cannot be read. Erase deletes the record. Uninstalling the site deletes it too.

## Layout

```
src/domain     protocol, pause, insights, hints, letter  (no DOM)
src/store      defaults, mutations, localStorage
src/ui         hash router, screens, one controller
src/i18n       English and Russian
src/platform   notifications while the page is open
e2e            the pause, a session, day 7, language
tests          the rules those screens rely on
```

The interface has no framework. Domain functions are pure and tested. The screen is a string of HTML redrawn when the route or the shape of a timer changes. Clocks are timestamps, so leaving the tab does not pause a session.

## Philosophy

The person of the future is not someone who deleted their ancient programs. It is someone who can observe them in real time and choose.
