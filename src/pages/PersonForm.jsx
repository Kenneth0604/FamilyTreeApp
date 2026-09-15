import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import AvatarUploader from '../components/AvatarUploader.jsx'
import PersonPicker from '../components/PersonPicker.jsx'
import Avatar from '../components/Avatar.jsx'
import { parseBirth } from '../lib/kinship/birth.js'
import { isActiveSpouse } from '../lib/kinship/graph.js'
import { SPOUSE_STATUS_LABEL, POLITICS, birthOrderLabel, parseList, toPartialDate } from '../lib/format.js'

const REL = [
  { id: 'parent', label: '父母', desc: '新成員是這個人的爸爸 / 媽媽' },
  { id: 'child', label: '子女', desc: '新成員是這個人的孩子' },
  { id: 'spouse', label: '配偶 / 伴侶', desc: '新成員是這個人的先生 / 太太,或未婚伴侶、前任' },
  { id: 'sibling', label: '兄弟姊妹', desc: '新成員與這個人有相同的父母' },
]

export default function PersonForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { people, peopleById, graph, viewpointId, selfId, addPerson, updatePerson, addParentChild, addSpouse, setSelf } = useStore()

  const editing = id ? peopleById.get(id) : null
  const isNew = !id

  // ----- 基本欄位 -----
  const [name, setName] = useState('')
  const [nicknames, setNicknames] = useState('')
  const [tags, setTags] = useState('')
  const [politics, setPolitics] = useState(null)
  const [gender, setGender] = useState('unspecified')
  const [year, setYear] = useState('')
  const [month, setMonth] = useState('')
  const [day, setDay] = useState('')
  const [deceased, setDeceased] = useState(false)
  const [birthOrder, setBirthOrder] = useState('')
  const [avatar, setAvatar] = useState(null)
  const [note, setNote] = useState('')

  // ----- 關係(僅新增) -----
  const [relType, setRelType] = useState(params.get('rel') || (people.length ? 'child' : ''))
  const [anchorId, setAnchorId] = useState(params.get('of') || viewpointId || people[0]?.id || null)
  const [spouseStatus, setSpouseStatus] = useState('married')
  const [coParentIds, setCoParentIds] = useState([]) // 新增子女時,同時設為配偶的孩子
  const [placeholderGender, setPlaceholderGender] = useState('male')
  const [makeSelf, setMakeSelf] = useState(false)

  useEffect(() => {
    if (editing) {
      setName(editing.name)
      setNicknames((editing.nicknames || []).join('、'))
      setTags((editing.tags || []).join('、'))
      setPolitics(editing.politics || null)
      setGender(editing.gender)
      const b = parseBirth(editing.birth_date)
      setYear(b ? String(b.y) : '')
      setMonth(b?.m ? String(b.m) : '')
      setDay(b?.d ? String(b.d) : '')
      setDeceased(Boolean(editing.is_deceased))
      setBirthOrder(editing.birth_order ? String(editing.birth_order) : '')
      setAvatar(editing.avatar_url || null)
      setNote(editing.note || '')
    }
  }, [editing])

  useEffect(() => {
    // 第一位成員 → 預設就是「我自己」
    if (isNew && people.length === 0) setMakeSelf(true)
  }, [isNew, people.length])

  const anchor = anchorId ? peopleById.get(anchorId) : null
  const anchorParents = useMemo(() => (anchorId ? graph.parentsOf.get(anchorId) || [] : []), [graph, anchorId])
  const anchorSpouses = useMemo(
    () => (anchorId ? (graph.spousesOf.get(anchorId) || []).filter((s) => isActiveSpouse(s.status)).map((s) => s.id) : []),
    [graph, anchorId],
  )
  useEffect(() => {
    // 新增子女時預設把現任配偶也設為另一位家長
    setCoParentIds(relType === 'child' ? anchorSpouses : [])
  }, [relType, anchorSpouses])

  const needsPlaceholder = isNew && relType === 'sibling' && anchorId && anchorParents.length === 0
  const hasRelation = isNew && people.length > 0

  const [busy, setBusy] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return toast.error('請輸入姓名')
    if (hasRelation && (!relType || !anchorId)) return toast.error('請選擇這個人與樹上哪位成員是什麼關係')
    if (year && (Number(year) < 1 || Number(year) > 9999)) return toast.error('年份格式不正確')

    const fields = {
      name: name.trim(),
      nicknames: parseList(nicknames),
      tags: parseList(tags),
      politics,
      gender,
      birth_date: toPartialDate(year, month, day),
      birth_order: birthOrder ? Number(birthOrder) : null,
      is_deceased: deceased,
      avatar_url: avatar,
      note: note.trim(),
    }

    setBusy(true)
    try {
      if (editing) {
        await updatePerson(editing.id, fields)
        toast.success('已更新')
        navigate(`/people/${editing.id}`, { replace: true })
        return
      }

      const newId = await addPerson(fields)

      if (hasRelation) {
        if (relType === 'parent') {
          await addParentChild(newId, anchorId)
        } else if (relType === 'child') {
          await addParentChild(anchorId, newId)
          for (const pid of coParentIds) await addParentChild(pid, newId)
        } else if (relType === 'spouse') {
          await addSpouse(anchorId, newId, spouseStatus)
        } else if (relType === 'sibling') {
          let parents = anchorParents
          if (parents.length === 0) {
            // 建立可稍後補資料的父 / 母佔位節點
            const placeholderId = await addPerson({
              name: `${anchor?.name ?? '成員'}的${placeholderGender === 'male' ? '爸爸' : '媽媽'}(待補)`,
              gender: placeholderGender,
              birth_date: null,
              is_deceased: false,
              avatar_url: null,
              note: '系統自動建立的佔位節點,請補上正確資料。',
            })
            await addParentChild(placeholderId, anchorId)
            parents = [placeholderId]
          }
          for (const pid of parents) await addParentChild(pid, newId)
        }
      }

      if (makeSelf) await setSelf(newId)
      toast.success('已新增')
      navigate(`/people/${newId}`, { replace: true })
    } catch (err) {
      toast.error(err.message || '儲存失敗')
    } finally {
      setBusy(false)
    }
  }

  if (id && !editing) return <p className="empty">找不到這位成員</p>

  const yearNum = Number(year)
  const daysInMonth = month && yearNum ? new Date(yearNum, Number(month), 0).getDate() : 31

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">{editing ? '編輯成員' : '新增成員'}</h1>
        <Link to={editing ? `/people/${editing.id}` : '/people'} className="text-sm text-muted">
          取消
        </Link>
      </div>

      {hasRelation && (
        <section className="card space-y-3 p-4">
          <h2 className="section-title">這個人是誰的…</h2>
          <div className="grid grid-cols-4 gap-1.5">
            {REL.map((r) => (
              <button key={r.id} type="button" onClick={() => setRelType(r.id)} className={`chip justify-center ${relType === r.id ? 'chip-active' : ''}`}>
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted">{REL.find((r) => r.id === relType)?.desc}</p>
          <div>
            <label className="label">對象(樹上既有成員)</label>
            <PersonPicker value={anchorId} onChange={setAnchorId} compact />
          </div>

          {relType === 'spouse' && (
            <div>
              <label className="label">關係狀態</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SPOUSE_STATUS_LABEL).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setSpouseStatus(k)} className={`chip ${spouseStatus === k ? 'chip-active' : ''}`}>
                    {v}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-muted">離婚 / 前伴侶在樹狀圖上會用不同線型標示,也可以有共同的孩子。</p>
            </div>
          )}

          {relType === 'child' && anchorSpouses.length > 0 && (
            <div>
              <label className="label">另一位家長</label>
              <div className="space-y-1.5">
                {anchorSpouses.map((sid) => {
                  const sp = peopleById.get(sid)
                  const on = coParentIds.includes(sid)
                  return (
                    <label key={sid} className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" checked={on} onChange={(e) => setCoParentIds((l) => (e.target.checked ? [...l, sid] : l.filter((x) => x !== sid)))} className="h-4 w-4 accent-primary" />
                      <Avatar person={sp} size="sm" />
                      同時設為 {sp?.name} 的孩子
                    </label>
                  )
                })}
              </div>
            </div>
          )}

          {needsPlaceholder && (
            <div className="rounded-xl bg-warning-soft p-3 text-sm text-warning">
              <p className="font-semibold">{anchor?.name} 還沒有父母紀錄</p>
              <p className="mt-1 text-xs">兄弟姊妹關係是靠「共同父母」推算的。系統會先建立一個佔位的父 / 母節點,把兩人都掛在底下,你之後再補上正確資料即可。</p>
              <div className="mt-2 flex gap-1.5">
                {[
                  ['male', '建立爸爸'],
                  ['female', '建立媽媽'],
                ].map(([g, label]) => (
                  <button key={g} type="button" onClick={() => setPlaceholderGender(g)} className={`chip ${placeholderGender === g ? 'chip-active' : ''}`}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      <section className="card space-y-4 p-4">
        <div>
          <label className="label">大頭照</label>
          <AvatarUploader value={avatar} onChange={setAvatar} preview={{ name, gender }} />
        </div>
        <div>
          <label className="label">姓名 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="姓名或稱呼" required autoFocus={isNew} />
        </div>
        <div>
          <label className="label">小名 / 別名(可多個)</label>
          <input value={nicknames} onChange={(e) => setNicknames(e.target.value)} className="input" placeholder="例如:阿明、小明、Ming" />
          <p className="mt-1 text-xs text-muted">用「、」或逗號分隔,會顯示在姓名旁邊,搜尋成員時也找得到。</p>
        </div>
        <div>
          <label className="label">標籤(可多個)</label>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className="input" placeholder="例如:ADHD、左撇子、素食" />
          <p className="mt-1 text-xs text-muted">自由輸入,用「、」或逗號分隔。會以 #標籤 顯示在詳細頁,搜尋時也找得到。</p>
        </div>
        <div>
          <label className="label">政治立場</label>
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setPolitics(null)} className={`chip ${politics === null ? 'chip-active' : ''}`}>
              不標示
            </button>
            {POLITICS.map((p) => (
              <button key={p.id} type="button" onClick={() => setPolitics(p.id)} className={`chip gap-1.5 ${politics === p.id ? 'chip-active' : ''}`}>
                <span className="h-3 w-3 rounded-full" style={{ background: p.color }} />
                {p.label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">樹狀圖的顯示方式切到「政治立場」時,卡片頂端會用這個顏色標示。</p>
        </div>
        <div>
          <label className="label">性別</label>
          <div className="flex gap-1.5">
            {[
              ['male', '男'],
              ['female', '女'],
              ['unspecified', '未指定'],
            ].map(([g, label]) => (
              <button key={g} type="button" onClick={() => setGender(g)} className={`chip ${gender === g ? 'chip-active' : ''}`}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1 text-xs text-muted">性別會影響稱謂(例如 姑姑 / 叔叔)。未指定時會以中性描述呈現。</p>
        </div>
        <div>
          <label className="label">生日(可只填年份)</label>
          <div className="grid grid-cols-3 gap-2">
            <input type="number" inputMode="numeric" min="1" max="9999" value={year} onChange={(e) => setYear(e.target.value)} placeholder="年" className="input" />
            <select value={month} onChange={(e) => { setMonth(e.target.value); if (!e.target.value) setDay('') }} className="input" disabled={!year}>
              <option value="">月</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} 月
                </option>
              ))}
            </select>
            <select value={day} onChange={(e) => setDay(e.target.value)} className="input" disabled={!month}>
              <option value="">日</option>
              {Array.from({ length: daysInMonth }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {i + 1} 日
                </option>
              ))}
            </select>
          </div>
          <p className="mt-1 text-xs text-muted">生日用來判斷長幼(哥哥 / 弟弟、伯伯 / 叔叔…),沒填時會以中性詞代替。</p>
        </div>
        <div>
          <label className="label">排行(在兄弟姊妹中是老幾)</label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted">老</span>
            <input type="number" inputMode="numeric" min="1" max="99" value={birthOrder} onChange={(e) => setBirthOrder(e.target.value)} placeholder="例如 2" className="input w-24" />
            {birthOrder && <span className="text-sm text-ink">{birthOrderLabel(Number(birthOrder))}</span>}
          </div>
          <p className="mt-1 text-xs text-muted">不知道實際生日時,填排行(1 = 老大)也能正確判斷哥哥 / 弟弟、伯伯 / 叔叔。同時有生日時以生日為準。</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} className="h-4 w-4 accent-primary" />
          已過世
        </label>
        <div>
          <label className="label">描述 / 備註</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} className="input" placeholder="出生地、職業、故事、聯絡方式…" />
        </div>
      </section>

      {isNew && !selfId && (
        <label className="card flex items-center gap-3 p-4 text-sm text-ink">
          <input type="checkbox" checked={makeSelf} onChange={(e) => setMakeSelf(e.target.checked)} className="h-4 w-4 accent-primary" />
          <span>
            <span className="font-semibold">這個人就是我自己</span>
            <span className="block text-xs text-muted">會把這個節點設為你的身分與預設視角,之後可在設定頁更改。</span>
          </span>
        </label>
      )}

      <button type="submit" disabled={busy} className="btn-primary w-full py-3.5">
        {busy ? '儲存中…' : editing ? '儲存變更' : '新增成員'}
      </button>
    </form>
  )
}
