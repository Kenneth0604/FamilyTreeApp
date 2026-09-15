import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import AvatarUploader from '../components/AvatarUploader.jsx'
import PersonPicker from '../components/PersonPicker.jsx'
import { PartialDateInput } from '../components/LifeEntries.jsx'
import { parseBirth } from '../lib/kinship/birth.js'
import { PET_SPECIES, PET_GENDER_LABEL, toPartialDate } from '../lib/format.js'

export default function PetForm() {
  const { id } = useParams()
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { pets, addPet, updatePet } = useStore()

  const editing = id ? pets.find((p) => p.id === id) : null
  const isNew = !id

  const [name, setName] = useState('')
  const [species, setSpecies] = useState('dog')
  const [breed, setBreed] = useState('')
  const [gender, setGender] = useState('unspecified')
  const [ownerId, setOwnerId] = useState(params.get('owner') || null)
  const [birth, setBirth] = useState({})
  const [deceased, setDeceased] = useState(false)
  const [avatar, setAvatar] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!editing) return
    setName(editing.name)
    setSpecies(editing.species || 'other')
    setBreed(editing.breed || '')
    setGender(editing.gender || 'unspecified')
    setOwnerId(editing.owner_person_id || null)
    setBirth(parseBirth(editing.birth_date) || {})
    setDeceased(Boolean(editing.is_deceased))
    setAvatar(editing.avatar_url || null)
    setNote(editing.note || '')
  }, [editing])

  async function onSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return toast.error('請輸入名字')
    if (birth.y && (Number(birth.y) < 1 || Number(birth.y) > 9999)) return toast.error('年份格式不正確')
    const fields = {
      name: name.trim(),
      species,
      breed: breed.trim(),
      gender,
      owner_person_id: ownerId || null,
      birth_date: toPartialDate(birth.y, birth.m, birth.d),
      is_deceased: deceased,
      avatar_url: avatar,
      note: note.trim(),
    }
    setBusy(true)
    try {
      if (editing) {
        await updatePet(editing.id, fields)
        toast.success('已更新')
        navigate(`/pets/${editing.id}`, { replace: true })
      } else {
        const newId = await addPet(fields)
        toast.success('已新增')
        navigate(`/pets/${newId}`, { replace: true })
      }
    } catch (err) {
      toast.error(err.message || '儲存失敗')
    } finally {
      setBusy(false)
    }
  }

  if (id && !editing) return <p className="empty">找不到這隻寵物</p>

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-ink">{editing ? '編輯寵物' : '新增寵物'}</h1>
        <Link to={editing ? `/pets/${editing.id}` : '/people'} className="text-sm text-muted">
          取消
        </Link>
      </div>

      <section className="card space-y-4 p-4">
        <div>
          <label className="label">照片</label>
          <AvatarUploader value={avatar} onChange={setAvatar} preview={{ name, gender }} />
        </div>
        <div>
          <label className="label">名字 *</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="例如:咪咪、旺財" required autoFocus={isNew} />
        </div>
        <div>
          <label className="label">種類</label>
          <div className="flex flex-wrap gap-1.5">
            {PET_SPECIES.map((s) => (
              <button key={s.id} type="button" onClick={() => setSpecies(s.id)} className={`chip ${species === s.id ? 'chip-active' : ''}`}>
                {s.icon} {s.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">品種</label>
          <input value={breed} onChange={(e) => setBreed(e.target.value)} className="input" placeholder="例如:柴犬、米克斯、英國短毛貓" />
        </div>
        <div>
          <label className="label">性別</label>
          <div className="flex gap-1.5">
            {Object.entries(PET_GENDER_LABEL).map(([g, label]) => (
              <button key={g} type="button" onClick={() => setGender(g)} className={`chip ${gender === g ? 'chip-active' : ''}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label">主人</label>
          <PersonPicker value={ownerId} onChange={setOwnerId} compact allowNone noneLabel="全家共同的寶貝" />
        </div>
        <div>
          <label className="label">生日(可只填年份)</label>
          <PartialDateInput value={birth} onChange={setBirth} />
        </div>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input type="checkbox" checked={deceased} onChange={(e) => setDeceased(e.target.checked)} className="h-4 w-4 accent-primary" />
          已經去當小天使了
        </label>
        <div>
          <label className="label">備註</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} className="input min-h-20" rows={3} placeholder="怎麼來到家裡的、最愛的零食、經典事蹟…" />
        </div>
      </section>

      <button type="submit" disabled={busy} className="btn-primary w-full">
        {busy ? '儲存中…' : editing ? '儲存變更' : '新增寵物'}
      </button>
    </form>
  )
}
