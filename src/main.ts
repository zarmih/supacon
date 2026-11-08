import '@fontsource-variable/literata/wght.css'
import '@fontsource-variable/manrope/wght.css'
import { registerSW } from 'virtual:pwa-register'
import './styles.css'
import { startApp } from './ui/controller'

const root = document.querySelector('#app')
if (root instanceof HTMLElement) {
  startApp(root, {
    get: (key) => localStorage.getItem(key),
    set: (key, value) => localStorage.setItem(key, value),
    remove: (key) => localStorage.removeItem(key),
  })
}

registerSW({ immediate: true })
