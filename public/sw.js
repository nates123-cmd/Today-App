const CACHE = 'today-v7'

// index.html, resolved against the SW scope (/Today-App/ on Pages, / in dev).
const shellUrl = () => new URL('index.html', self.registration.scope).toString()

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
      await self.clients.claim()
    })()
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // Supabase and every other cross-origin call goes straight to the network.
  if (url.origin !== self.location.origin) return

  // Navigations: always network-first, and bypass the HTTP cache.
  // GitHub Pages serves index.html with max-age=600, so a stale copy can point
  // at hashed asset filenames the latest deploy already deleted — the app then
  // loads as a blank white page for up to ten minutes after every push. The
  // cached copy is only a fallback for being offline.
  if (req.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const shell = shellUrl()
        try {
          const fresh = await fetch(shell, { cache: 'reload' })
          if (!fresh.ok) throw new Error(`shell ${fresh.status}`)
          const cache = await caches.open(CACHE)
          await cache.put(shell, fresh.clone())
          return fresh
        } catch (err) {
          const cached = await caches.match(shell)
          if (cached) return cached
          throw err
        }
      })()
    )
    return
  }

  // Build output is content-hashed, so a cache hit can never be stale.
  if (url.pathname.includes('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(req)
        if (cached) return cached
        const res = await fetch(req)
        if (res.ok) {
          const cache = await caches.open(CACHE)
          await cache.put(req, res.clone())
        }
        return res
      })()
    )
  }
})
