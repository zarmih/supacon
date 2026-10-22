import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icons/*.png'],
      manifest: {
        name: 'Supacon',
        short_name: 'Supacon',
        description: 'A thin awareness layer between impulse and action.',
        theme_color: '#100e0c',
        background_color: '#100e0c',
        display: 'standalone',
        start_url: '/',
        scope: '/',
        id: '/',
        lang: 'en',
        dir: 'ltr',
        orientation: 'any',
        categories: ['health', 'lifestyle', 'productivity'],
        // A shortcut launch should reuse the open window instead of stacking a second one.
        launch_handler: { client_mode: 'navigate-existing' },
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          {
            name: 'Start a pause',
            short_name: 'Pause',
            description: 'Notice the impulse before opening the app.',
            url: '/#/pause',
            icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Pause before posting',
            short_name: 'Before posting',
            url: '/#/post',
            icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Morning check-in',
            short_name: 'Morning',
            url: '/#/morning',
            icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }],
          },
          {
            name: 'Evening review',
            short_name: 'Evening',
            url: '/#/evening',
            icons: [{ src: 'icons/shortcut-96.png', sizes: '96x96', type: 'image/png' }],
          },
        ],
        screenshots: [
          { src: 'screenshots/today-narrow.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'Today: pauses, sessions and the day plan' },
          { src: 'screenshots/pause-narrow.png', sizes: '780x1688', type: 'image/png', form_factor: 'narrow', label: 'The pause: name the impulse before opening' },
          { src: 'screenshots/insights-wide.png', sizes: '1280x800', type: 'image/png', form_factor: 'wide', label: 'Insights from the local record' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // Store screenshots are only for the install sheet; keep them out of the offline precache.
        globIgnores: ['**/screenshots/**'],
        navigateFallback: 'index.html',
      },
      devOptions: { enabled: false },
    }),
  ],
})
