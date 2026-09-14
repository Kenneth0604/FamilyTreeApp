/* FamilyTreeApp Service Worker
 * - 快取 App Shell 與建置資源,離線時仍可開啟(資料由 store 另存 localStorage 快取)
 * BUILD_ID 會在建置時由 vite.config.js 注入,每次部署換新快取
 */
const BUILD_ID = '__BUILD_ID__'
const BASE = '/FamilyTreeApp/'
const CACHE = `familytree-${BUILD_ID}`
const SHELL = [BASE, `${BASE}index.html`, `${BASE}manifest.json`, `${BASE}icons/icon-192.png`, `${BASE}icons/icon-512.png`]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(SHELL).catch(() => {}))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('familytree-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // Supabase 等外部請求不快取

  // 只把成功的回應放進快取:部署中途的 404 / 5xx 頁若被存起來,離線殼就壞了
  const cachePut = (key, res) => {
    if (res && res.ok) {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put(key, copy)).catch(() => {})
    }
    return res
  }

  // 導覽請求:先網路,失敗回快取殼
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => cachePut(`${BASE}index.html`, res))
        .catch(() => caches.match(`${BASE}index.html`).then((r) => r || caches.match(BASE))),
    )
    return
  }

  // 帶 hash 的建置資源(檔名含內容雜湊,不會變):快取優先
  if (url.pathname.startsWith(`${BASE}assets/`)) {
    event.respondWith(caches.match(request).then((hit) => hit || fetch(request).then((res) => cachePut(request, res))))
    return
  }

  // 其他同源檔案(manifest、icon):網路優先,失敗才回快取
  event.respondWith(
    fetch(request)
      .then((res) => cachePut(request, res))
      .catch(() => caches.match(request).then((hit) => hit || Response.error())),
  )
})
