/**
 * Service Worker for offline support and caching
 * Place in public/sw.js
 */

const CACHE_NAME = 'tesla-app-v1'
const URLS_TO_CACHE = [
  '/',
  '/api/vehicle/status',
  '/api/trips',
  '/static/icons/icon-192.png',
]

// Install event - cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(URLS_TO_CACHE)
    })
  )
})

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
  // Skip POST/PUT/DELETE requests
  if (event.request.method !== 'GET') {
    return
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      // Return cached response if available
      if (response) {
        return response
      }

      // Otherwise fetch from network
      return fetch(event.request)
        .then((response) => {
          // Cache successful responses
          if (!response || response.status !== 200 || response.type === 'error') {
            return response
          }

          const responseToCache = response.clone()
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache)
          })

          return response
        })
        .catch(() => {
          // Return offline page if network fails
          return new Response(
            JSON.stringify({
              error: 'Offline - cached data may be outdated',
              status: 'offline',
            }),
            {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({
                'Content-Type': 'application/json',
              }),
            }
          )
        })
    })
  )
})

// Activate event - cleanup old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
})

