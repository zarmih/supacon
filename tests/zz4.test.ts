import { describe, it, vi } from 'vitest'
import { requestWakeLock, releaseWakeLock, isWakeLockActive, _resetWakeLockForTest } from '../src/platform/wake-lock'

function makeSentinel() {
  const t = new EventTarget() as EventTarget & { release: () => Promise<void>; released: boolean }
  t.released = false
  t.release = async () => {
    t.released = true
    t.dispatchEvent(new Event('release'))
  }
  return t
}

describe('probe race', () => {
  it('late acquire after release re-arms the lock', async () => {
    _resetWakeLockForTest()
    let resolveRequest: (v: unknown) => void = () => {}
    const late = makeSentinel()
    vi.stubGlobal('navigator', {
      wakeLock: { request: () => new Promise((res) => { resolveRequest = res }) },
    })
    const p = requestWakeLock()
    await releaseWakeLock()
    resolveRequest(late)
    await p
    console.log('ACTIVE_AFTER_RELEASE:', isWakeLockActive(), 'lateReleased:', late.released)
    await releaseWakeLock()
    vi.unstubAllGlobals()
  })

  it('re-acquires while document is still visible-but-frozen', async () => {
    _resetWakeLockForTest()
    const s1 = makeSentinel()
    const listeners = new Map<string, EventListener>()
    let vis: DocumentVisibilityState = 'visible'
    vi.stubGlobal('navigator', { wakeLock: { request: () => Promise.resolve(s1) } })
    vi.stubGlobal('document', {
      get visibilityState() {
        return vis
      },
      addEventListener: (e: string, h: EventListener) => listeners.set(e, h),
      removeEventListener: (e: string) => listeners.delete(e),
    })
    await requestWakeLock()
    console.log('AFTER_ACQUIRE active:', isWakeLockActive(), 'listeners:', [...listeners.keys()])
    vis = 'hidden'
    s1.dispatchEvent(new Event('release'))
    console.log('AFTER_OS_RELEASE_WHILE_HIDDEN active:', isWakeLockActive())
    vis = 'visible'
    listeners.get('visibilitychange')?.(new Event('visibilitychange'))
    await Promise.resolve()
    console.log('AFTER_VIS_CHANGE active:', isWakeLockActive())
    await releaseWakeLock()
    console.log('AFTER_EXPLICIT_RELEASE active:', isWakeLockActive(), 'listeners:', [...listeners.keys()])
    vi.unstubAllGlobals()
  })
})