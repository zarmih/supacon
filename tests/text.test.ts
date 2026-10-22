import { describe, expect, it } from 'vitest'
import { clip } from '../src/domain/text'

describe('clip', () => {
  it('trims, cuts, and trims what the cut exposes', () => {
    expect(clip('  hello  ', 10)).toBe('hello')
    expect(clip('abc def', 4)).toBe('abc')
    expect(clip('abcdef', 3)).toBe('abc')
    expect(clip('   ', 5)).toBe('')
  })

  it('is idempotent', () => {
    const samples = ['', ' a ', 'x y z', `${'a'.repeat(39)} b`, ' \t\n', 'word  word  word']
    for (const text of samples) {
      for (const max of [0, 1, 3, 5, 40]) {
        const once = clip(text, max)
        expect(clip(once, max)).toBe(once)
        expect(once.length).toBeLessThanOrEqual(max)
      }
    }
  })
})
