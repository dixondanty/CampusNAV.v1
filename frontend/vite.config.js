import react from '@vitejs/plugin-react'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { defineConfig } from 'vite'

const packageJson = JSON.parse(await readFile(new URL('./package.json', import.meta.url), 'utf8'))

function offlineServiceWorker() {
  return {
    name: 'campusnav-offline-service-worker',
    apply: 'build',
    generateBundle(_, bundle) {
      const assets = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/icons/campusnav-192.png',
        '/icons/campusnav-512.png',
        ...Object.keys(bundle)
          .filter((file) => !bundle[file].isDynamicEntry)
          .map((file) => `/${file}`),
      ]
      const cacheVersion = createHash('sha256')
        .update(assets.sort().join('\n'))
        .digest('hex')
        .slice(0, 16)
      const source = `
const CACHE_NAME = 'campusnav-shell-${cacheVersion}'
const APP_SHELL = ${JSON.stringify(assets)}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith('campusnav-shell-') && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'ACTIVATE_CAMPUSNAV_UPDATE') self.skipWaiting()
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME)
    if (request.mode === 'navigate') {
      try {
        return await fetch(request)
      } catch {
        return await cache.match('/index.html')
      }
    }
    const cached = await cache.match(request, { ignoreSearch: true, ignoreVary: true })
    if (cached) return cached
    return fetch(request)
  })())
})
`
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineServiceWorker()],
  define: {
    __CAMPUSNAV_APP_VERSION__: JSON.stringify(packageJson.version),
  },
})
