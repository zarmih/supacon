/**
 * Safe offline/online network status tracking for local-first operation.
 */

export function isOnline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    return true
  }
  return navigator.onLine
}

export function isOffline(): boolean {
  return !isOnline()
}

/**
 * Subscribes to online and offline network status changes.
 * Returns an unsubscribe cleanup function.
 */
export function subscribeNetwork(onChange: (online: boolean) => void): () => void {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return () => {}
  }

  const handleOnline = () => onChange(true)
  const handleOffline = () => onChange(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
