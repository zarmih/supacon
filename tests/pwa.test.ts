import { describe, expect, it } from 'vitest'

describe('PWA manifest and static assets audit', () => {
  it('contains valid and existing PWA icons and manifest', async () => {
    // Dynamic import to avoid static TS node module resolution issues
    const fs: any = await import('' + 'node:fs')
    const path: any = await import('' + 'node:path')
    const rootDir = path.resolve('.')

    const requiredIcons = [
      'public/favicon.svg',
      'public/icons/apple-touch-icon.png',
      'public/icons/icon-192.png',
      'public/icons/icon-512.png',
      'public/icons/icon-maskable-512.png',
    ]

    for (const iconPath of requiredIcons) {
      const fullPath = path.resolve(rootDir, iconPath)
      expect(fs.existsSync(fullPath), `Icon missing at ${iconPath}`).toBe(true)
      const content = fs.readFileSync(fullPath)
      expect(content.length).toBeGreaterThan(0)
    }
  })

  it('validates index.html PWA tags and meta configuration', async () => {
    const fs: any = await import('' + 'node:fs')
    const path: any = await import('' + 'node:path')
    const rootDir = path.resolve('.')

    const htmlPath = path.resolve(rootDir, 'index.html')
    const html = fs.readFileSync(htmlPath, 'utf-8')

    // Viewport with cover
    expect(html).toContain('viewport-fit=cover')
    expect(html).toContain('interactive-widget=resizes-content')

    // Theme color
    expect(html).toContain('<meta name="theme-color" content="#100e0c" />')

    // Web app capabilities
    expect(html).toContain('<meta name="apple-mobile-web-app-capable" content="yes" />')
    expect(html).toContain('<meta name="mobile-web-app-capable" content="yes" />')
    expect(html).toContain('<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />')
    expect(html).toContain('<meta name="apple-mobile-web-app-title" content="Supacon" />')

    // Icons
    expect(html).toContain('<link rel="icon" href="/favicon.svg" type="image/svg+xml" />')
    expect(html).toContain('<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />')
  })

  it('validates vite.config.ts PWA configuration and workbox precache patterns', async () => {
    const fs: any = await import('' + 'node:fs')
    const path: any = await import('' + 'node:path')
    const rootDir = path.resolve('.')

    const configPath = path.resolve(rootDir, 'vite.config.ts')
    const configContent = fs.readFileSync(configPath, 'utf-8')

    // Workbox globPatterns must precache fonts (.woff2) and static assets
    expect(configContent).toContain("globPatterns: ['**/*.{js,css,html,svg,png,woff2}']")

    // Manifest config
    expect(configContent).toContain("name: 'Supacon'")
    expect(configContent).toContain("short_name: 'Supacon'")
    expect(configContent).toContain("display: 'standalone'")
    expect(configContent).toContain("theme_color: '#100e0c'")
    expect(configContent).toContain("background_color: '#100e0c'")
    expect(configContent).toContain("start_url: '/'")
    expect(configContent).toContain("scope: '/'")
    expect(configContent).toContain("id: '/'")

    // Icons in manifest
    expect(configContent).toContain("src: 'icons/icon-192.png'")
    expect(configContent).toContain("src: 'icons/icon-512.png'")
    expect(configContent).toContain("src: 'icons/icon-maskable-512.png'")
    expect(configContent).toContain("purpose: 'maskable'")
  })

  it('imports Literata and Manrope fonts in main.ts for offline caching', async () => {
    const fs: any = await import('' + 'node:fs')
    const path: any = await import('' + 'node:path')
    const rootDir = path.resolve('.')

    const mainPath = path.resolve(rootDir, 'src/main.ts')
    const mainContent = fs.readFileSync(mainPath, 'utf-8')

    expect(mainContent).toContain("import '@fontsource-variable/literata/wght.css'")
    expect(mainContent).toContain("import '@fontsource-variable/manrope/wght.css'")
    expect(mainContent).toContain("import { registerSW } from 'virtual:pwa-register'")
    expect(mainContent).toContain('registerSW({ immediate: true })')
  })

  it('ensures dist/sw.js precaches fonts, icons, and SPA fallback after build', async () => {
    const fs: any = await import('' + 'node:fs')
    const path: any = await import('' + 'node:path')
    const rootDir = path.resolve('.')

    const swPath = path.resolve(rootDir, 'dist/sw.js')
    if (fs.existsSync(swPath)) {
      const swContent = fs.readFileSync(swPath, 'utf-8')

      // Precached fonts
      expect(swContent).toContain('manrope')
      expect(swContent).toContain('literata')
      expect(swContent).toContain('.woff2')

      // Precached icons and assets
      expect(swContent).toContain('favicon.svg')
      expect(swContent).toContain('icon-192.png')
      expect(swContent).toContain('icon-512.png')
      expect(swContent).toContain('icon-maskable-512.png')
      expect(swContent).toContain('apple-touch-icon.png')
      expect(swContent).toContain('manifest.webmanifest')
      expect(swContent).toContain('index.html')

      // Navigation route fallback
      expect(swContent).toContain('NavigationRoute')
    }
  })
})
