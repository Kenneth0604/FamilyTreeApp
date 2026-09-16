import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import Avatar from '../components/Avatar.jsx'
import { HOUSEHOLD_COLORS, householdColor, displayName } from '../lib/format.js'

/** 小家庭:圈選一群同住的人,樹狀圖上用虛線框起來 */
export default function Households() {
  const { households, people, peopleById, canEdit, addHousehold, updateHousehold, deleteHousehold } = useStore()
  const toast = useToast()
  const [form, setForm] = useState(null) // null | { id?, name, color, ids: Set }
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')

  const sortedPeople = useMemo(() => [...people].sort((a, b) => displayName(a).localeCompare(displayName(b), 'zh-Hant')), [people])
  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    return kw ? sortedPeople.filter((p) => displayName(p).toLowerCase().includes(kw) || (p.nicknames || []).some((n) => n.toLowerCase().includes(kw))) : sortedPeople
  }, [sortedPeople, q])

  const startNew = () => setForm({ name: '', color: HOUSEHOLD_COLORS[(households.length || 0) % HOUSEHOLD_COLORS.length].id, ids: new Set() })
  const startEdit = (h) => setForm({ id: h.id, name: h.name, color: h.color || 'primary', ids: new Set(h.person_ids || []) })
  const toggle = (pid) => {
    const ids = new Set(form.ids)
    if (ids.has(pid)) ids.delete(pid)
    else ids.add(pid)
    setForm({ ...form, ids })
  }

  async function save() {
    if (!form.name.trim()) return toast.error('請輸入小家庭名稱')
    if (form.ids.size === 0) return toast.error('至少選一位成員')
    const fields = { name: form.name.trim(), color: form.color, person_ids: [...form.ids] }
    setBusy(true)
    try {
      if (form.id) await updateHousehold(form.id, fields)
      else await addHousehold(fields)
      toast.success(form.id ? '已更新' : '已建立')
      setForm(null)
      setQ('')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(h) {
    if (!window.confirm(`確定要刪除「${h.name}」?只會移除虛線框,不會刪除任何成員。`)) return
    try {
      await deleteHousehold(h.id)
      toast.success('已刪除')
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">小家庭</h1>
        <Link to="/" className="text-sm text-muted">
          回樹狀圖
        </Link>
      </div>
      <p className="text-xs text-muted">把同住或同一戶的人圈成一個小家庭,樹狀圖上會用該顏色的虛線框起來。同一個人可以屬於多個小家庭。</p>

      {households.length === 0 && !form && <p className="empty">還沒有小家庭。{canEdit && '例如把「我、爸爸、阿公、阿嬤」圈成一戶。'}</p>}

      <div className="space-y-2">
        {households.map((h) => {
          const members = (h.person_ids || []).map((id) => peopleById.get(id)).filter(Boolean)
          return (
            <div key={h.id} className="card p-4" style={{ borderLeft: `4px solid ${householdColor(h.color)}` }}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold text-ink">
                  {h.name}
                  <span className="ml-1.5 text-xs font-normal text-muted">{members.length} 人</span>
                </p>
                {canEdit && !form && (
                  <div className="flex gap-2 text-xs">
                    <button onClick={() => startEdit(h)} className="text-primary">
                      編輯
                    </button>
                    <button onClick={() => remove(h)} className="text-muted hover:text-danger">
                      刪除
                    </button>
                  </div>
                )}
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {members.map((p) => (
                  <Link key={p.id} to={`/people/${p.id}`} className="flex items-center gap-1 rounded-full bg-surface-2 py-0.5 pl-0.5 pr-2 text-xs text-ink">
                    <Avatar person={p} size="sm" className="h-5 w-5 text-[10px]" />
                    {displayName(p)}
                  </Link>
                ))}
                {members.length === 0 && <span className="text-xs text-muted">成員都已被刪除</span>}
              </div>
            </div>
          )
        })}
      </div>

      {canEdit && !form && (
        <button onClick={startNew} className="btn-primary w-full" disabled={people.length === 0}>
          ＋ 新增小家庭
        </button>
      )}

      {form && (
        <section className="card space-y-3 p-4">
          <p className="text-sm font-semibold text-ink">{form.id ? '編輯小家庭' : '新增小家庭'}</p>
          <div>
            <label className="label">名稱</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="例如:阿公家、台北的家" autoFocus />
          </div>
          <div>
            <label className="label">顏色</label>
            <div className="flex flex-wrap gap-1.5">
              {HOUSEHOLD_COLORS.map((c) => (
                <button key={c.id} type="button" onClick={() => setForm({ ...form, color: c.id })} className={`chip gap-1.5 ${form.color === c.id ? 'chip-active' : ''}`}>
                  <span className="h-3 w-3 rounded-full" style={{ background: c.color }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label">
              成員 <span className="font-normal text-muted">已選 {form.ids.size} 人</span>
            </label>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜尋姓名…" className="input mb-2" />
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {filtered.map((p) => {
                const on = form.ids.has(p.id)
                return (
                  <label key={p.id} className={`flex items-center gap-2 rounded-xl px-2 py-1.5 text-sm text-ink ${on ? 'bg-surface-2' : ''}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(p.id)} className="h-4 w-4 accent-primary" />
                    <Avatar person={p} size="sm" />
                    <span className="truncate">{displayName(p)}</span>
                    {p.nicknames?.length > 0 && <span className="truncate text-xs text-muted">{p.nicknames.join('、')}</span>}
                  </label>
                )
              })}
              {filtered.length === 0 && <p className="px-2 py-1 text-xs text-muted">沒有符合的成員</p>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setForm(null)} className="btn-secondary btn-sm" disabled={busy}>
              取消
            </button>
            <button onClick={save} className="btn-primary btn-sm" disabled={busy}>
              {busy ? '儲存中…' : form.id ? '儲存變更' : '建立'}
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
