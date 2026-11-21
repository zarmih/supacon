export interface BudgetTarget {
  name: string
  baselineBytes: number
  maxBytes: number
}

export interface BudgetResult {
  key: string
  name: string
  actualBytes: number
  baselineBytes: number
  maxBytes: number
  deltaBytes: number
  deltaPercent: string
  passed: boolean
  file?: string
}

export interface DistMetrics {
  [key: string]: { bytes: number; file?: string }
  mainJs: { bytes: number; file?: string }
  mainCss: { bytes: number; file?: string }
  totalJs: { bytes: number }
  totalBundle: { bytes: number }
  totalPrecache: { bytes: number }
}

export type BudgetKey = 'mainJs' | 'mainCss' | 'totalJs' | 'totalBundle' | 'totalPrecache'

export const BUNDLE_BUDGETS: Record<BudgetKey, BudgetTarget>
export function formatBytes(bytes: number): string
export function collectDistMetrics(distDir: string): DistMetrics
export function evaluateBudgets(
  metrics: Record<string, { bytes: number; file?: string }>,
  budgets?: Record<string, BudgetTarget>,
): { allPassed: boolean; results: BudgetResult[] }
export function formatBudgetReport(results: BudgetResult[]): string
export function runBundleBudgetCheck(distDir?: string): boolean
