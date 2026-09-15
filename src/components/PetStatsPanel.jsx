import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import { PET_STATS, PET_RANKS, overallRating, statDescriptor } from '../lib/format.js'
import { StatBar } from './StatsPanel.jsx'

/** 寵物評分:數值條 + 綜合評分(鎮宅神獸 → 還在調教);editor 可拉滑桿 */
export default function PetStatsPanel({ pet }) {
  const { canEdit, updatePet } = useStore()
  const toast = useToast()
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)

  const stats = pet.stats || {}
  const rated = PET_STATS.filter((s) => Number.isFinite(stats[s.id]))
  const overall = overallRating(stats, PET_STATS, PET_RANKS)

  async function save() {
    const clean = {}
    for (const [k, v] of Object.entries(draft)) if (Number.isFinite(v)) clean[k] = v
    setBusy(true)
    try {
      await updatePet(pet.id, { stats: clean })
      toast.success('已更新評分')
      setDraft(null)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card p-4">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="section-title mb-0">讚讚寵物指數</h2>
        {canEdit && !draft && (
          <button onClick={() => setDraft({ ...stats })} className="text-sm text-primary">
            {rated.length ? '✎ 調整' : '＋ 評分'}
          </button>
        )}
      </div>

      {!draft && rated.length === 0 && <p className="text-xs text-muted">{canEdit ? `還沒有人幫 ${pet.name} 評分。點「評分」拉出可愛、黏人、搗蛋、貪吃…的數值條。` : '尚無評分'}</p>}

      {!draft && overall && (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-accent text-white">
              <span className="text-xl font-black leading-none">{overall.score}</span>
              <span className="text-[10px] leading-none opacity-80">讚讚</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                讚讚寵物指數 {overall.score} · {overall.rank} 級 {overall.title}
              </p>
              <p className="mt-0.5 text-xs text-muted">
                最強 {overall.best.icon} {overall.best.label}
                {overall.worst && ` · 最弱 ${overall.worst.icon} ${overall.worst.label}`}
                {` · 共 ${overall.count} 項`}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {rated.map((s) => (
              <StatBar key={s.id} stat={s} value={stats[s.id]} />
            ))}
          </div>
        </>
      )}

      {draft && (
        <div className="space-y-3">
          <p className="text-xs text-muted">勾選要評的項目,拉滑桿給 0–10 分。標「負面」的越高越糟,指數會反過來算。</p>
          <div className="space-y-2">
            {PET_STATS.map((s) => {
              const on = Number.isFinite(draft[s.id])
              return (
                <div key={s.id} className={`rounded-xl px-3 py-2 ${on ? 'bg-surface-2' : ''}`}>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = { ...draft }
                        if (e.target.checked) next[s.id] = 5
                        else delete next[s.id]
                        setDraft(next)
                      }}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="w-6 text-center">{s.icon}</span>
                    <span className="flex-1 font-medium">
                      {s.label}
                      {s.negative && <span className="ml-1.5 rounded-full bg-danger-soft px-1.5 py-px text-[10px] font-normal text-danger">負面</span>}
                    </span>
                    {on && (
                      <span className="text-xs text-muted">
                        {draft[s.id]} · {statDescriptor(s, draft[s.id])}
                      </span>
                    )}
                  </label>
                  {on && <input type="range" min="0" max="10" step="1" value={draft[s.id]} onChange={(e) => setDraft({ ...draft, [s.id]: Number(e.target.value) })} className="mt-1.5 w-full accent-primary" />}
                </div>
              )
            })}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => setDraft(null)} className="btn-secondary btn-sm" disabled={busy}>
              取消
            </button>
            <button onClick={save} className="btn-primary btn-sm" disabled={busy}>
              {busy ? '儲存中…' : '儲存'}
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
