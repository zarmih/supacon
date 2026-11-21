import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Supacon Bundle Size Budget.
 * Baseline captured at Release Candidate v0.1.0-rc.1.
 * Budget threshold: strictly fails if current size exceeds baseline + 10%.
 */
export const BUNDLE_BUDGETS = {
  mainJs: {
    name: 'Main JS Chunk (dist/assets/index-*.js)',
    baselineBytes: 275571, // 275.57 kB
    maxBytes: Math.floor(275571 * 1.10), // 303,128 bytes (+10.0%)
  },
  mainCss: {
    name: 'Main CSS Chunk (dist/assets/index-*.css)',
    baselineBytes: 27267, // 27.27 kB
    maxBytes: Math.floor(27267 * 1.10), // 29,993 bytes (+10.0%)
  },
  totalJs: {
    name: 'Total JS Assets in dist/assets',
    baselineBytes: 281224, // 281.22 kB
    maxBytes: Math.floor(281224 * 1.10), // 309,346 bytes (+10.0%)
  },
  totalBundle: {
    name: 'Total JS + CSS Bundle in dist/assets',
    baselineBytes: 308491, // 308.49 kB
    maxBytes: Math.floor(308491 * 1.10), // 339,340 bytes (+10.0%)
  },
  totalPrecache: {
    name: 'Total Precached Assets (excl. screenshots)',
    baselineBytes: 595824, // 581.86 KiB
    maxBytes: Math.floor(595824 * 1.10), // 655,406 bytes (+10.0%)
  },
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(2)} kB (${bytes} B)`
  return `${(kb / 1024).toFixed(2)} MB (${bytes} B)`
}

export function collectDistMetrics(distDir) {
  if (!fs.existsSync(distDir)) {
    throw new Error(`Build directory not found: ${distDir}. Run 'npm run build' first.`)
  }

  const assetsDir = path.join(distDir, 'assets')
  if (!fs.existsSync(assetsDir)) {
    throw new Error(`Assets directory not found: ${assetsDir}`)
  }

  const assetFiles = fs.readdirSync(assetsDir)

  // Find main JS chunk (index-*.js, not workbox)
  const mainJsFile = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.js'))
  if (!mainJsFile) throw new Error('Main JS chunk index-*.js not found in dist/assets')
  const mainJsBytes = fs.statSync(path.join(assetsDir, mainJsFile)).size

  // Find main CSS chunk (index-*.css)
  const mainCssFile = assetFiles.find((f) => f.startsWith('index-') && f.endsWith('.css'))
  if (!mainCssFile) throw new Error('Main CSS chunk index-*.css not found in dist/assets')
  const mainCssBytes = fs.statSync(path.join(assetsDir, mainCssFile)).size

  // Calculate total JS in dist/assets
  let totalJsBytes = 0
  let totalCssBytes = 0
  for (const file of assetFiles) {
    const filePath = path.join(assetsDir, file)
    const stat = fs.statSync(filePath)
    if (file.endsWith('.js')) totalJsBytes += stat.size
    if (file.endsWith('.css')) totalCssBytes += stat.size
  }

  const totalBundleBytes = totalJsBytes + totalCssBytes

  // Calculate total precache (all dist files except screenshots directory and dev artifacts)
  function getPrecacheSize(dir) {
    let size = 0
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.name === 'screenshots') continue
      const fullPath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        size += getPrecacheSize(fullPath)
      } else if (entry.isFile()) {
        size += fs.statSync(fullPath).size
      }
    }
    return size
  }

  const totalPrecacheBytes = getPrecacheSize(distDir)

  return {
    mainJs: { bytes: mainJsBytes, file: mainJsFile },
    mainCss: { bytes: mainCssBytes, file: mainCssFile },
    totalJs: { bytes: totalJsBytes },
    totalBundle: { bytes: totalBundleBytes },
    totalPrecache: { bytes: totalPrecacheBytes },
  }
}

export function evaluateBudgets(metrics, budgets = BUNDLE_BUDGETS) {
  const results = []
  let allPassed = true

  for (const [key, budget] of Object.entries(budgets)) {
    const metric = metrics[key]
    if (!metric) {
      throw new Error(`Metric '${key}' missing in collected dist metrics.`)
    }
    const actualBytes = metric.bytes
    const passed = actualBytes <= budget.maxBytes
    if (!passed) allPassed = false

    const deltaBytes = actualBytes - budget.baselineBytes
    const deltaPercent = ((actualBytes / budget.baselineBytes - 1) * 100).toFixed(2)
    const sign = deltaBytes >= 0 ? '+' : ''

    results.push({
      key,
      name: budget.name,
      actualBytes,
      baselineBytes: budget.baselineBytes,
      maxBytes: budget.maxBytes,
      deltaBytes,
      deltaPercent: `${sign}${deltaPercent}%`,
      passed,
      file: metric.file,
    })
  }

  return { allPassed, results }
}

export function formatBudgetReport(results) {
  const header = `| Budget Target | Actual Size | Baseline | +10% Limit | Delta | Status |\n|---|---|---|---|---|---|`
  const rows = results.map((r) => {
    const status = r.passed ? '✅ PASS' : '❌ FAIL'
    return `| ${r.name} | ${formatBytes(r.actualBytes)} | ${formatBytes(r.baselineBytes)} | ${formatBytes(r.maxBytes)} | ${r.deltaPercent} | ${status} |`
  })
  return [header, ...rows].join('\n')
}

export function runBundleBudgetCheck(distDir = path.resolve('dist')) {
  console.log(`🔍 Checking bundle size budgets against +10% limit...`)
  console.log(`Directory: ${distDir}\n`)

  const metrics = collectDistMetrics(distDir)
  const { allPassed, results } = evaluateBudgets(metrics)

  console.log(formatBudgetReport(results))
  console.log('')

  if (!allPassed) {
    const failed = results.filter((r) => !r.passed)
    console.error(`❌ Bundle size budget exceeded! The following targets breached the +10% threshold:`)
    for (const f of failed) {
      console.error(`  - ${f.name}: ${formatBytes(f.actualBytes)} exceeds limit ${formatBytes(f.maxBytes)} (${f.deltaPercent})`)
    }
    return false
  }

  console.log(`✅ All bundle size targets passed within the +10% budget threshold.`)
  return true
}

// Direct execution CLI
const isDirectExecution = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isDirectExecution) {
  const distPath = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve('dist')
  const ok = runBundleBudgetCheck(distPath)
  if (!ok) process.exit(1)
}
