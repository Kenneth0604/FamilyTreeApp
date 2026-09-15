import { useState } from 'react'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import PersonPicker from './PersonPicker.jsx'
import { SPOUSE_STATUS_LABEL } from '../lib/format.js'
import { LINK_RELATIONS, linkDescription } from '../lib/merge.js'

/**
 * 合併家族樹
 * - 一般家族(editor):產生連結碼 / 用對方的連結碼合併
 * - 合併家族:顯示來源、切回來源、解除合併
 */
export default function MergeSection() {
  const { isMerged } = useStore()
  return isMerged ? <MergedInfo /> : <MergeTools />
}

function MergedInfo() {
  const { family, memberships, switchFamily, removeMerge } = useStore()
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const sources = family?.sources ?? []
  const mine = (fid) => memberships?.find((m) => m.family_id === fid)
  const canRemove = sources.some((s) => mine(s.id) && mine(s.id).role !== 'viewer')

  async function onRemove() {
    if (!window.confirm(`確定要解除合併「${family?.name}」?\n\n只會刪除這個合併家族樹,${sources.map((s) => s.name).join(' 與 ')} 兩個原本家族的資料完全不受影響,之後可以再重新合併。`)) return
    setBusy(true)
    try {
      await removeMerge()
      toast.success('已解除合併')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <h2 className="section-title">合併家族樹</h2>
      <div className="card space-y-3 p-4">
        <p className="text-sm text-ink">
          這是由 <span className="font-semibold">{sources.map((s) => s.name).join(' + ')}</span> 合併而成的唯讀家族樹。兩邊的成員都看得到,但不能在這裡編輯;在原本的家族裡修改後,這裡會自動更新。
        </p>
        <div className="grid grid-cols-2 gap-2">
          {sources.map((s) => (
            <button key={s.id} onClick={() => switchFamily(s.id)} className="btn-secondary btn-sm" disabled={!mine(s.id)} title={mine(s.id) ? '' : '你不是這個家族的成員'}>
              切到「{s.name}」
            </button>
          ))}
        </div>
        {canRemove && (
          <button onClick={onRemove} className="w-full text-center text-xs text-muted hover:text-danger" disabled={busy}>
            解除合併(只刪除這棵合併樹)
          </button>
        )}
      </div>
    </section>
  )
}

function MergeTools() {
  const { canEdit } = useStore()
  if (!canEdit) return null
  return (
    <section>
      <h2 className="section-title">合併家族樹</h2>
      <p className="mb-2 text-xs text-muted">跟另一個家族各出一個人、指定他們的關係,就會產生一棵兩邊都能看、但只能回各自家族編輯的合併家族樹。</p>
      <div className="space-y-3">
        <CreateCode />
        <MergeByCode />
      </div>
    </section>
  )
}

function CreateCode() {
  const { people, peopleById, linkInvites, createLinkCode, revokeLinkCode } = useStore()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [personId, setPersonId] = useState(null)
  const [relation, setRelation] = useState('spouse')
  const [status, setStatus] = useState('married')
  const [isParent, setIsParent] = useState(true)
  const [busy, setBusy] = useState(false)
  const [code, setCode] = useState('')

  async function onCreate() {
    if (!personId) return toast.error('請選一位本家族的成員')
    setBusy(true)
    try {
      const c = await createLinkCode({ personId, relation, status: relation === 'spouse' ? status : null, isParent: relation === 'parent_child' ? isParent : null })
      setCode(c)
      toast.success('已產生連結碼')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('已複製')
    } catch {
      window.prompt('請手動複製', text)
    }
  }

  const person = personId ? peopleById.get(personId) : null
  const preview = person
    ? relation === 'spouse'
      ? `${person.name} 是對方所選人物的${SPOUSE_STATUS_LABEL[status]}配偶 / 伴侶`
      : `${person.name} 是對方所選人物的${isParent ? (person.gender === 'male' ? '爸爸' : person.gender === 'female' ? '媽媽' : '父母') : '小孩'}`
    : ''

  return (
    <div className="card space-y-3 p-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-ink">產生連結碼給對方</p>
        {!open && (
          <button onClick={() => setOpen(true)} className="text-sm text-primary" disabled={people.length === 0}>
            ＋ 產生
          </button>
        )}
      </div>

      {linkInvites.length > 0 && (
        <div className="space-y-1.5">
          {linkInvites.map((inv) => (
            <div key={inv.code} className="flex items-center gap-2 rounded-xl bg-surface-2 px-3 py-2">
              <button onClick={() => copy(inv.code)} className="font-mono text-base font-bold tracking-[0.2em] text-ink" data-selectable>
                {inv.code}
              </button>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{linkDescription({ ...inv, person_name: peopleById.get(inv.person_id)?.name ?? '(已刪除)', person_gender: peopleById.get(inv.person_id)?.gender })}</span>
              <button onClick={() => window.confirm('撤銷後這個連結碼就不能再用了。確定?') && revokeLinkCode(inv.code).catch((e) => toast.error(e.message))} className="shrink-0 text-xs text-muted hover:text-danger">
                撤銷
              </button>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
          <div>
            <label className="label">我這邊的人</label>
            <PersonPicker value={personId} onChange={setPersonId} compact />
          </div>
          <div>
            <label className="label">跟對方那個人的關係</label>
            <div className="flex flex-wrap gap-1.5">
              {LINK_RELATIONS.map((r) => (
                <button key={r.id} type="button" onClick={() => setRelation(r.id)} className={`chip ${relation === r.id ? 'chip-active' : ''}`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>
          {relation === 'spouse' ? (
            <div>
              <label className="label">關係狀態</label>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(SPOUSE_STATUS_LABEL).map(([k, v]) => (
                  <button key={k} type="button" onClick={() => setStatus(k)} className={`chip ${status === k ? 'chip-active' : ''}`}>
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div>
              <label className="label">我這邊的人是…</label>
              <div className="flex gap-1.5">
                <button type="button" onClick={() => setIsParent(true)} className={`chip ${isParent ? 'chip-active' : ''}`}>
                  對方那個人的父母
                </button>
                <button type="button" onClick={() => setIsParent(false)} className={`chip ${!isParent ? 'chip-active' : ''}`}>
                  對方那個人的小孩
                </button>
              </div>
            </div>
          )}
          {preview && <p className="text-xs text-muted">{preview}</p>}
          {code ? (
            <div className="rounded-xl bg-surface p-3 text-center">
              <p className="text-xs text-muted">把這個碼傳給對方家族的可編輯成員,他們在「用連結碼合併」輸入即可</p>
              <button onClick={() => copy(code)} className="mt-1 font-mono text-2xl font-bold tracking-[0.25em] text-ink" data-selectable>
                {code}
              </button>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <button onClick={() => copy(code)} className="btn-primary btn-sm">
                  複製
                </button>
                <button
                  onClick={() => {
                    setCode('')
                    setOpen(false)
                    setPersonId(null)
                  }}
                  className="btn-secondary btn-sm"
                >
                  完成
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setOpen(false)} className="btn-secondary btn-sm" disabled={busy}>
                取消
              </button>
              <button onClick={onCreate} className="btn-primary btn-sm" disabled={busy || !personId}>
                {busy ? '產生中…' : '產生連結碼'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MergeByCode() {
  const { family, peekLinkCode, mergeWithCode } = useStore()
  const toast = useToast()
  const [code, setCode] = useState('')
  const [peek, setPeek] = useState(null)
  const [personId, setPersonId] = useState(null)
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  async function onPeek() {
    setBusy(true)
    try {
      setPeek(await peekLinkCode(code))
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  async function onMerge() {
    if (!personId) return toast.error('請選一位本家族的成員')
    if (!window.confirm(`確定要合併?\n\n${linkDescription(peek)}。\n會建立一棵新的合併家族樹,兩邊所有成員都看得到但不能在裡面編輯;原本兩個家族不受影響,之後也可以解除合併。`)) return
    setBusy(true)
    try {
      await mergeWithCode(code, personId, name.trim())
      toast.success('已建立合併家族樹')
    } catch (e) {
      toast.error(e.message)
    } finally {
      setBusy(false)
    }
  }

  const mySide = peek ? (peek.relation === 'spouse' ? `我這邊要選的是 ${peek.person_name} 的${SPOUSE_STATUS_LABEL[peek.status] || ''}配偶 / 伴侶` : peek.is_parent ? `我這邊要選的是 ${peek.person_name} 的小孩` : `我這邊要選的是 ${peek.person_name} 的${peek.relation === 'parent_child' ? '父母' : ''}`) : ''

  return (
    <div className="card space-y-3 p-4">
      <p className="text-sm font-semibold text-ink">用對方的連結碼合併</p>
      <div className="flex gap-2">
        <input
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setPeek(null)
          }}
          placeholder="6 碼連結碼"
          className="input flex-1 text-center font-mono text-lg tracking-[0.3em] uppercase"
          maxLength={6}
          autoCapitalize="characters"
        />
        <button onClick={onPeek} className="btn-secondary btn-sm shrink-0" disabled={busy || code.length < 6}>
          查看
        </button>
      </div>
      {peek && (
        <div className="space-y-3 rounded-2xl bg-surface-2 p-3">
          <p className="text-sm text-ink">{linkDescription(peek)}</p>
          <p className="text-xs text-muted">{mySide}</p>
          <div>
            <label className="label">我這邊的人</label>
            <PersonPicker value={personId} onChange={setPersonId} compact />
          </div>
          <div>
            <label className="label">合併後的家族名稱(可不填)</label>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder={`${peek.family_name} × ${family?.name}`} />
          </div>
          <button onClick={onMerge} className="btn-primary w-full" disabled={busy || !personId}>
            {busy ? '合併中…' : '合併家族樹'}
          </button>
        </div>
      )}
    </div>
  )
}
