import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useStore } from '../lib/store.jsx'
import Avatar from '../components/Avatar.jsx'
import { buildTimeline, groupByDecade, shortDate } from '../lib/timeline.js'

// 家族時間軸:整個家族的出生、辭世、生平紀事、寵物,依年代排成一條線。
// 卡片捲進畫面時從下方浮上來;中間的線隨捲動「點亮」;右側年代刻度可以按住拖曳快速跳轉(像「照片」的年份捲軸)。
const FILTERS = [
  { id: 'all', label: '全部' },
  { id: 'birth', label: '出生' },
  { id: 'entry', label: '紀事' },
  { id: 'death', label: '辭世' },
  { id: 'pet', label: '寵物' },
]

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function Timeline() {
  const { people, entries, pets, peopleById } = useStore()
  const [filter, setFilter] = useState('all')
  const all = useMemo(() => buildTimeline(people, entries, pets), [people, entries, pets])
  const items = useMemo(() => (filter === 'all' ? all : all.filter((x) => x.kind === filter)), [all, filter])
  const groups = useMemo(() => groupByDecade(items), [items])
  const listRef = useRef(null)
  const petsById = useMemo(() => new Map(pets.map((p) => [p.id, p])), [pets])

  // 捲進畫面才浮現(只做一次);減少動態效果時直接顯示
  useEffect(() => {
    const root = listRef.current
    if (!root) return
    const cards = root.querySelectorAll('[data-reveal]')
    if (reducedMotion() || !('IntersectionObserver' in window)) {
      cards.forEach((c) => c.setAttribute('data-in', ''))
      return
    }
    const io = new IntersectionObserver((list) => {
      for (const e of list) if (e.isIntersecting) { e.target.setAttribute('data-in', ''); io.unobserve(e.target) }
    }, { rootMargin: '0px 0px -8% 0px' })
    cards.forEach((c) => { if (!c.hasAttribute('data-in')) io.observe(c) })
    return () => io.disconnect()
  }, [groups])

  // 中線點亮進度:跟著 main 的捲動
  const fillRef = useRef(null)
  useEffect(() => {
    const scroller = listRef.current?.closest('main')
    const list = listRef.current
    if (!scroller || !list) return
    let raf = 0
    const update = () => {
      raf = 0
      const r = list.getBoundingClientRect()
      const sr = scroller.getBoundingClientRect()
      const seen = Math.min(r.height, Math.max(0, sr.top + sr.height * 0.6 - r.top))
      if (fillRef.current) fillRef.current.style.transform = `scaleY(${r.height ? seen / r.height : 0})`
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    update()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { scroller.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); cancelAnimationFrame(raf) }
  }, [groups])

  const span = all.length ? `${all[0].y} – ${new Date().getFullYear()}` : ''
  const years = all.length ? new Date().getFullYear() - all[0].y : 0

  return (
    <div className="timeline-page">
      <header className="mb-4 px-1">
        <h1 className="text-[28px] font-bold leading-tight tracking-tight text-ink" style={{ letterSpacing: '-0.02em' }}>家族時間軸</h1>
        <p className="mt-0.5 text-[15px] text-muted">
          {all.length ? `${span} · 橫跨 ${years} 年 · ${all.length} 個時刻` : '還沒有可以排上時間軸的日期'}
        </p>
      </header>

      <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4">
        {FILTERS.map((f) => {
          const n = f.id === 'all' ? all.length : all.filter((x) => x.kind === f.id).length
          return (
            <button key={f.id} type="button" onClick={() => setFilter(f.id)} className={`chip shrink-0 ${filter === f.id ? 'chip-active' : ''}`}>
              {f.label}
              <span className="ml-1 text-xs opacity-70 tabular-nums">{n}</span>
            </button>
          )
        })}
      </div>

      {items.length === 0 ? (
        <div className="empty">
          <p className="text-4xl">🕰️</p>
          <p className="mt-2">在成員資料填上生日、辭世日期,或在「生平紀事」填開始時間,這裡就會出現家族的故事線。</p>
        </div>
      ) : (
        <div className="relative pr-7" ref={listRef}>
          <div className="tl-spine" aria-hidden="true"><div ref={fillRef} className="tl-spine-fill" /></div>
          {groups.map((g) => (
            <section key={g.decade} id={`decade-${g.decade}`} className="relative">
              <h2 className="tl-decade">
                <span className="tl-decade-pill">{g.decade} 年代</span>
                <span className="text-xs font-medium text-muted">{g.items.length} 件</span>
              </h2>
              <ol className="space-y-2.5 pb-4">
                {g.items.map((it, i) => (
                  <li key={it.id} data-reveal className="tl-item" data-kind={it.kind} style={{ '--i': i % 6 }}>
                    <span className="tl-dot" aria-hidden="true">{it.icon}</span>
                    <EventCard it={it} person={it.personId && peopleById.get(it.personId)} pet={it.petId && petsById.get(it.petId)} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
          <div className="tl-item tl-today" data-in="">
            <span className="tl-dot tl-dot-today" aria-hidden="true" />
            <p className="py-2 text-sm font-semibold text-primary">今天 · {new Date().getFullYear()}</p>
          </div>
          <DecadeScrubber decades={groups.map((g) => g.decade)} />
        </div>
      )}
    </div>
  )
}

function EventCard({ it, person, pet }) {
  const to = it.personId ? `/people/${it.personId}` : it.petId ? `/pets/${it.petId}` : null
  const body = (
    <>
      {person ? <Avatar person={person} size="sm" /> : pet ? <Avatar person={{ ...pet, gender: 'unspecified' }} size="sm" /> : null}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-semibold text-ink">{it.title}</p>
        {it.sub && <p className="truncate text-xs text-muted">{it.sub}</p>}
      </div>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted">{shortDate(it)}</span>
    </>
  )
  return to ? <Link to={to} className="tl-card card">{body}</Link> : <div className="tl-card card">{body}</div>
}

// 右側年代刻度:點或按住拖曳,跳到該年代;拖到新年代時輕震一下並顯示大字泡泡
function DecadeScrubber({ decades }) {
  const ref = useRef(null)
  const [active, setActive] = useState(null)
  const lastRef = useRef(null)
  if (decades.length < 3) return null

  function jumpAt(clientY) {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const k = Math.min(decades.length - 1, Math.max(0, Math.floor(((clientY - r.top) / r.height) * decades.length)))
    const d = decades[k]
    if (d === lastRef.current) return
    lastRef.current = d
    setActive(d)
    navigator.vibrate?.(4)
    document.getElementById(`decade-${d}`)?.scrollIntoView({ block: 'start', behavior: 'instant' })
  }
  const end = () => { lastRef.current = null; setTimeout(() => setActive(null), 350) }

  return (
    <div className="tl-scrubber-wrap" aria-label="年代快速跳轉">
      <div
        ref={ref}
        className="tl-scrubber"
        data-active={active != null || undefined}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); jumpAt(e.clientY) }}
        onPointerMove={(e) => { if (e.currentTarget.hasPointerCapture(e.pointerId)) jumpAt(e.clientY) }}
        onPointerUp={end}
        onPointerCancel={end}
      >
        {decades.map((d) => (
          <span key={d} className={`tl-tick ${active === d ? 'is-active' : ''}`}>{`'${String(d).slice(2)}`}</span>
        ))}
      </div>
      {active != null && <div className="tl-bubble" key={active}>{active}s</div>}
    </div>
  )
}
