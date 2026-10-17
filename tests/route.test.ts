import { describe, expect, it } from 'vitest'
import { parseHash } from '../src/ui/route'

describe('parseHash', () => {
  it('opens the pause for a trigger named in the path or the query', () => {
    expect(parseHash('#/pause/instagram')).toEqual({ name: 'pause', intent: 'browse', triggerId: 'instagram' })
    expect(parseHash('#/pause?trigger=instagram')).toEqual({ name: 'pause', intent: 'browse', triggerId: 'instagram' })
    expect(parseHash('#/post?trigger=news')).toEqual({ name: 'pause', intent: 'post', triggerId: 'news' })
  })

  it('returns today when a path segment cannot be decoded', () => {
    expect(parseHash('#/%')).toEqual({ name: 'today' })
    expect(parseHash('#/pause/%')).toEqual({ name: 'today' })
    expect(parseHash('#/pause/a%2Fb')).toEqual({ name: 'pause', intent: 'browse', triggerId: 'a/b' })
  })

  it('does not invent a trigger when the address names none', () => {
    expect(parseHash('#/pause')).toEqual({ name: 'pause', intent: 'browse', triggerId: undefined })
    expect(parseHash('#/pause?trigger=')).toEqual({ name: 'pause', intent: 'browse', triggerId: undefined })
    const both = parseHash('#/pause/instagram?trigger=news')
    expect(both.name === 'pause' && both.triggerId).toBe('instagram')
  })
})
