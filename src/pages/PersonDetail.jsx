import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import Avatar from '../components/Avatar.jsx'
import TermBadge from '../components/TermBadge.jsx'
import PersonPicker from '../components/PersonPicker.jsx'
import LifeEntries from '../components/LifeEntries.jsx'
import StatsPanel from '../components/StatsPanel.jsx'
import PetCard from '../components/PetCard.jsx'
import { ageLabel, birthLabel, deathLabel, birthOrderLabel, displayName, GENDER_LABEL, SPOUSE_STATUS_LABEL, POLITICS_BY_ID, relativeTime } from '../lib/format.js'
import { computeRelationTerm } from '../lib/kinship/index.js'
import { compareSiblings } from '../lib/kinship/birth.js'

export default function PersonDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const store = useStore()
  const { peopleById, graph, parentChild, spouses, pets, termFor, viewpointId, selfId, advanced, memberName, nameOf, canEdit, family } = store
  const person = peopleById.get(id)

  const [adding, setAdding] = useState(null) // 'parent' | 'child' | 'spouse' | 'sibling' | null
  const [pickId, setPickId] = useState(null)
  const [busy, setBusy] = useState(false)

  const parents = useMemo(() => parentChild.filter((r) => r.child_id === id), [parentChild, id])
  const children = useMemo(() => parentChild.filter((r) => r.parent_id === id), [parentChild, id])
  const spouseRows = useMemo(() => spouses.filter((r) => r.person_a_id === id || r.person_b_id === id), [spouses, id])
  const siblings = useMemo(() => {
    const set = new Set()
    for (const p of graph.parentsOf.get(id) || []) for (const c of graph.childrenOf.get(p) || []) if (c !== id) set.add(c)
    return [...set].sort((a, b) => -compareSiblings(peopleById.get(a), peopleById.get(b)))
  }, [graph, id, peopleById])

  // 從這個人的角度看其他人(在詳細頁列關係時很直觀)
  const fromHere = (otherId) => computeRelationTerm(id, otherId, graph, { advanced })

  if (!person) {
    return (
      <div className="space-y-3">
        <p className="empty">找不到這位成員(可能已被其他人刪除)</p>
        <Link to="/people" className="btn-secondary w-full">
          回成員列表
        </Link>
      </div>
    )
  }

  const term = termFor(id)
  const isViewpoint = id === viewpointId
  const isSelf = id === selfId

  async function guard(fn, okMsg) {
    setBusy(true)
    try {
      await fn()
      if (okMsg) toast.success(okMsg)
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function linkExisting() {
    if (!pickId) return
    await guard(async () => {
      if (adding === 'parent') await store.addParentChild(pickId, id)
      else if (adding === 'child') await store.addParentChild(id, pickId)
      else if (adding === 'spouse') await store.addSpouse(id, pickId, 'married')
      else if (adding === 'sibling') {
        const ps = graph.parentsOf.get(id) || []
        if (ps.length === 0) throw new Error(`${person.name} 還沒有父母紀錄,請改用「建立新成員」,系統會協助建立佔位父母`)
        for (const p of ps) if (!(graph.parentsOf.get(pickId) || []).includes(p)) await store.addParentChild(p, pickId)
      }
      setAdding(null)
      setPickId(null)
    }, '已建立關係')
  }

  async function onDelete() {
    if (!window.confirm(`確定要刪除「${person.name}」嗎?與這個人相關的所有關係也會一併移除,無法復原。`)) return
    await guard(async () => {
      await store.deletePerson(id)
      navigate('/people', { replace: true })
    }, '已刪除')
  }

  const excludeIds = [id]
  if (adding === 'parent') excludeIds.push(...(graph.parentsOf.get(id) || []))
  if (adding === 'child') excludeIds.push(...(graph.childrenOf.get(id) || []))
  if (adding === 'spouse') excludeIds.push(...(graph.spousesOf.get(id) || []).map((s) => s.id))
  if (adding === 'sibling') excludeIds.push(...siblings)

  return (
    <div className="space-y-4">
      {/* 基本資料 */}
      <section className="card p-4">
        <div className="flex items-start gap-4">
          <Avatar person={person} size="xl" ring={isViewpoint} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-xl font-bold text-ink">{displayName(person)}</h1>
              {person.married_surname && <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">本名 {person.name}</span>}
              {person.nicknames?.map((n) => (
                <span key={n} className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted">
                  {n}
                </span>
              ))}
              {isSelf && <span className="term term-self">我</span>}
              {person.is_deceased && <span className="chip px-2 py-0.5 text-xs">{ageLabel(person) || '已故'}</span>}
            </div>
            <div className="mt-1.5">
              {viewpointId ? <TermBadge result={term} size="sm" showHint /> : <span className="text-xs text-muted">尚未設定視角</span>}
            </div>
            {person.aliases?.length > 0 && (
              <p className="mt-1 text-xs text-muted">
                同一人:{person.aliases.map((a) => `${family?.sources?.find((s) => s.id === a.family_id)?.name ?? '另一個家族'}的「${a.name}」`).join('、')}
              </p>
            )}
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted">性別</dt>
              <dd className="text-ink">{GENDER_LABEL[person.gender]}</dd>
              <dt className="text-muted">生日</dt>
              <dd className="text-ink">
                {birthLabel(person) || <span className="text-muted/70">未填</span>}
                {ageLabel(person) && !person.is_deceased && <span className="ml-2 text-muted">{ageLabel(person)}</span>}
              </dd>
              {person.is_deceased && (
                <>
                  <dt className="text-muted">逝世</dt>
                  <dd className="text-ink">{deathLabel(person) || (person.death_age ? <span className="text-muted">日期不詳 · 約 {person.death_age} 歲</span> : <span className="text-muted/70">未填</span>)}</dd>
                </>
              )}
              {person.birth_order && (
                <>
                  <dt className="text-muted">排行</dt>
                  <dd className="text-ink">{birthOrderLabel(person.birth_order)}</dd>
                </>
              )}
            </dl>
          </div>
        </div>
        {(person.tags?.length > 0 || person.politics) && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {POLITICS_BY_ID[person.politics] && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-0.5 text-xs font-medium text-ink">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: POLITICS_BY_ID[person.politics].color }} />
                {POLITICS_BY_ID[person.politics].label}
              </span>
            )}
            {person.tags?.map((t) => (
              <span key={t} className="rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                #{t}
              </span>
            ))}
          </div>
        )}
        {person.note && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink" data-selectable>
            {person.note}
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {canEdit && (
            <Link to={`/people/${id}/edit`} className="btn-secondary btn-sm">
              編輯資料
            </Link>
          )}
          {!isViewpoint && (
            <button onClick={() => guard(() => store.setViewpoint(id), `已切換視角為 ${person.name}`)} className="btn-secondary btn-sm" disabled={busy}>
              以這個人的視角看
            </button>
          )}
          {!isSelf && (
            <button onClick={() => guard(() => store.setSelf(id), '已設定為我自己')} className="btn-secondary btn-sm" disabled={busy}>
              這是我自己
            </button>
          )}
        </div>
      </section>

      {/* 屬性 */}
      <StatsPanel person={person} />

      {/* 關係 */}
      <section className="card p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="section-title mb-0">關係</h2>
          <span className="text-xs text-muted">以 {person.name} 為視角</span>
        </div>

        <RelationGroup
          title="父母"
          empty="尚無父母紀錄"
          items={parents.map((r) => ({ key: r.id, pid: r.parent_id, onRemove: canEdit ? () => guard(() => store.removeParentChild(r.id), '已移除') : null }))}
          fromHere={fromHere}
          peopleById={peopleById}
          busy={busy}
          onAdd={canEdit ? () => { setAdding('parent'); setPickId(null) } : null}
        />
        <RelationGroup
          title="配偶 / 伴侶"
          empty="尚無配偶或伴侶紀錄"
          items={spouseRows.map((r) => {
            const other = r.person_a_id === id ? r.person_b_id : r.person_a_id
            return {
              key: r.id,
              pid: other,
              extra: canEdit ? (
                <select value={r.status} onChange={(e) => guard(() => store.updateSpouse(r.id, e.target.value))} className="input w-auto py-1 text-xs" disabled={busy}>
                  {Object.entries(SPOUSE_STATUS_LABEL).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="text-xs text-muted">{SPOUSE_STATUS_LABEL[r.status]}</span>
              ),
              onRemove: canEdit ? () => guard(() => store.removeSpouse(r.id), '已移除') : null,
            }
          })}
          fromHere={fromHere}
          peopleById={peopleById}
          busy={busy}
          onAdd={canEdit ? () => { setAdding('spouse'); setPickId(null) } : null}
        />
        <RelationGroup
          title="子女"
          empty="尚無子女紀錄"
          items={children
            .map((r) => ({ key: r.id, pid: r.child_id, onRemove: canEdit ? () => guard(() => store.removeParentChild(r.id), '已移除') : null }))
            .sort((a, b) => -compareSiblings(peopleById.get(a.pid), peopleById.get(b.pid)))}
          fromHere={fromHere}
          peopleById={peopleById}
          busy={busy}
          onAdd={canEdit ? () => { setAdding('child'); setPickId(null) } : null}
        />
        <RelationGroup
          title="兄弟姊妹"
          hint="由共同父母自動推算"
          empty="尚無兄弟姊妹"
          items={siblings.map((sid) => ({ key: sid, pid: sid }))}
          fromHere={fromHere}
          peopleById={peopleById}
          busy={busy}
          onAdd={canEdit ? () => { setAdding('sibling'); setPickId(null) } : null}
        />

        {canEdit && adding && (
          <div className="mt-3 rounded-2xl bg-surface-2 p-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-sm font-semibold text-ink">新增{{ parent: '父母', child: '子女', spouse: '配偶 / 伴侶', sibling: '兄弟姊妹' }[adding]}</p>
              <button onClick={() => setAdding(null)} className="text-xs text-muted">
                取消
              </button>
            </div>
            <Link to={`/people/new?rel=${adding}&of=${id}`} className="btn-primary btn-sm mb-3 w-full">
              ＋ 建立新成員
            </Link>
            <p className="mb-1.5 text-xs text-muted">或從既有成員中選擇:</p>
            <PersonPicker value={pickId} onChange={setPickId} exclude={excludeIds} />
            <button onClick={linkExisting} disabled={!pickId || busy} className="btn-secondary btn-sm mt-2 w-full">
              建立關係
            </button>
          </div>
        )}
      </section>

      {/* 生平紀事 */}
      <LifeEntries personId={id} />

      {/* 寵物 */}
      {(pets.some((p) => p.owner_person_id === id) || canEdit) && (
        <section className="card p-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="section-title mb-0">🐾 寵物</h2>
            {canEdit && (
              <Link to={`/pets/new?owner=${id}`} className="text-sm text-primary">
                ＋ 新增
              </Link>
            )}
          </div>
          {pets.filter((p) => p.owner_person_id === id).length === 0 ? (
            <p className="text-xs text-muted">{person.name} 還沒有登記寵物</p>
          ) : (
            <div className="space-y-2">
              {pets
                .filter((p) => p.owner_person_id === id)
                .map((p) => (
                  <PetCard key={p.id} pet={p} showOwner={false} />
                ))}
            </div>
          )}
        </section>
      )}

      {/* 編輯紀錄 */}
      <section className="px-1 text-xs text-muted">
        {person.updated_by && (
          <p>
            最後由 {memberName(person.updated_by)} 編輯 · {relativeTime(person.updated_at)}
          </p>
        )}
        {person.created_by && <p>由 {memberName(person.created_by)} 建立 · {relativeTime(person.created_at)}</p>}
        {term?.path?.length > 1 && <p className="mt-1">推算路徑:{nameOf(viewpointId)} → {term.path.map((s) => nameOf(s.to)).join(' → ')}</p>}
      </section>

      {canEdit && (
        <button onClick={onDelete} disabled={busy} className="btn-danger-outline w-full">
          刪除這位成員
        </button>
      )}
    </div>
  )
}

function RelationGroup({ title, hint, empty, items, fromHere, peopleById, busy, onAdd }) {
  return (
    <div className="border-t border-line py-2.5 first:border-t-0">
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">
          {title}
          {hint && <span className="ml-1.5 text-xs font-normal text-muted">{hint}</span>}
        </p>
        {onAdd && (
          <button onClick={onAdd} className="text-sm text-primary">
            ＋ 新增
          </button>
        )}
      </div>
      {items.length === 0 && <p className="text-xs text-muted">{empty}</p>}
      <div className="space-y-1">
        {items.map((it) => {
          const p = peopleById.get(it.pid)
          return (
            <div key={it.key} className="flex items-center gap-2">
              <Link to={`/people/${it.pid}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 active:bg-surface-2">
                <Avatar person={p} size="sm" />
                <span className="truncate text-sm text-ink">{p?.name ?? '(已刪除)'}</span>
                {p?.birth_order && <span className="shrink-0 text-[11px] text-muted">{birthOrderLabel(p.birth_order)}</span>}
                <TermBadge result={fromHere(it.pid)} />
              </Link>
              {it.extra}
              {it.onRemove && (
                <button
                  onClick={() => window.confirm(`確定要移除與「${p?.name}」的這條關係?`) && it.onRemove()}
                  disabled={busy}
                  className="rounded-full px-2 py-1 text-xs text-muted hover:text-danger"
                  aria-label="移除關係"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
