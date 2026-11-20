let wakeLock: WakeLockSentinel | null = null

export async function requestWakeLock(): Promise<boolean> {
  if (typeof navigator !== 'undefined' && 'wakeLock' in navigator && navigator.wakeLock) {
    try {
      if (!wakeLock) {
        wakeLock = await navigator.wakeLock.request('screen')
        wakeLock.addEventListener('release', () => {
          wakeLock = null
        })
        return true
      }
      return true
    } catch (err) {
      console.error(err)
      return false
    }
  }
  return false
}

export async function releaseWakeLock(): Promise<void> {
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

export function _resetWakeLockForTest(): void {
  wakeLock = null
}
