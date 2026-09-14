import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'

/**
 * 建立新家族 / 用邀請碼加入 / 切換家族
 * - 首次登入尚未加入任何家族時進入
 * - #/join/<邀請碼> 連結會自動帶入邀請碼
 * - 已有家族時也可從設定頁進來加入另一個家族
 */
export default function FamilyGate() {
  const { authUser, memberships, familyId, switchFamily, createFamily, joinFamily, logout } = useStore()
  const { code: codeParam } = useParams()
  const navigate = useNavigate()
  const defaultName = authUser?.email?.split('@')[0] || ''

  const [tab, setTab] = useState(codeParam ? 'join' : memberships?.length ? 'switch' : 'create')
  const [displayName, setDisplayName] = useState(defaultName)
  const [familyName, setFamilyName] = useState('')
  const [code, setCode] = useState(codeParam?.toUpperCase() || '')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (codeParam) {
      setCode(codeParam.toUpperCase())
      setTab('join')
    }
  }, [codeParam])

  // 用邀請連結進來但已是該家族成員 → 直接切換
  useEffect(() => {
    if (!codeParam || !memberships) return
    const hit = memberships.find((m) => m.families?.invite_code === codeParam.toUpperCase())
    if (hit) {
      switchFamily(hit.family_id)
      navigate('/', { replace: true })
    }
  }, [codeParam, memberships, switchFamily, navigate])

  async function onCreate(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await createFamily(familyName, displayName)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  async function onJoin(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await joinFamily(code, displayName)
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const tabs = [
    memberships?.length ? ['switch', '我的家族'] : null,
    ['create', '建立新家族'],
    ['join', '輸入邀請碼'],
  ].filter(Boolean)

  return (
    <div className="pt-safe pb-safe mx-auto flex min-h-full max-w-md flex-col justify-center px-6 py-8">
      <div className="mb-6 text-center">
        <div className="hero mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl text-3xl shadow-lg">🌳</div>
        <h1 className="text-xl font-bold text-ink">{memberships?.length ? '家族群組' : '歡迎!先加入一個家族'}</h1>
        <p className="mt-1 text-sm text-muted">一個家族樹屬於一個家族群組,成員可以一起編輯。</p>
      </div>

      <div className="mb-4 grid gap-1 rounded-2xl bg-surface-2 p-1" style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}>
        {tabs.map(([t, label]) => (
          <button key={t} type="button" onClick={() => { setTab(t); setError('') }} className={`rounded-xl py-2 text-sm font-semibold transition ${tab === t ? 'bg-surface text-ink shadow-sm' : 'text-muted'}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'switch' && (
        <div className="space-y-2">
          {memberships.map((m) => (
            <button
              key={m.id}
              onClick={() => {
                switchFamily(m.family_id)
                navigate('/', { replace: true })
              }}
              className={`card flex w-full items-center justify-between p-4 text-left ${m.family_id === familyId ? 'ring-2 ring-primary' : ''}`}
            >
              <div>
                <p className="font-semibold text-ink">{m.families?.name || '家族'}</p>
                <p className="text-xs text-muted">我在這裡叫「{m.display_name}」</p>
              </div>
              {m.family_id === familyId && <span className="text-sm text-primary">目前</span>}
            </button>
          ))}
        </div>
      )}

      {tab === 'create' && (
        <form onSubmit={onCreate} className="card space-y-3 p-4">
          <div>
            <label className="label">家族名稱</label>
            <input value={familyName} onChange={(e) => setFamilyName(e.target.value)} placeholder="例如:林家、外婆家" className="input" required />
          </div>
          <div>
            <label className="label">我在這個家族的顯示名稱</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="讓其他成員知道是誰在編輯" className="input" required />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy} className="btn-primary w-full">
            {busy ? '建立中…' : '建立家族樹'}
          </button>
        </form>
      )}

      {tab === 'join' && (
        <form onSubmit={onJoin} className="card space-y-3 p-4">
          <div>
            <label className="label">邀請碼</label>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              placeholder="6 碼,例如 AB3K9Z"
              className="input text-center font-mono text-xl tracking-[0.3em] uppercase"
              maxLength={6}
              autoCapitalize="characters"
              required
            />
          </div>
          <div>
            <label className="label">我在這個家族的顯示名稱</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="input" required />
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={busy || code.length < 6} className="btn-primary w-full">
            {busy ? '加入中…' : '加入家族'}
          </button>
        </form>
      )}

      <div className="mt-6 flex justify-center gap-4 text-sm">
        {familyId && (
          <button onClick={() => navigate('/')} className="text-primary">
            返回
          </button>
        )}
        <button onClick={logout} className="text-muted">
          登出({authUser?.email})
        </button>
      </div>
    </div>
  )
}
