import { describe, expect, it, vi } from 'vitest'
import { remaining } from '../src/ui/screens/unfinished'

describe('unfinished screen helpers', () => {
  it('formats remaining time correctly', () => {
    // Mock Date.now() to ensure deterministic tests
    const now = new Date(2026, 9, 10, 12, 0, 0).getTime()
    vi.setSystemTime(now)
    
    // 24 hours - 1 hour = 23 hours remaining
    const startedAt = now - (1 * 60 * 60 * 1000)
    expect(remaining(startedAt)).toBe('23h 0m')
    
    // 24 hours - 1 hour - 30 minutes = 22 hours 30 minutes remaining
    const startedAt2 = now - (1 * 60 * 60 * 1000 + 30 * 60 * 1000)
    expect(remaining(startedAt2)).toBe('22h 30m')
    
    vi.useRealTimers()
  })
})
