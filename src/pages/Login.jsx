import { useState } from 'react'
import { useStore } from '../lib/store.jsx'

export default function Login() {
  const { login, signup } = useStore()
  const [mode, setMode] = useState('login') // login | signup
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError('')
    setNotice('')
    setBusy(true)
    try {
      if (mode === 'login') {
        await login(email, password)
      } else {
        const { needsConfirm } = await signup(email, password)
        if (needsConfirm) {
          setNotice('註冊成功!請到信箱點擊驗證連結,完成後回來登入。')
          setMode('login')
        }
      }
    } catch (err) {
      setError(err.message || '操作失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col justify-center px-6">
      <div className="mb-8 text-center">
        <div className="hero mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-3xl text-4xl shadow-lg">🌳</div>
        <h1 className="text-2xl font-bold text-ink">家族樹</h1>
        <p className="mt-1 text-sm text-muted">和家人一起建立家族樹,自動標示親屬稱謂</p>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
        {[
          ['login', '登入'],
          ['signup', '註冊新帳號'],
        ].map(([m, label]) => (
          <button key={m} type="button" onClick={() => { setMode(m); setError(''); setNotice('') }} className={`rounded-xl py-2 text-sm font-semibold transition ${mode === m ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="input py-3.5" />
        <input
          type="password"
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder={mode === 'login' ? '密碼' : '設定密碼(至少 6 個字元)'}
          className="input py-3.5"
        />
        {error && <p className="text-sm text-danger">{error}</p>}
        {notice && <p className="rounded-xl bg-success-soft px-3 py-2 text-sm text-success">{notice}</p>}
        <button type="submit" disabled={busy || !email || !password} className="btn-primary w-full py-3.5 text-lg">
          {busy ? '請稍候…' : mode === 'login' ? '登入' : '建立帳號'}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-muted">登入後可建立新的家族樹,或用家人給你的邀請碼加入既有家族。</p>
    </div>
  )
}
