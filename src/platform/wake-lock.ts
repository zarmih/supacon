let wakeLock: WakeLockSentinel | null = null
let wakeLockRequested = false
let generation = 0
let visibilityListenerAttached = false

async function acquireLock(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && navigator.wakeLock) {
    try {
      const requestedGeneration = generation
      const sentinel = await navigator.wakeLock.request('screen')
      if (requestedGeneration !== generation || wakeLock) {
        await sentinel.release()
        return requestedGeneration === generation && wakeLock !== null
      }
      wakeLock = sentinel
      sentinel.addEventListener('release', () => {
        if (wakeLock === sentinel) {
          wakeLock = null
        }
      })
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }
  return false
}

async function handleVisibilityChange(): Promise<void> {
  if (
    wakeLockRequested &&
    typeof document !== 'undefined' &&
    document.visibilityState === 'visible' &&
    !wakeLock
  ) {
    await acquireLock()
  }
}

export async function requestWakeLock(): Promise<boolean> {
  wakeLockRequested = true

  if (typeof document !== 'undefined' && !visibilityListenerAttached) {
    document.addEventListener('visibilitychange', handleVisibilityChange)
    visibilityListenerAttached = true
  }

  if (wakeLock) {
    return true
  }

  return acquireLock()
}

export async function releaseWakeLock(): Promise<void> {
  generation++
  wakeLockRequested = false

  if (typeof document !== 'undefined' && visibilityListenerAttached) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    visibilityListenerAttached = false
  }

  if (wakeLock) {
    const sentinel = wakeLock
    wakeLock = null
    try {
      await sentinel.release()
    } catch (err) {
      console.error(err)
    }
  }
}

export function isWakeLockActive(): boolean {
  return wakeLock !== null
}

export function isWakeLockRequested(): boolean {
  return wakeLockRequested
}

export function _resetWakeLockForTest(): void {
  if (typeof document !== 'undefined' && visibilityListenerAttached) {
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    visibilityListenerAttached = false
  }
  wakeLock = null
  generation++
  wakeLockRequested = false
}
