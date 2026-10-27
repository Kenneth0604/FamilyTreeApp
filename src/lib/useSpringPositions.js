import { useEffect, useRef, useState } from 'react'

// 讓一組節點座標用彈簧移到新位置(FLIP 的概念:記住舊位置,從舊位置動到新位置)。
// 參考 Apple「Designing Fluid Interfaces」:用 damping / response 描述彈簧、永遠從目前畫面上的值出發,
// 所以排版切到一半再切一次也不會跳;x / y 分開各一條彈簧。
// 新出現的節點從它父母目前的位置「長」出來;snap = true(拖曳中)或系統要求減少動態效果時直接到位。
const DAMPING = 1
const RESPONSE = 0.5

const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export function useSpringPositions(target, { snap = false, originOf } = {}) {
  const [shown, setShown] = useState(target)
  const state = useRef(new Map()) // id -> { x, y, vx, vy }
  const targetRef = useRef(target)
  const raf = useRef(0)
  const originRef = useRef(originOf)
  originRef.current = originOf

  useEffect(() => {
    targetRef.current = target
    const st = state.current
    const instant = snap || reducedMotion() || st.size === 0

    // 同步節點清單:新節點找出生點,消失的節點移除
    for (const id of [...st.keys()]) if (!target.has(id)) st.delete(id)
    for (const [id, p] of target) {
      if (st.has(id)) continue
      const from = !instant && originRef.current?.(id, st)
      st.set(id, from ? { x: from.x, y: from.y, vx: 0, vy: 0 } : { x: p.x, y: p.y, vx: 0, vy: 0 })
    }

    if (instant) {
      for (const [id, p] of target) st.set(id, { x: p.x, y: p.y, vx: 0, vy: 0 })
      cancelAnimationFrame(raf.current)
      raf.current = 0
      setShown(target)
      return
    }
    if (raf.current) return // 動畫進行中:只換目標,從目前位置和速度繼續

    let last = 0
    const omega = (2 * Math.PI) / RESPONSE
    const frame = (ts) => {
      const dt = Math.min(0.064, last ? (ts - last) / 1000 : 1 / 60)
      last = ts
      let moving = false
      const tgt = targetRef.current
      for (const [id, s] of st) {
        const t = tgt.get(id)
        if (!t) continue
        let remaining = dt
        while (remaining > 0) {
          const h = Math.min(remaining, 1 / 240)
          remaining -= h
          s.vx += (-omega * omega * (s.x - t.x) - 2 * DAMPING * omega * s.vx) * h
          s.vy += (-omega * omega * (s.y - t.y) - 2 * DAMPING * omega * s.vy) * h
          s.x += s.vx * h
          s.y += s.vy * h
        }
        if (Math.abs(s.x - t.x) < 0.3 && Math.abs(s.y - t.y) < 0.3 && Math.abs(s.vx) + Math.abs(s.vy) < 4) {
          s.x = t.x; s.y = t.y; s.vx = 0; s.vy = 0
        } else moving = true
      }
      const out = new Map()
      for (const [id] of tgt) {
        const s = st.get(id)
        out.set(id, s ? { x: s.x, y: s.y } : tgt.get(id))
      }
      setShown(moving ? out : tgt)
      raf.current = moving ? requestAnimationFrame(frame) : 0
    }
    raf.current = requestAnimationFrame(frame)
  }, [target, snap])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return shown
}
