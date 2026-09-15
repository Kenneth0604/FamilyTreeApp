import { initial } from '../lib/format.js'

const SIZE = {
  sm: 'h-9 w-9 text-sm',
  md: 'h-12 w-12 text-base',
  lg: 'h-16 w-16 text-xl',
  xl: 'h-24 w-24 text-3xl',
}

/** 大頭照:有 avatar_url 顯示圖片,否則以性別色 + 姓名末字當佔位 */
export default function Avatar({ person, size = 'md', className = '', ring = false }) {
  const g = person?.gender
  const tone = g === 'male' ? 'bg-male-soft text-male' : g === 'female' ? 'bg-female-soft text-female' : 'bg-surface-2 text-muted'
  const deceased = person?.is_deceased ? 'grayscale' : ''
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-full ${SIZE[size]} ${tone} ${deceased} ${ring ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : ''} ${className} flex items-center justify-center font-bold`}
    >
      {person?.avatar_url ? <img src={person.avatar_url} alt="" className="h-full w-full object-cover" loading="lazy" draggable={false} /> : <span>{initial(person?.name)}</span>}
    </div>
  )
}
