let wakeLock: any = null

export async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      if (!wakeLock) {
        wakeLock = await (navigator.wakeLock as any).request('screen')
        wakeLock.addEventListener('release', () => {
          wakeLock = null
        })
      }
    } catch (err) {
      console.error(err)
    }
  }
}

export function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => {
      wakeLock = null
    })
  }
}
