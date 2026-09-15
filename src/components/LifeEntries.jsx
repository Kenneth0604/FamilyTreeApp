import { useMemo, useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import { parseBirth } from '../lib/kinship/birth.js'
import { ENTRY_CATEGORIES, ENTRY_CATEGORY_BY_ID, compareEntries, periodLabel, toPartialDate } from '../lib/format.js'

/** 某個人的生平紀事:依類別分區、各區 1. 2. 3. 條列,editor 可新增 / 編輯 / 刪除 */
export default function LifeEntries({ personId }) {
  const { entries, canEdit, addEntry, updateEntry, deleteEntry } = useStore()
  const toast = useToast()
  const [form, setForm] = useState(null) // null | { id?: string, ...欄位 }
  const [busy, setBusy] = useState(false)

  const groups = useMemo(() => {
    const mine = entries.filter((e) => e.person_id === personId).sort(compareEntries)
    return ENTRY_CATEGORIES.map((c) => ({ ...c, items: mine.filter((e) => e.category === c.id) })).filter((g) => g.items.length)
  }, [entries, personId])

  async function guard(fn, ok) {
    setBusy(true)
    try {
      await fn()
      if (ok) toast.success(ok)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  function startNew(category = 'career') {
    setForm({ category, title: '', detail: '', start: {}, end: {}, ongoing: false })
  }
  function startEdit(e) {
    setForm({ id: e.id, category: e.category, title: e.title, detail: e.detail || '', start: parseBirth(e.start_date) || {}, end: parseBirth(e.end_date) || {}, ongoing: Boolean(e.ongoing) })
  }

  async function save() {
    if (!form.title.trim()) return toast.error('請輸入標題')
    for (const p of [form.start, form.end]) if (p.y && (Number(p.y) < 1 || Number(p.y) > 9999)) return toast.error('年份格式不正確')
    const fields = {
      person_id: personId,
      category: form.category,
      title: form.title.trim(),
      detail: form.detail.trim(),
      start_date: toPartialDate(form.start.y, form.start.m, form.start.d),
      end_date: form.ongoing ? null : toPartialDate(form.end.y, form.end.m, form.end.d),
      ongoing: form.ongoing,
    }
    if (fields.start_date && fields.end_date && fields.end_date < fields.start_date) return toast.error('結束時間不能早於開始時間')
    await guard(async () => {
      if (form.id) await updateEntry(form.id, fields)
      else await addEntry(fields)
      setForm(null)
    }, form.id ? '已更新' : '已新增')
  }

  const empty = groups.length === 0

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-title mb-0">生平紀事</h2>
        {canEdit && !form && (
          <button onClick={() => startNew()} className="text-sm text-primary">
            ＋ 新增
          </button>
        )}
      </div>

      {empty && !form && <p className="text-xs text-muted">{canEdit ? '尚無紀錄。可以像履歷一樣,條列這個人的職業、學歷、重要事蹟、住過的地方…' : '尚無紀錄'}</p>}

      {groups.map((g) => (
        <div key={g.id} className="border-t border-line py-2.5 first:border-t-0">
          <p className="mb-1.5 text-sm font-semibold text-ink">
            <span className="mr-1">{g.icon}</span>
            {g.label}
            <span className="ml-1.5 text-xs font-normal text-muted">{g.items.length} 筆</span>
          </p>
          <ol className="space-y-2">
            {g.items.map((it, i) => {
              const period = periodLabel(it.start_date, it.end_date, it.ongoing)
              return (
                <li key={it.id} className="flex gap-2">
                  <span className="mt-px w-5 shrink-0 text-right text-xs font-semibold tabular-nums text-muted">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-sm font-medium text-ink" data-selectable>
                        {it.title}
                      </span>
                      {period && <span className="text-xs text-muted">{period}</span>}
                    </div>
                    {it.detail && (
                      <p className="mt-0.5 whitespace-pre-wrap text-xs leading-relaxed text-muted" data-selectable>
                        {it.detail}
                      </p>
                    )}
                  </div>
                  {canEdit && !form && (
                    <div className="flex shrink-0 items-start gap-0.5">
                      <button onClick={() => startEdit(it)} className="rounded-full px-1.5 py-0.5 text-xs text-muted hover:text-ink" aria-label="編輯" disabled={busy}>
                        ✎
                      </button>
                      <button
                        onClick={() => window.confirm(`確定要刪除「${it.title}」這筆紀錄?`) && guard(() => deleteEntry(it.id), '已刪除')}
                        className="rounded-full px-1.5 py-0.5 text-xs text-muted hover:text-danger"
                        aria-label="刪除"
                        disabled={busy}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      ))}

      {form && (
        <div className="mt-3 rounded-2xl bg-surface-2 p-3">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">{form.id ? '編輯紀錄' : '新增紀錄'}</p>
            <button onClick={() => setForm(null)} className="text-xs text-muted" disabled={busy}>
              取消
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="label">類別</label>
              <div className="flex flex-wrap gap-1.5">
                {ENTRY_CATEGORIES.map((c) => (
                  <button key={c.id} type="button" onClick={() => setForm({ ...form, category: c.id })} className={`chip px-2.5 py-1 text-xs ${form.category === c.id ? 'chip-active' : ''}`}>
                    {c.icon} {c.label}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">{ENTRY_CATEGORY_BY_ID[form.category]?.hint}</p>
            </div>
            <div>
              <label className="label">標題 *</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input" placeholder={TITLE_PLACEHOLDER[form.category]} autoFocus />
            </div>
            <div>
              <label className="label">開始時間(可只填年份)</label>
              <PartialDateInput value={form.start} onChange={(v) => setForm({ ...form, start: v })} />
            </div>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="label mb-0">結束時間</label>
                <label className="flex items-center gap-1.5 text-xs text-ink">
                  <input type="checkbox" checked={form.ongoing} onChange={(e) => setForm({ ...form, ongoing: e.target.checked, end: e.target.checked ? {} : form.end })} className="h-4 w-4 accent-primary" />
                  至今
                </label>
              </div>
              <PartialDateInput value={form.end} onChange={(v) => setForm({ ...form, end: v })} disabled={form.ongoing} />
            </div>
            <div>
              <label className="label">詳細說明</label>
              <textarea value={form.detail} onChange={(e) => setForm({ ...form, detail: e.target.value })} className="input min-h-20" rows={3} placeholder="地點、職務內容、相關的人、背景故事…" />
            </div>
            <button onClick={save} disabled={busy || !form.title.trim()} className="btn-primary btn-sm w-full">
              {busy ? '儲存中…' : form.id ? '儲存變更' : '新增紀錄'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}

const TITLE_PLACEHOLDER = {
  career: '例如:台電 工程師、自營雜貨店',
  education: '例如:台北工專 電機科',
  event: '例如:全家從嘉義搬到台北',
  residence: '例如:台南市 安平區',
  award: '例如:模範母親表揚',
  other: '例如:每天早上去公園打太極',
}

/** 年 / 月 / 日三格,月日可省略;value = { y, m, d } */
function PartialDateInput({ value, onChange, disabled }) {
  const y = value.y ?? ''
  const m = value.m ?? ''
  const d = value.d ?? ''
  const daysInMonth = m && y ? new Date(Number(y), Number(m), 0).getDate() : 31
  return (
    <div className="grid grid-cols-3 gap-2">
      <input
        type="number"
        inputMode="numeric"
        min="1"
        max="9999"
        value={y}
        onChange={(e) => onChange(e.target.value ? { ...value, y: e.target.value } : {})}
        placeholder="年"
        className="input"
        disabled={disabled}
      />
      <select value={m} onChange={(e) => onChange(e.target.value ? { ...value, m: e.target.value } : { y })} className="input" disabled={disabled || !y}>
        <option value="">月</option>
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1} 月
          </option>
        ))}
      </select>
      <select value={d} onChange={(e) => onChange({ ...value, d: e.target.value })} className="input" disabled={disabled || !m}>
        <option value="">日</option>
        {Array.from({ length: daysInMonth }, (_, i) => (
          <option key={i + 1} value={i + 1}>
            {i + 1} 日
          </option>
        ))}
      </select>
    </div>
  )
}
