import { Link } from 'react-router-dom'
import Avatar from './Avatar.jsx'
import TermBadge from './TermBadge.jsx'
import { ageLabel, birthLabel } from '../lib/format.js'

export default function PersonCard({ person, term, isViewpoint, isSelf }) {
  const age = ageLabel(person)
  const birth = birthLabel(person)
  return (
    <Link to={`/people/${person.id}`} className={`card flex items-center gap-3 p-3 transition active:bg-surface-2 ${isViewpoint ? 'ring-2 ring-primary' : ''}`}>
      <Avatar person={person} size="lg" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate font-semibold text-ink">{person.name}</span>
          {isSelf && <span className="term term-self">我</span>}
          {person.is_deceased && <span className="text-xs text-muted">†</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted">
          {age && <span>{age}</span>}
          {birth && <span>{birth}</span>}
          {!age && !birth && <span className="text-muted/70">未填生日</span>}
        </div>
        <div className="mt-1.5">
          <TermBadge result={term} />
        </div>
      </div>
      <span className="text-muted">›</span>
    </Link>
  )
}
