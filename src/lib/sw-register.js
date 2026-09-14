const SW_URL = `${import.meta.env.BASE_URL}sw.js`

const updateListeners = new Set()
let updateReady = false

/** 新版本的 Service Worker 接手頁面時通知(讓 Layout 顯示「重新載入」提示);回傳取消訂閱函式 */
export function onAppUpdate(cb) {
  updateListeners.add(cb)
  if (updateReady) cb()
  return () => updateListeners.delete(cb)
}

export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return // 開發模式不註冊,避免快取到舊模組
  // 頁面載入時已有舊版 SW 在控制,之後 controller 換人就代表新版部署好了(第一次安裝不會觸發提示)
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      updateReady = true
      updateListeners.forEach((cb) => cb())
    })
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(SW_URL, { scope: import.meta.env.BASE_URL })
      .then((reg) => {
        reg.update().catch(() => {})
        // iOS 主畫面 App 幾乎不會重新載入頁面,回到前景時主動檢查有沒有新版本
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') reg.update().catch(() => {})
        })
      })
      .catch((err) => console.warn('Service Worker 註冊失敗', err))
  })
}
