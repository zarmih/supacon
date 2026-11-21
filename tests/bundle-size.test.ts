import { describe, expect, it } from 'vitest'
import {
  BUNDLE_BUDGETS,
  collectDistMetrics,
  evaluateBudgets,
  formatBytes,
  type BudgetResult,
} from '../scripts/check-bundle-size.mjs'

describe('bundle size budget enforcement (+10% limit)', () => {
  it('passes budget checks on current production build if dist exists', async () => {
    const fs: any = await import('' + 'node:fs')
    const path: any = await import('' + 'node:path')
    const distDir = path.resolve('dist')
    if (!fs.existsSync(distDir)) {
      // If dist has not been generated yet, skip gracefully
      return
    }

    const metrics = collectDistMetrics(distDir)
    const { allPassed, results } = evaluateBudgets(metrics, BUNDLE_BUDGETS)

    for (const result of results) {
      expect(
        result.passed,
        `Budget exceeded for ${result.name}: actual ${result.actualBytes} B > max ${result.maxBytes} B (${result.deltaPercent})`,
      ).toBe(true)
    }

    expect(allPassed).toBe(true)
  })

  it('correctly passes when metrics are exactly at or below the +10% boundary', () => {
    const mockMetrics = {
      mainJs: { bytes: BUNDLE_BUDGETS.mainJs.maxBytes },
      mainCss: { bytes: BUNDLE_BUDGETS.mainCss.baselineBytes },
      totalJs: { bytes: BUNDLE_BUDGETS.totalJs.maxBytes },
      totalBundle: { bytes: BUNDLE_BUDGETS.totalBundle.maxBytes },
      totalPrecache: { bytes: BUNDLE_BUDGETS.totalPrecache.maxBytes },
    }

    const { allPassed, results } = evaluateBudgets(mockMetrics, BUNDLE_BUDGETS)
    expect(allPassed).toBe(true)
    expect(results.every((r: BudgetResult) => r.passed)).toBe(true)
  })

  it('fails immediately when any metric exceeds the +10% limit by even 1 byte', () => {
    const mockMetrics = {
      mainJs: { bytes: BUNDLE_BUDGETS.mainJs.maxBytes + 1 }, // 1 byte over +10%
      mainCss: { bytes: BUNDLE_BUDGETS.mainCss.baselineBytes },
      totalJs: { bytes: BUNDLE_BUDGETS.totalJs.baselineBytes },
      totalBundle: { bytes: BUNDLE_BUDGETS.totalBundle.baselineBytes },
      totalPrecache: { bytes: BUNDLE_BUDGETS.totalPrecache.baselineBytes },
    }

    const { allPassed, results } = evaluateBudgets(mockMetrics, BUNDLE_BUDGETS)
    expect(allPassed).toBe(false)

    const mainJsResult = results.find((r: BudgetResult) => r.key === 'mainJs')
    expect(mainJsResult?.passed).toBe(false)
    expect(mainJsResult?.actualBytes).toBe(BUNDLE_BUDGETS.mainJs.maxBytes + 1)

    const mainCssResult = results.find((r: BudgetResult) => r.key === 'mainCss')
    expect(mainCssResult?.passed).toBe(true)
  })

  it('identifies all failed targets when multiple budgets are breached', () => {
    const mockMetrics = {
      mainJs: { bytes: BUNDLE_BUDGETS.mainJs.maxBytes + 5000 },
      mainCss: { bytes: BUNDLE_BUDGETS.mainCss.maxBytes + 3000 },
      totalJs: { bytes: BUNDLE_BUDGETS.totalJs.maxBytes + 8000 },
      totalBundle: { bytes: BUNDLE_BUDGETS.totalBundle.baselineBytes },
      totalPrecache: { bytes: BUNDLE_BUDGETS.totalPrecache.baselineBytes },
    }

    const { allPassed, results } = evaluateBudgets(mockMetrics, BUNDLE_BUDGETS)
    expect(allPassed).toBe(false)

    const failed = results.filter((r: BudgetResult) => !r.passed)
    expect(failed.map((f: BudgetResult) => f.key)).toEqual(['mainJs', 'mainCss', 'totalJs'])
  })

  it('throws an error if a required metric is missing', () => {
    const incompleteMetrics = {
      mainJs: { bytes: 1000 },
    }

    expect(() => evaluateBudgets(incompleteMetrics as any, BUNDLE_BUDGETS)).toThrow(
      /Metric 'mainCss' missing/,
    )
  })

  it('formats byte numbers cleanly with human-readable units', () => {
    expect(formatBytes(500)).toBe('500 B')
    expect(formatBytes(1024)).toBe('1.00 kB (1024 B)')
    expect(formatBytes(1024 * 1024 * 2)).toBe('2.00 MB (2097152 B)')
  })
})
