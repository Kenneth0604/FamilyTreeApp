import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { onAppUpdate } from '../lib/sw-register.js'

export default function Layout() {
  const { family, member, canEdit, offline, syncing, pending, sync, refresh, viewpointId, nameOf, people, isMerged, sameCandidates = [] } = useStore()
  const [updateReady, setUpdateReady] = useState(false)
  const location = useLocation()
  useEffect(() => onAppUpdate(() => setUpdateReady(true)), [])

  const isTree = location.pathname === '/'

  const nav = [
    { to: '/', label: '樹狀圖', icon: TreeIcon, end: true },
    { to: '/people', label: '成員', icon: PeopleIcon },
    canEdit ? { to: '/people/new', label: '新增', icon: PlusIcon } : null,
    { to: '/settings', label: '設定', icon: GearIcon },
  ].filter(Boolean)

  return (
    <div className="mx-auto flex h-full max-w-md flex-col bg-bg landscape:max-w-3xl">
      <header className="pt-safe hero sticky top-0 z-10 text-white shadow">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <h1 className="flex items-center gap-1.5 truncate text-lg font-bold tracking-wide">
              <span className="truncate">{family?.name || '家族樹'}</span>
              {!canEdit && <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[11px] font-medium">{family?.kind === 'merged' ? '合併樹 · 只能查看' : '只能查看'}</span>}
            </h1>
            <p className="truncate text-[11px] text-white/80">
              {viewpointId ? `視角:${nameOf(viewpointId)}` : people.length ? '尚未設定視角(到設定選「我是誰」)' : '從新增第一位成員開始'}
            </p>
          </div>
          <NavLink to="/settings" className="shrink-0 rounded-full bg-white/20 px-2.5 py-0.5 text-sm font-medium">
            {member?.display_name || '我'}
          </NavLink>
        </div>
      </header>

      {/* 還有變更沒送出時不提示重新載入,避免重載時遺失 */}
      {updateReady && pending === 0 && (
        <button onClick={() => window.location.reload()} className="flex items-center justify-center gap-2 bg-success-soft px-4 py-1.5 text-xs font-medium text-success">
          ✨ 有新版本 · 點這裡重新載入
        </button>
      )}
      {isMerged && sameCandidates.length > 0 && location.pathname !== '/merged-matches' && (
        <NavLink to="/merged-matches" className="flex items-center justify-center gap-2 bg-accent-soft px-4 py-1.5 text-xs font-medium text-accent">
          👥 「{family?.name}」合併樹有一樣的人!{sameCandidates.length} 組同名 · 點此確認是否為同一人
        </NavLink>
      )}
      {offline ? (
        <button onClick={() => (pending > 0 ? sync() : refresh()).catch(() => {})} className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-xs font-medium text-warning">
          📴 目前離線{pending > 0 ? `,${pending} 筆變更會在連線後自動同步` : ',顯示的是上次快取的資料'}{syncing ? ' · 重試中…' : ' · 點此重試'}
        </button>
      ) : pending > 0 ? (
        <button onClick={() => sync().catch(() => {})} className="flex items-center justify-center gap-2 bg-warning-soft px-4 py-1.5 text-xs font-medium text-warning">
          ☁ {pending} 筆變更尚未同步{syncing ? ' · 同步中…' : ' · 點此重試'}
        </button>
      ) : null}

      <main className={isTree ? 'relative flex-1 overflow-hidden' : 'flex-1 overflow-x-hidden overflow-y-auto px-4 pb-6 pt-4'}>
        <Outlet />
      </main>

      <nav className="pb-safe z-10 shrink-0 border-t border-line bg-surface">
        <div className="mx-auto grid max-w-md landscape:max-w-3xl" style={{ gridTemplateColumns: `repeat(${nav.length}, minmax(0, 1fr))` }}>
          {nav.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `relative flex flex-col items-center gap-0.5 py-2 text-[11px] ${isActive ? 'text-primary' : 'text-muted'}`}
            >
              <Icon className="h-6 w-6" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}

const svgProps = { fill: 'none', viewBox: '0 0 24 24', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }

function TreeIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="6" cy="19" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="M12 7.5V12M12 12H6v4.5M12 12h6v4.5" />
    </svg>
  )
}
function PeopleIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M16 14.2c3 .2 5.5 2.3 5.5 5.3" />
    </svg>
  )
}
function PlusIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  )
}
function GearIcon({ className }) {
  return (
    <svg className={className} {...svgProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 01-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 01-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 012.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 012.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  )
}
