import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import { STATS, POWER_MAX, POWER_BASE_MAX, LONGEVITY_MAX, basePower, longevityBonus, powerIcon, overallRating, powerLabel, statDescriptor, ageLabel } from '../lib/format.js'

/** 戰力(地位 + 壽命加成)+ 遊戲角色式屬性:數值條 + 綜合評分;editor 可拉滑桿評分 */
export default function StatsPanel({ person }) {
  const { canEdit, updatePerson } = useStore()
  const toast = useToast()
  const [draft, setDraft] = useState(null) // null = 檢視;object = 編輯中的 { power, stats: { id: value } }
  const [busy, setBusy] = useState(false)

  const stats = person.stats || {}
  const power = basePower(person)
  const longevity = longevityBonus(person)
  const total = power + longevity.bonus
  const rated = STATS.filter((s) => Number.isFinite(stats[s.id]))
  const overall = overallRating(stats)
  const longevityNote = longevity.years == null
    ? person.is_deceased
      ? '填上生日與逝世日期就會算享壽加成'
      : person.birth_date
        ? ''
        : '填上生日就會自動算'
    : `${ageLabel(person)}${longevity.title ? ` · ${longevity.title}` : ''}`

  async function save() {
    const clean = {}
    for (const [k, v] of Object.entries(draft.stats)) if (Number.isFinite(v)) clean[k] = v
    setBusy(true)
    try {
      await updatePerson(person.id, { stats: clean, power: draft.power })
      toast.success('已更新')
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
        <h2 className="section-title mb-0">戰力與讚讚人指數</h2>
        {canEdit && !draft && (
          <button onClick={() => setDraft({ power, stats: { ...stats } })} className="text-sm text-primary">
            {rated.length ? '✎ 調整' : '＋ 評分'}
          </button>
        )}
      </div>

      {!draft && (
        <div className="mb-3 rounded-2xl bg-accent-soft/60 p-3">
          <div className="flex items-center gap-2">
            <span className="text-base leading-none">{powerIcon(total)}</span>
            <span className="w-12 shrink-0 text-sm font-semibold text-ink">戰力</span>
            <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-accent transition-[width]" style={{ width: `${(power / POWER_MAX) * 100}%` }} />
              <div className="h-full bg-warning transition-[width]" style={{ width: `${(longevity.bonus / POWER_MAX) * 100}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right text-sm font-bold tabular-nums text-ink">{total}</span>
            <span className="w-20 shrink-0 truncate text-[11px] text-muted">{powerLabel(total)}</span>
          </div>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted">
            <span>
              <span className="inline-block h-2 w-2 rounded-full bg-accent align-middle" /> 地位 {power}/{POWER_BASE_MAX}
            </span>
            <span>
              <span className="inline-block h-2 w-2 rounded-full bg-warning align-middle" /> 壽命加成 +{longevity.bonus}/{LONGEVITY_MAX}
              {longevityNote && <span className="ml-1">({longevityNote})</span>}
            </span>
          </div>
        </div>
      )}

      {!draft && rated.length === 0 && <p className="text-xs text-muted">{canEdit ? `還沒有人幫 ${person.name} 評分。點「評分」,像遊戲角色一樣拉出有趣、有病、脾氣、酒量…的數值條,算出這個人的讚讚人指數。` : '尚無讚讚人指數'}</p>}

      {!draft && overall && (
        <>
          <div className="mb-3 flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-primary text-primary-fg">
              <span className="text-xl font-black leading-none">{overall.score}</span>
              <span className="text-[10px] leading-none opacity-80">讚讚</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">
                讚讚人指數 {overall.score} · {overall.rank} 級 {overall.title}
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
          <div className="rounded-xl bg-accent-soft px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-ink">
              <span className="w-6 text-center">{powerIcon(draft.power + longevity.bonus)}</span>
              <span className="flex-1 font-medium">地位(家庭份量)</span>
              <span className="text-xs text-muted">
                {draft.power} + 壽命 {longevity.bonus} = 戰力 {draft.power + longevity.bonus} · {powerLabel(draft.power + longevity.bonus)}
              </span>
            </div>
            <input type="range" min="0" max={POWER_BASE_MAX} step="1" value={draft.power} onChange={(e) => setDraft({ ...draft, power: Number(e.target.value) })} className="mt-1.5 w-full accent-accent" />
            <p className="mt-1 text-[11px] text-muted">這個人在家族裡的份量。戰力 = 地位 + 壽命加成(60 歲起每 10 歲 +1,活很久很帥;已故者看享壽),數字越大樹狀圖上的卡片越大。</p>
          </div>
          <p className="text-xs text-muted">勾選要評的屬性,拉滑桿給 0–10 分。沒勾的不會顯示,也不計入讚讚人指數。標「負面」的屬性分數越高越糟,指數會反過來算。</p>
          <div className="space-y-2">
            {STATS.map((s) => {
              const on = Number.isFinite(draft.stats[s.id])
              return (
                <div key={s.id} className={`rounded-xl px-3 py-2 ${on ? 'bg-surface-2' : ''}`}>
                  <label className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={(e) => {
                        const next = { ...draft.stats }
                        if (e.target.checked) next[s.id] = 5
                        else delete next[s.id]
                        setDraft({ ...draft, stats: next })
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
                        {draft.stats[s.id]} · {statDescriptor(s, draft.stats[s.id])}
                      </span>
                    )}
                  </label>
                  {on && (
                    <input type="range" min="0" max="10" step="1" value={draft.stats[s.id]} onChange={(e) => setDraft({ ...draft, stats: { ...draft.stats, [s.id]: Number(e.target.value) } })} className="mt-1.5 w-full accent-primary" />
                  )}
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

export function StatBar({ stat, value }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-6 text-center text-base leading-none">{stat.icon}</span>
      <span className="w-12 shrink-0 text-sm text-ink" title={stat.negative ? '負面屬性:越高越糟' : undefined}>
        {stat.label}
      </span>
      <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2">
        {/* 負面屬性用警示色,一眼看出「這條越長越糟」 */}
        <div className={`h-full rounded-full transition-[width] ${stat.negative ? 'bg-danger/70' : 'bg-primary'}`} style={{ width: `${value * 10}%` }} />
      </div>
      <span className="w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-ink">{value}</span>
      <span className="w-20 shrink-0 truncate text-[11px] text-muted">{statDescriptor(stat, value)}</span>
    </div>
  )
}
