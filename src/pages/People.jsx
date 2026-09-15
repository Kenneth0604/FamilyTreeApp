import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import PersonCard from '../components/PersonCard.jsx'
import { generationLabel } from '../lib/format.js'
import { compareAge } from '../lib/kinship/birth.js'

export default function People() {
  const { people, termFor, viewpointId, selfId, canEdit } = useStore()
  const [q, setQ] = useState('')

  const groups = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const filtered = people.filter(
      (p) =>
        !kw ||
        p.name.toLowerCase().includes(kw) ||
        (p.nicknames || []).some((n) => n.toLowerCase().includes(kw)) ||
        (p.tags || []).some((t) => t.toLowerCase().includes(kw)) ||
        (termFor(p.id)?.term || '').includes(kw) ||
        (p.note || '').toLowerCase().includes(kw),
    )
    const map = new Map()
    for (const p of filtered) {
      const t = termFor(p.id)
      const g = t ? t.generation : null
      const key = g == null ? 'none' : g
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(p)
    }
    const keys = [...map.keys()].sort((a, b) => {
      if (a === 'none') return 1
      if (b === 'none') return -1
      return a - b
    })
    return keys.map((k) => ({
      key: k,
      label: generationLabel(k === 'none' ? null : k),
      people: map.get(k).sort((a, b) => {
        if (a.id === viewpointId) return -1
        if (b.id === viewpointId) return 1
        return -compareAge(a, b) || a.name.localeCompare(b.name, 'zh-Hant')
      }),
    }))
  }, [people, q, termFor, viewpointId])

  const needsBirthday = people.some((p) => termFor(p.id)?.needsBirthday)

  if (people.length === 0) {
    return (
      <div className="space-y-4">
        <div className="empty">
          <p className="text-3xl">🌱</p>
          <p className="mt-2 font-semibold text-ink">家族樹還是空的</p>
          {canEdit ? (
            <>
              <p className="mt-1">先新增第一位成員(通常是你自己),再從這個人一層層往外加父母、兄弟姊妹、配偶與子女。</p>
              <Link to="/people/new" className="btn-primary mt-4">
                新增第一位成員
              </Link>
            </>
          ) : (
            <p className="mt-1">這個家族還沒有任何成員。</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名、小名、標籤或稱謂…" className="input" />

      {!viewpointId && (
        <Link to="/settings" className="block rounded-2xl bg-info-soft px-4 py-3 text-sm text-info">
          尚未設定「我是誰」,所以還無法顯示稱謂。到設定頁選一位成員作為視角 ›
        </Link>
      )}
      {viewpointId && needsBirthday && <p className="rounded-2xl bg-warning-soft px-4 py-2 text-xs text-warning">有些成員缺少生日,無法判斷長幼(標示「?」)。填寫生日可讓稱謂更精確。</p>}

      {groups.length === 0 && <p className="empty">沒有符合「{q}」的成員</p>}

      {groups.map((g) => (
        <section key={g.key}>
          <h2 className="section-title">
            {g.label}
            <span className="text-xs font-normal text-muted">{g.people.length} 人</span>
          </h2>
          <div className="space-y-2">
            {g.people.map((p) => (
              <PersonCard key={p.id} person={p} term={termFor(p.id)} isViewpoint={p.id === viewpointId} isSelf={p.id === selfId} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
