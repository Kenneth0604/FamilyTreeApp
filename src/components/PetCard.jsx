import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import { useStore } from '../lib/store.jsx'
import { ageLabel, PET_SPECIES_BY_ID, overallRating, PET_STATS, PET_RANKS } from '../lib/format.js'

export default function PetCard({ pet, showOwner = true }) {
  const { nameOf } = useStore()
  const sp = PET_SPECIES_BY_ID[pet.species] || PET_SPECIES_BY_ID.other
  const age = ageLabel(pet)
  const overall = overallRating(pet.stats, PET_STATS, PET_RANKS)
  return (
    <Link to={`/pets/${pet.id}`} className="card flex items-center gap-3 p-3 transition active:bg-surface-2">
      <Avatar person={pet} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-ink">{pet.name}</span>
          <span className="shrink-0 text-base leading-none">{sp.icon}</span>
          {pet.is_deceased && <span className="text-xs text-muted">†</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          <span>{[sp.label, pet.breed].filter(Boolean).join(' · ')}</span>
          {age && <span>{age}</span>}
          {showOwner && pet.owner_person_id && <span>主人 {nameOf(pet.owner_person_id)}</span>}
        </div>
        {overall && (
          <div className="mt-1.5">
            <span className="term term-exact">
              {overall.rank} 級 · {overall.title}
            </span>
          </div>
        )}
      </div>
      <span className="text-muted">›</span>
    </Link>
  )
}
