import { Link, useNavigate, useParams } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import Avatar from '../components/Avatar.jsx'
import PetStatsPanel from '../components/PetStatsPanel.jsx'
import { ageLabel, birthLabel, PET_GENDER_LABEL, PET_SPECIES_BY_ID, relativeTime } from '../lib/format.js'

export default function PetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { pets, peopleById, canEdit, deletePet, memberName } = useStore()
  const pet = pets.find((p) => p.id === id)

  if (!pet) {
    return (
      <div className="space-y-3">
        <p className="empty">找不到這隻寵物(可能已被其他人刪除)</p>
        <Link to="/people" className="btn-secondary w-full">
          回成員列表
        </Link>
      </div>
    )
  }

  const sp = PET_SPECIES_BY_ID[pet.species] || PET_SPECIES_BY_ID.other
  const owner = pet.owner_person_id ? peopleById.get(pet.owner_person_id) : null

  async function onDelete() {
    if (!window.confirm(`確定要刪除「${pet.name}」嗎?無法復原。`)) return
    try {
      await deletePet(pet.id)
      toast.success('已刪除')
      navigate('/people', { replace: true })
    } catch (e) {
      toast.error(e.message)
    }
  }

  return (
    <div className="space-y-4">
      <section className="card p-4">
        <div className="flex items-start gap-4">
          <Avatar person={pet} size="xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="text-xl font-bold text-ink">{pet.name}</h1>
              <span className="text-xl leading-none">{sp.icon}</span>
              {pet.is_deceased && <span className="chip px-2 py-0.5 text-xs">小天使</span>}
            </div>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
              <dt className="text-muted">種類</dt>
              <dd className="text-ink">{[sp.label, pet.breed].filter(Boolean).join(' · ')}</dd>
              <dt className="text-muted">性別</dt>
              <dd className="text-ink">{PET_GENDER_LABEL[pet.gender] || '未指定'}</dd>
              <dt className="text-muted">生日</dt>
              <dd className="text-ink">
                {birthLabel(pet) || <span className="text-muted/70">未填</span>}
                {ageLabel(pet) && !pet.is_deceased && <span className="ml-2 text-muted">{ageLabel(pet)}</span>}
              </dd>
              <dt className="text-muted">主人</dt>
              <dd className="text-ink">
                {owner ? (
                  <Link to={`/people/${owner.id}`} className="inline-flex items-center gap-1 text-primary">
                    <Avatar person={owner} size="sm" className="h-5 w-5 text-[10px]" />
                    {owner.name}
                  </Link>
                ) : (
                  <span className="text-muted/70">全家共同的寶貝</span>
                )}
              </dd>
            </dl>
          </div>
        </div>
        {pet.note && (
          <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink" data-selectable>
            {pet.note}
          </p>
        )}
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to={`/pets/${pet.id}/edit`} className="btn-secondary btn-sm">
              編輯資料
            </Link>
          </div>
        )}
      </section>

      <PetStatsPanel pet={pet} />

      <section className="px-1 text-xs text-muted">
        {pet.updated_by && (
          <p>
            最後由 {memberName(pet.updated_by)} 編輯 · {relativeTime(pet.updated_at)}
          </p>
        )}
        {pet.created_by && <p>由 {memberName(pet.created_by)} 建立 · {relativeTime(pet.created_at)}</p>}
      </section>

      {canEdit && (
        <button onClick={onDelete} className="btn-danger-outline w-full">
          刪除這隻寵物
        </button>
      )}
    </div>
  )
}
