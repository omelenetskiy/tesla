export function registerServiceWorker() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return

  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('Service Worker registered:', registration.scope)
      })
      .catch((error) => {
        console.warn('Service Worker registration failed:', error)
      })
  })
}

export function getOnlineStatus(): boolean {
  if (typeof navigator === 'undefined') return true
  return navigator.onLine
}

export function subscribeOnlineStatus(callback: (isOnline: boolean) => void) {
  if (typeof window === 'undefined') return () => undefined

  const handleOnline = () => callback(true)
  const handleOffline = () => callback(false)

  window.addEventListener('online', handleOnline)
  window.addEventListener('offline', handleOffline)

  return () => {
    window.removeEventListener('online', handleOnline)
    window.removeEventListener('offline', handleOffline)
  }
}
