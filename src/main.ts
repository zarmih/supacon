import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/manrope/wght.css'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'
import { startApp, type AppHandle } from './ui/controller'

const root = document.querySelector('#app')
let app: AppHandle | null = null
if (root instanceof HTMLElement) {
  app = startApp(root, {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
  })
}

// Prompt mode: a new service worker waits until the person accepts the update at a safe moment,
// so an update never reloads the page in the middle of a pause, a timer, or typing.
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    app?.offerUpdate(() => void updateSW(true))
  },
})

if (import.meta.env.DEV) {
  // The service worker is off in dev; e2e uses this to exercise the update prompt.
  ;(window as unknown as { __supaconOfferUpdate?: (apply?: () => void) => void }).__supaconOfferUpdate = (apply) =>
    app?.offerUpdate(apply ?? (() => location.reload()))
}
