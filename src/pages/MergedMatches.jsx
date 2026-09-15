import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import Avatar from '../components/Avatar.jsx'
import PersonPicker from '../components/PersonPicker.jsx'
import { birthLabel, GENDER_LABEL } from '../lib/format.js'

/**
 * 合併樹:確認「兩邊是不是同一個人」
 * - 自動找出姓名 / 小名相符的配對,逐組確認「是同一人」或「不是」
 * - 已確認的可取消;也可以手動從兩邊各選一人標記
 * 標記為同一人後,合併樹會把兩人併成一個節點,雙方的親戚就串在同一張圖上。
 */
export default function MergedMatches() {
  const { isMerged, family, people, peopleById, graph, nameOf, mergeLinks, sameCandidates, canManageMerge, linkSamePerson, unlinkSamePerson } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [manualA, setManualA] = useState(null)
  const [manualB, setManualB] = useState(null)

  const sources = family?.sources ?? []
  const sourceName = (fid) => sources.find((s) => s.id === fid)?.name ?? '另一個家族'
  const sameLinks = useMemo(() => mergeLinks.filter((l) => l.relation === 'same_person'), [mergeLinks])
  const notSameLinks = useMemo(() => mergeLinks.filter((l) => l.relation === 'not_same_person'), [mergeLinks])
  const sideA = useMemo(() => people.filter((p) => p.family_id === sources[0]?.id).map((p) => p.id), [people, sources])
  const sideB = useMemo(() => people.filter((p) => p.family_id === sources[1]?.id).map((p) => p.id), [people, sources])

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

  if (!isMerged) {
    return (
      <div className="space-y-3">
        <p className="empty">這個功能只在合併家族樹裡使用</p>
        <Link to="/" className="btn-secondary w-full">
          回樹狀圖
        </Link>
      </div>
    )
  }

  const parentsOf = (pid) => (graph.parentsOf.get(pid) || []).map(nameOf).join('、')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">同一個人?</h1>
        <Link to="/" className="text-sm text-muted">
          回樹狀圖
        </Link>
      </div>
      <p className="text-xs text-muted">
        「{sources.map((s) => s.name).join('」與「')}」兩邊如果有同一個人(例如都建了阿公),確認後合併樹會把他們併成一個節點,兩家的親戚就會接在一起。只影響這棵合併樹,原本兩個家族的資料不會改變。
        {!canManageMerge && ' 你目前只能查看,確認需要任一來源家族的可編輯成員。'}
      </p>

      <section>
        <h2 className="section-title">
          可能是同一人
          <span className="text-xs font-normal text-muted">{sameCandidates.length} 組</span>
        </h2>
        {sameCandidates.length === 0 ? (
          <p className="empty">目前沒有同名或小名相符的人。資料更新時會自動重新比對。</p>
        ) : (
          <div className="space-y-2">
            {sameCandidates.map(({ a, b, reason, hints, conflict }) => (
              <div key={`${a.id}|${b.id}`} className="card p-3">
                <div className="grid grid-cols-2 gap-2">
                  {[a, b].map((p) => (
                    <Link key={p.id} to={`/people/${p.id}`} className="flex items-start gap-2 rounded-xl bg-surface-2 p-2">
                      <Avatar person={p} size="md" />
                      <div className="min-w-0 text-xs">
                        <p className="text-[10px] text-muted">{sourceName(p.family_id)}</p>
                        <p className="truncate text-sm font-semibold text-ink">{p.name}</p>
                        <p className="text-muted">
                          {GENDER_LABEL[p.gender] || '未指定'}
                          {birthLabel(p) ? ` · ${birthLabel(p)}` : ''}
                        </p>
                        {parentsOf(p.id) && <p className="truncate text-muted">父母:{parentsOf(p.id)}</p>}
                        {p.nicknames?.length > 0 && <p className="truncate text-muted">小名:{p.nicknames.join('、')}</p>}
                      </div>
                    </Link>
                  ))}
                </div>
                <p className={`mt-2 text-xs ${conflict ? 'text-warning' : 'text-muted'}`}>
                  {reason}
                  {hints.length > 0 && ` · ${hints.join('、')}`}
                </p>
                {canManageMerge && (
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button onClick={() => guard(() => linkSamePerson(a.id, b.id, false), '已標記為不同人')} className="btn-secondary btn-sm" disabled={busy}>
                      不是同一人
                    </button>
                    <button
                      onClick={() => window.confirm(`確定「${a.name}」與「${b.name}」是同一個人?合併樹會把兩人併成一個節點。`) && guard(() => linkSamePerson(a.id, b.id, true), '已合併為同一人')}
                      className="btn-primary btn-sm"
                      disabled={busy}
                    >
                      是同一人,合併
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {sameLinks.length > 0 && (
        <section>
          <h2 className="section-title">已合併為同一人</h2>
          <div className="card divide-y divide-line">
            {sameLinks.map((l) => {
              const a = peopleById.get(l.person_a_id)
              return (
                <div key={l.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                  <Avatar person={a} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-ink">
                    {a?.name ?? '(已刪除)'}
                    <span className="text-xs text-muted"> = {sourceName(sources[1]?.id)}的「{a?.aliases?.find((x) => x.id === l.person_b_id)?.name ?? '(已刪除)'}」</span>
                  </span>
                  {canManageMerge && (
                    <button onClick={() => guard(() => unlinkSamePerson(l.id), '已取消')} className="text-xs text-muted hover:text-danger" disabled={busy}>
                      取消
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </section>
      )}

      {notSameLinks.length > 0 && (
        <section>
          <h2 className="section-title">已確認不是同一人</h2>
          <div className="card divide-y divide-line">
            {notSameLinks.map((l) => (
              <div key={l.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {nameOf(l.person_a_id)} <span className="text-xs text-muted">≠</span> {nameOf(l.person_b_id)}
                </span>
                {canManageMerge && (
                  <button onClick={() => guard(() => unlinkSamePerson(l.id), '已取消')} className="text-xs text-muted" disabled={busy}>
                    取消
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {canManageMerge && sources.length === 2 && (
        <section>
          <h2 className="section-title">手動指定</h2>
          <div className="card space-y-3 p-4">
            <p className="text-xs text-muted">名字寫法不同(例如「王阿嬤」跟「王秀英」)自動比對不到時,從兩邊各選一人。</p>
            <div>
              <label className="label">{sources[0].name} 的人</label>
              <PersonPicker value={manualA} onChange={setManualA} exclude={sideB} compact />
            </div>
            <div>
              <label className="label">{sources[1].name} 的人</label>
              <PersonPicker value={manualB} onChange={setManualB} exclude={sideA} compact />
            </div>
            <button
              onClick={() =>
                window.confirm(`確定「${nameOf(manualA)}」與「${nameOf(manualB)}」是同一個人?`) &&
                guard(async () => {
                  await linkSamePerson(manualA, manualB, true)
                  setManualA(null)
                  setManualB(null)
                }, '已合併為同一人')
              }
              className="btn-primary w-full"
              disabled={busy || !manualA || !manualB}
            >
              標記為同一人
            </button>
          </div>
        </section>
      )}
    </div>
  )
}
