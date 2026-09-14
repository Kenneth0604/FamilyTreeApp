/**
 * iOS 主畫面 App 的視窗修正
 * 1. 高度:standalone 模式下 100% / 100vh / 100dvh 有時會少算底部安全區,底部露出一塊背景色。
 *    這裡直接量 window.innerHeight 寫進 --app-h,#root 以它為高度。
 * 2. 捲動偏移:鍵盤把視窗往上推後常常沒回位;body 是 fixed 不能捲,所以在鍵盤收起 / 尺寸變化時歸零。
 */
export function installViewportFix() {
  const root = document.documentElement

  const setHeight = () => {
    const h = window.innerHeight
    if (h > 0) root.style.setProperty('--app-h', `${h}px`)
  }
  const reset = () => {
    if (window.scrollY || window.scrollX) window.scrollTo(0, 0)
    if (root.scrollTop) root.scrollTop = 0
    if (document.body.scrollTop) document.body.scrollTop = 0
  }
  const later = () => {
    setHeight(); reset()
    setTimeout(() => { setHeight(); reset() }, 60)
    setTimeout(() => { setHeight(); reset() }, 300)
  }

  setHeight()
  window.addEventListener('resize', later)
  window.addEventListener('orientationchange', later)
  window.addEventListener('pageshow', later)
  document.addEventListener('focusout', later)
  window.visualViewport?.addEventListener('resize', later)
  window.visualViewport?.addEventListener('scroll', reset)
}
