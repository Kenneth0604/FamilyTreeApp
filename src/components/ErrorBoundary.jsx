import { Component } from 'react'

/**
 * 最外層的錯誤邊界:任何畫面出現未捕捉的錯誤時,不要整個 App 變成白畫面
 * (主畫面 App 沒有網址列,白畫面只能砍掉重開),而是顯示錯誤並提供重新載入。
 */
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('未捕捉的錯誤', error, info?.componentStack)
  }

  reload = () => window.location.reload()

  home = () => {
    window.location.hash = '#/'
    window.location.reload()
  }

  render() {
    if (!this.state.error) return this.props.children
    const message = this.state.error?.message || String(this.state.error)
    return (
      <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col items-center justify-center px-6 text-center">
        <div className="text-4xl">😵</div>
        <h1 className="mt-3 text-lg font-bold text-ink">畫面出了點問題</h1>
        <p className="mt-2 max-w-full break-words rounded-2xl bg-danger-soft px-4 py-3 text-left text-xs text-danger" data-selectable>
          {message}
        </p>
        <div className="mt-4 flex gap-2">
          <button onClick={this.reload} className="btn-primary">
            重新載入
          </button>
          <button onClick={this.home} className="btn-secondary">
            回首頁
          </button>
        </div>
        <p className="mt-3 text-xs text-muted">資料都在伺服器上,重新載入不會遺失。</p>
      </div>
    )
  }
}
