import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import Avatar from './Avatar.jsx'
import TermBadge from './TermBadge.jsx'
import { ageLabel } from '../lib/format.js'

/**
 * 可搜尋的成員選擇器(列出樹上所有人)
 * @param value     目前選到的 person id
 * @param onChange  (id|null) => void
 * @param exclude   不要列出的 id 陣列
 * @param allowNone 顯示「不指定」選項
 */
export default function PersonPicker({ value, onChange, exclude = [], allowNone = false, noneLabel = '不指定', placeholder = '搜尋姓名…', compact = false }) {
  const { people, termFor } = useStore()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(!compact)

  const list = useMemo(() => {
    const ex = new Set(exclude)
    const kw = q.trim().toLowerCase()
    return people
      .filter((p) => !ex.has(p.id))
      .filter((p) => !kw || p.name.toLowerCase().includes(kw) || (termFor(p.id)?.term || '').includes(kw))
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'))
  }, [people, exclude, q, termFor])

  const selected = people.find((p) => p.id === value) ?? null

  if (compact && !open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="input flex items-center gap-2 text-left">
        {selected ? (
          <>
            <Avatar person={selected} size="sm" />
            <span className="flex-1 truncate">{selected.name}</span>
            <TermBadge result={termFor(selected.id)} />
          </>
        ) : (
          <span className="flex-1 text-muted">{allowNone ? noneLabel : '請選擇…'}</span>
        )}
        <span className="text-muted">▾</span>
      </button>
    )
  }

  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line p-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} className="input py-2" autoFocus={compact} />
      </div>
      <div className="max-h-64 overflow-y-auto">
        {allowNone && (
          <Row
            active={!value}
            onClick={() => {
              onChange(null)
              if (compact) setOpen(false)
            }}
          >
            <span className="text-sm text-muted">{noneLabel}</span>
          </Row>
        )}
        {list.length === 0 && <p className="p-4 text-center text-sm text-muted">沒有符合的成員</p>}
        {list.map((p) => (
          <Row
            key={p.id}
            active={p.id === value}
            onClick={() => {
              onChange(p.id)
              if (compact) setOpen(false)
            }}
          >
            <Avatar person={p} size="sm" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-ink">{p.name}</span>
              <span className="block truncate text-xs text-muted">{ageLabel(p)}</span>
            </span>
            <TermBadge result={termFor(p.id)} />
          </Row>
        ))}
      </div>
    </div>
  )
}

function Row({ active, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className={`flex w-full items-center gap-3 px-3 py-2 text-left transition active:bg-surface-2 ${active ? 'bg-primary-soft' : ''}`}>
      {children}
      {active && <span className="text-primary">✓</span>}
    </button>
  )
}
