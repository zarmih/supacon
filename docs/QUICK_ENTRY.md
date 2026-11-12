# Quick entry to the pause

`#/quick` (the old `#/bridge` address opens it too) turns a trigger into one link:

1. **Pick a trigger.** Only enabled triggers are offered.
2. **Your link.** An absolute address of this page with `#/pause/{trigger}`. **Copy link** uses the
   Clipboard API and falls back to a hidden textarea; when both are blocked, the link is still
   selectable in a read-only field.
3. **Test the link.** Opens `#/pause/{trigger}?check=1`. The app resolves the trigger exactly as a
   real launch would and shows “The link works”. It creates no draft and records nothing.

## How a link is resolved

| Link points to | What happens |
| --- | --- |
| an enabled trigger | the pause for that trigger |
| the trigger of an unfinished pause | that pause continues at its step (see PRODUCT.md, “Unfinished pause”) |
| another trigger while a pause with answers is open | a question: continue the open one, or discard it and start this one |
| a switched-off trigger | “… is switched off”: **Turn it on and pause**, or another trigger. Never a substitute. |
| a trigger not on the list (old link, imported record) | “This trigger is not on your list”: another trigger, or quick entry. Never a substitute. |
| `#/pause` with no trigger | the picker; with exactly one enabled trigger, that trigger |
| any trigger while a session runs | the pause, with “Your … session is still running, mm:ss left” and a link back. Choosing Open ends the old session as replaced, as before. |

## What the platforms allow (checked November 2026)

Supacon is a web page. It cannot see another app open, cannot block it, and cannot run in the
background. Anything that opens the pause first is an automation the person sets up on their phone.

**iPhone / iPad**
- Install: Safari → Share → Add to Home Screen, with “Open as Web App” on. There is no install
  prompt API on iOS. ([Apple: web apps](https://developer.apple.com/videos/play/wwdc2023/10120/))
- A Home Screen web app has **storage separate from Safari**. The same address in Safari and in the
  installed app are two different records. ([WebKit bug 181849](https://bugs.webkit.org/show_bug.cgi?id=181849),
  [WWDC23 “What’s new in web apps”](https://developer.apple.com/videos/play/wwdc2023/10120/))
- Links cannot be captured by an installed web app on iOS, so a Shortcuts “Open URLs” action opens
  the link in Safari. ([web.dev: OS integration — URL handling](https://web.dev/learn/pwa/os-integration))
- Shortcuts can run an automation when an app is opened (“App” trigger), and Apple lists App among the
  triggers that may run without asking. Menu names changed across iOS versions; the in-app steps say so.
  ([Apple: Add automations to Shortcuts](https://support.apple.com/guide/shortcuts/create-a-new-personal-automation-apdfbdbd7123/ios))
- Therefore the app tells iPhone users to choose one place: with an automation, practise in Safari;
  with the Home Screen icon, put the icon where the pulling app used to be.

**Android**
- Install from Chrome (menu → Install app). Chrome makes a WebAPK whose intent filters cover the
  app’s scope, and in-scope links from other apps can open in it; it shares site data with Chrome.
  ([web.dev: WebAPKs](https://web.dev/articles/webapks))
- Samsung Modes and Routines can open an app when another app opens; it opens Supacon’s start page,
  not a per-trigger link. Automation apps (MacroDroid, Tasker — third-party) can open a URL on app
  launch. Supacon does not ship or endorse either.
- Manifest shortcuts (`/#/pause`, `/#/post`, …) appear on a long press of the installed icon.

**Notifications**
- Supacon has no push server. Notifications fire only while the page is open
  ([MDN: Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API/Using_the_Notifications_API)).
  The app never promises a reminder when it is closed.

## Not done, on purpose
- No in-app “install” button on iOS (no API) and no detection of whether an automation exists.
- No per-trigger launch through Samsung routines (the routine cannot pass a URL to an installed app).
