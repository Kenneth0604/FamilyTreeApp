import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Controls, Handle, Position, useReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useStore } from '../lib/store.jsx'
import { layoutTree, NODE_W, NODE_H } from '../lib/treeLayout.js'
import Avatar from '../components/Avatar.jsx'
import TermBadge from '../components/TermBadge.jsx'
import VesselEdge from '../components/VesselEdge.jsx'
import { ageLabel, birthOrderLabel, POWER_DEFAULT, STATS, VIEW_MODES, viewPresentation, scaleFromLevel, householdColor } from '../lib/format.js'

const LONG_PRESS_MS = 350
const MOVE_TOLERANCE = 8 // 長按前手指移動超過這個距離就當作是在平移畫布

/**
 * 樹狀圖節點:大頭照 / 姓名(小名)/ 相對於 viewpoint 的稱謂
 * 長按卡片後可拖曳移動;直接滑動則是平移畫布(不攔截)。React Flow 內建拖曳一按就動、會吃掉平移,所以自己處理。
 */
const PersonNode = memo(function PersonNode({ id, data }) {
  const { person, term, isViewpoint, isSelf, scale, badge, badgeStrong, tint, onDragStart, onDrag, onDragEnd } = data
  const { getZoom } = useReactFlow()
  const ref = useRef(null)
  const st = useRef(null) // { pointerId, x, y, timer, armed, moved }

  const cancel = () => {
    if (st.current) clearTimeout(st.current.timer)
    st.current = null
  }

  // 觸控:長按啟動後,touchmove 不能冒泡到畫布(d3-zoom 掛在畫布上,否則卡片和畫布會一起動)。React 的 touch 事件是 passive 且掛在 root,所以用原生監聽
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const block = (e) => {
      if (st.current?.armed) {
        e.stopPropagation()
        e.preventDefault()
      }
    }
    el.addEventListener('touchmove', block, { passive: false })
    return () => el.removeEventListener('touchmove', block)
  }, [])

  const onPointerDown = (e) => {
    if (!e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return
    cancel()
    const el = e.currentTarget
    const s = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, armed: false, moved: false }
    s.timer = setTimeout(() => {
      s.armed = true
      try {
        el.setPointerCapture(s.pointerId)
      } catch {
        /* ignore */
      }
      navigator.vibrate?.(20)
      // 滑鼠:d3-zoom 的平移手勢掛在 window 的 mousemove / mouseup 上,送一個 mouseup 結束它
      if (e.pointerType === 'mouse') window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, clientX: e.clientX, clientY: e.clientY, view: window }))
      onDragStart(id)
    }, LONG_PRESS_MS)
    st.current = s
  }
  const onPointerMove = (e) => {
    const s = st.current
    if (!s || e.pointerId !== s.pointerId) return
    if (!s.armed) {
      if (Math.hypot(e.clientX - s.x, e.clientY - s.y) > MOVE_TOLERANCE) cancel()
      return
    }
    const z = getZoom() || 1
    onDrag(id, (e.clientX - s.x) / z, (e.clientY - s.y) / z)
    s.x = e.clientX
    s.y = e.clientY
    s.moved = true
  }
  const onPointerEnd = (e) => {
    const s = st.current
    if (!s || e.pointerId !== s.pointerId) return
    const armed = s.armed
    cancel()
    if (armed) onDragEnd(id)
  }

  return (
    <div
      ref={ref}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onContextMenu={(e) => e.preventDefault()} // 手機長按會跳出圖片 / 文字的系統選單,蓋住整個畫面
      className={`card relative flex select-none flex-col items-center gap-1.5 px-2 py-3 text-center transition-[transform,filter] ${isViewpoint ? 'ring-2 ring-primary' : ''} ${person.is_deceased ? 'opacity-80' : ''}`}
      style={{ width: NODE_W, height: NODE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
    >
      {tint && <span className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-2xl" style={{ background: tint }} />}
      {badge && <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-px text-[10px] font-bold ${badgeStrong ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted'}`}>{badge}</span>}
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />
      <Avatar person={person} size="lg" />
      <div className="line-clamp-2 w-full break-words text-center text-sm font-semibold leading-tight text-ink">
        {person.name}
        {person.is_deceased && <span className="ml-0.5 text-xs text-muted">†</span>}
      </div>
      {person.nicknames?.length > 0 && <div className="-mt-1 w-full truncate text-[11px] text-muted">{person.nicknames.join('、')}</div>}
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        {isSelf && <span className="term term-self">我</span>}
        {term ? <TermBadge result={term} className="max-w-full truncate" /> : <span className="term term-none">未連結</span>}
      </div>
      <div className="text-[11px] text-muted">{[ageLabel(person), birthOrderLabel(person.birth_order)].filter(Boolean).join(' · ')}</div>
    </div>
  )
})

/**
 * 世代連接點:同一對父母(或單親)的血管在這裡匯流,再分岔給各個孩子。
 * 畫成血管色的小圓球,蓋住細管接縫;兩個 handle 都放正中央,進出的線才會接在同一點
 */
const JUNCTION_SIZE = 8
const centerHandle = { top: '50%', bottom: 'auto', left: '50%', transform: 'translate(-50%, -50%)', width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0 }
const JunctionNode = memo(function JunctionNode() {
  return (
    <div className="rounded-full" style={{ width: JUNCTION_SIZE, height: JUNCTION_SIZE, background: 'var(--t-vessel)' }}>
      <Handle type="target" position={Position.Top} id="top" style={centerHandle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={centerHandle} />
    </div>
  )
})

/** 小家庭:把成員卡片的外框用虛線圈起來,放在所有卡片後面、不吃任何點擊 */
const HouseholdNode = memo(function HouseholdNode({ data }) {
  return (
    <div className="relative h-full w-full rounded-3xl" style={{ border: `2px dashed ${data.color}`, background: `${data.color}14` }}>
      <span className="absolute left-3 top-1.5 text-[11px] font-semibold" style={{ color: data.color }}>
        ⌂ {data.name}
      </span>
    </div>
  )
})

const nodeTypes = { person: PersonNode, junction: JunctionNode, household: HouseholdNode }
const edgeTypes = { vessel: VesselEdge }
const HOUSEHOLD_PAD = 14

/** 樹狀圖顯示方式(存在這台裝置) */
const viewKey = (fid) => `familytree:view:${fid}`
function readView(fid) {
  try {
    const v = JSON.parse(localStorage.getItem(viewKey(fid)) || 'null')
    return v && VIEW_MODES.some((m) => m.id === v.mode) ? { mode: v.mode, stats: Array.isArray(v.stats) ? v.stats : [] } : { mode: 'default', stats: [] }
  } catch {
    return { mode: 'default', stats: [] }
  }
}

/** 配偶 / 伴侶連線上的文字;樣式(顏色、是否乾枯)由 VesselEdge 依 status 決定 */
const SPOUSE_LABEL = { partner: '伴侶', divorced: '離婚', ex_partner: '前伴侶' }

/** 手動搬過的卡片位置,存在這台裝置(每個家族一份) */
const layoutKey = (fid) => `familytree:layout:${fid}`
function readOverrides(fid) {
  try {
    const v = localStorage.getItem(layoutKey(fid))
    return new Map(Object.entries(v ? JSON.parse(v) : {}))
  } catch {
    return new Map()
  }
}
function writeOverrides(fid, map) {
  try {
    if (map.size === 0) localStorage.removeItem(layoutKey(fid))
    else localStorage.setItem(layoutKey(fid), JSON.stringify(Object.fromEntries(map)))
  } catch {
    /* ignore */
  }
}

export default function Tree() {
  return (
    <ReactFlowProvider>
      <TreeCanvas />
    </ReactFlowProvider>
  )
}

function TreeCanvas() {
  const { familyId, people, graph, terms, viewpointId, selfId, parentChild, spouses, peopleById, canEdit, households = [] } = useStore()
  const navigate = useNavigate()
  const { fitView, setCenter } = useReactFlow()

  const layout = useMemo(() => layoutTree(graph, terms, viewpointId), [graph, terms, viewpointId])

  // ---- 手動排版 ----
  const [overrides, setOverrides] = useState(() => readOverrides(familyId))
  useEffect(() => setOverrides(readOverrides(familyId)), [familyId])
  useEffect(() => writeOverrides(familyId, overrides), [familyId, overrides])
  const [draggingId, setDraggingId] = useState(null)
  const suppressClickUntil = useRef(0)

  // ---- 顯示方式 ----
  const [view, setView] = useState(() => readView(familyId))
  const [viewOpen, setViewOpen] = useState(false)
  useEffect(() => setView(readView(familyId)), [familyId])
  useEffect(() => {
    try {
      localStorage.setItem(viewKey(familyId), JSON.stringify(view))
    } catch {
      /* ignore */
    }
  }, [familyId, view])

  const positions = useMemo(() => {
    const out = new Map(layout.positions)
    for (const [id, p] of overrides) if (out.has(id)) out.set(id, p)
    return out
  }, [layout, overrides])
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  const onDragStart = useCallback((id) => setDraggingId(id), [])
  // pointermove 是連續事件,React 可能把好幾次更新排在同一次 render 前,所以要從 prev 累加而不是從畫面上的位置算
  const onDrag = useCallback((id, dx, dy) => {
    setOverrides((prev) => {
      const cur = prev.get(id) || positionsRef.current.get(id)
      if (!cur) return prev
      return new Map(prev).set(id, { x: cur.x + dx, y: cur.y + dy })
    })
  }, [])
  const onDragEnd = useCallback(() => {
    setDraggingId(null)
    suppressClickUntil.current = Date.now() + 400 // 放開時瀏覽器還會補一個 click,不要當成開詳細頁
  }, [])
  const resetLayout = () => setOverrides(new Map())

  // ---- 連接點:同一對父母(或單親)先匯合成一個點,再從那個點分岔給各個孩子 ----
  const junctions = useMemo(() => {
    const childParents = new Map()
    for (const r of parentChild) {
      if (!positions.has(r.parent_id) || !positions.has(r.child_id)) continue
      if (!childParents.has(r.child_id)) childParents.set(r.child_id, new Set())
      childParents.get(r.child_id).add(r.parent_id)
    }
    const groups = new Map()
    for (const [childId, parentSet] of childParents) {
      const key = [...parentSet].sort().join('|')
      if (!groups.has(key)) groups.set(key, { parentIds: [...parentSet], childIds: [] })
      groups.get(key).childIds.push(childId)
    }
    const out = new Map()
    for (const [key, g] of groups) {
      const parentPos = g.parentIds.map((id) => positions.get(id))
      const childPos = g.childIds.map((id) => positions.get(id))
      const px = parentPos.reduce((s, p) => s + p.x, 0) / parentPos.length + NODE_W / 2
      const parentBottom = Math.max(...parentPos.map((p) => p.y)) + NODE_H
      const childTop = Math.min(...childPos.map((p) => p.y))
      // 孩子被搬到父母上方時,連接點仍放在父母下方一點,線才不會反折
      const y = childTop > parentBottom ? parentBottom + (childTop - parentBottom) / 2 : parentBottom + 24
      out.set(key, { id: `junction-${key}`, x: px, y, parentIds: g.parentIds, childIds: g.childIds })
    }
    return out
  }, [parentChild, positions])

  // 每張卡片的實際尺寸與位置:依顯示方式縮放,並置中在原本的排版格子裡
  const cards = useMemo(
    () =>
      people
        .filter((p) => positions.has(p.id))
        .map((p) => {
          const pres = view.mode === 'default' ? null : viewPresentation(p, view)
          const s = pres ? scaleFromLevel(pres.level) : 1
          const power = Number.isFinite(p.power) ? p.power : POWER_DEFAULT
          const slot = positions.get(p.id)
          const w = NODE_W * s
          const h = NODE_H * s
          return {
            p,
            s,
            x: slot.x + (NODE_W - w) / 2,
            y: slot.y + (NODE_H - h) / 2,
            w,
            h,
            badge: pres ? pres.badge : power !== POWER_DEFAULT ? `${power >= 10 ? '👑' : '⚔'} ${power}` : '',
            badgeStrong: pres ? (pres.level ?? 0) >= 0.7 : power >= 7,
            tint: pres?.tint ?? null,
          }
        }),
    [people, positions, view],
  )

  const householdNodes = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.p.id, c]))
    return households
      .map((hh) => {
        const boxes = (hh.person_ids || []).map((id) => byId.get(id)).filter(Boolean)
        if (!boxes.length) return null
        const minX = Math.min(...boxes.map((b) => b.x)) - HOUSEHOLD_PAD
        const minY = Math.min(...boxes.map((b) => b.y)) - HOUSEHOLD_PAD - 16 // 上方多留名稱的空間
        const maxX = Math.max(...boxes.map((b) => b.x + b.w)) + HOUSEHOLD_PAD
        const maxY = Math.max(...boxes.map((b) => b.y + b.h)) + HOUSEHOLD_PAD
        return {
          id: `household-${hh.id}`,
          type: 'household',
          position: { x: minX, y: minY },
          style: { width: maxX - minX, height: maxY - minY },
          zIndex: -1,
          data: { name: hh.name, color: householdColor(hh.color) },
          draggable: false,
          selectable: false,
          focusable: false,
        }
      })
      .filter(Boolean)
  }, [households, cards])

  const nodes = useMemo(
    () => [
      ...householdNodes,
      ...cards.map((c) => ({
        id: c.p.id,
        type: 'person',
        position: { x: c.x, y: c.y },
        style: { width: c.w, height: c.h },
        className: draggingId === c.p.id ? 'person-dragging' : undefined,
        data: { person: c.p, term: terms.get(c.p.id) ?? null, isViewpoint: c.p.id === viewpointId, isSelf: c.p.id === selfId, scale: c.s, badge: c.badge, badgeStrong: c.badgeStrong, tint: c.tint, onDragStart, onDrag, onDragEnd },
        draggable: false,
        selectable: false,
      })),
      ...[...junctions.values()].map((j) => ({
        id: j.id,
        type: 'junction',
        position: { x: j.x - JUNCTION_SIZE / 2, y: j.y - JUNCTION_SIZE / 2 },
        data: {},
        draggable: false,
        selectable: false,
      })),
    ],
    [cards, householdNodes, terms, viewpointId, selfId, junctions, draggingId, onDragStart, onDrag, onDragEnd],
  )

  const edges = useMemo(() => {
    const out = []
    for (const j of junctions.values()) {
      for (const pid of j.parentIds) out.push({ id: `pc-in-${j.id}-${pid}`, source: pid, target: j.id, sourceHandle: 'bottom', targetHandle: 'top', type: 'vessel', data: { kind: 'parent' } })
      for (const cid of j.childIds) out.push({ id: `pc-out-${j.id}-${cid}`, source: j.id, target: cid, sourceHandle: 'bottom', targetHandle: 'top', type: 'vessel', data: { kind: 'child' } })
    }
    for (const s of spouses) {
      if (!peopleById.has(s.person_a_id) || !peopleById.has(s.person_b_id)) continue
      const pa = positions.get(s.person_a_id)
      const pb = positions.get(s.person_b_id)
      if (!pa || !pb) continue
      const [left, right] = pa.x <= pb.x ? [s.person_a_id, s.person_b_id] : [s.person_b_id, s.person_a_id]
      const sameRow = Math.abs(pa.y - pb.y) < NODE_H / 2
      out.push({
        id: `sp-${s.id}`,
        source: left,
        target: right,
        sourceHandle: sameRow ? 'right' : 'bottom',
        targetHandle: sameRow ? 'left' : 'top',
        type: 'vessel',
        data: { kind: 'spouse', status: s.status || 'married', route: sameRow ? 'straight' : 'step', label: SPOUSE_LABEL[s.status] },
      })
    }
    return out
  }, [junctions, spouses, peopleById, positions])

  const onNodeClick = useCallback(
    (_e, node) => {
      if (node.type !== 'person' || Date.now() < suppressClickUntil.current) return
      navigate(`/people/${node.id}`)
    },
    [navigate],
  )

  const toggleViewStat = (id) => setView((v) => ({ ...v, stats: v.stats.includes(id) ? v.stats.filter((x) => x !== id) : [...v.stats, id] }))
  const currentMode = VIEW_MODES.find((m) => m.id === view.mode) || VIEW_MODES[0]

  // 以 viewpoint 為中心
  const focusViewpoint = useCallback(() => {
    const pos = viewpointId && positions.get(viewpointId)
    if (pos) setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom: 0.9, duration: 400 })
    else fitView({ padding: 0.2, duration: 400 })
  }, [viewpointId, positions, setCenter, fitView])

  const first = useRef(true)
  useEffect(() => {
    if (!nodes.length) return
    const t = setTimeout(() => {
      if (first.current) {
        first.current = false
        focusViewpoint()
      }
    }, 50)
    return () => clearTimeout(t)
  }, [nodes.length, focusViewpoint])

  if (people.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-4xl">🌱</p>
        <p className="mt-2 font-semibold text-ink">家族樹還是空的</p>
        {canEdit ? (
          <>
            <p className="mt-1 text-sm text-muted">先新增第一位成員(通常是你自己),再從這個人一層層往外加。</p>
            <Link to="/people/new" className="btn-primary mt-4">
              新增第一位成員
            </Link>
          </>
        ) : (
          <p className="mt-1 text-sm text-muted">這個家族還沒有任何成員。</p>
        )}
      </div>
    )
  }

  return (
    <div className="tree-canvas absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        zoomOnPinch
        minZoom={0.15}
        maxZoom={2}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} />
        <Controls showInteractive={false} position="bottom-right" />
      </ReactFlow>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
        <div className="pointer-events-auto flex flex-wrap gap-1.5">
          <button onClick={focusViewpoint} className="chip text-xs shadow-sm">
            ◎ 回到視角
          </button>
          <button onClick={() => fitView({ padding: 0.2, duration: 400 })} className="chip text-xs shadow-sm">
            ⤢ 顯示全部
          </button>
          {overrides.size > 0 && (
            <button onClick={resetLayout} className="chip text-xs shadow-sm">
              ↺ 重新排版
            </button>
          )}
          <button onClick={() => setViewOpen((o) => !o)} className={`chip text-xs shadow-sm ${view.mode !== 'default' ? 'chip-active' : ''}`}>
            👁 {view.mode === 'default' ? '顯示方式' : currentMode.label}
          </button>
          <Link to="/households" className="chip text-xs shadow-sm">
            ⌂ 小家庭{households.length ? ` ${households.length}` : ''}
          </Link>
        </div>
        {!viewpointId && (
          <Link to="/settings" className="pointer-events-auto rounded-xl bg-info-soft px-3 py-1.5 text-xs text-info shadow-sm">
            尚未設定視角 ›
          </Link>
        )}
      </div>

      {viewOpen && (
        <div className="absolute inset-x-3 top-14 z-10 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-line">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-semibold text-ink">顯示方式</p>
            <button onClick={() => setViewOpen(false)} className="text-xs text-muted">
              關閉
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {VIEW_MODES.map((m) => (
              <button key={m.id} onClick={() => setView((v) => ({ ...v, mode: m.id }))} className={`chip text-xs ${view.mode === m.id ? 'chip-active' : ''}`}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{currentMode.hint}</p>
          {view.mode === 'custom' && (
            <div className="mt-2">
              <p className="mb-1.5 text-xs text-muted">挑要看的屬性(可多選),卡片大小依這幾項的平均分數決定;負面屬性會反過來算。{view.stats.length === 0 && ' 還沒選任何屬性,大家一樣大。'}</p>
              <div className="flex max-h-40 flex-wrap gap-1.5 overflow-y-auto">
                {STATS.map((s) => (
                  <button key={s.id} onClick={() => toggleViewStat(s.id)} className={`chip px-2.5 py-1 text-xs ${view.stats.includes(s.id) ? 'chip-active' : ''}`}>
                    {s.icon} {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start gap-1.5 p-3">
        {draggingId ? (
          <p className="pointer-events-auto inline-block rounded-xl bg-accent-soft px-3 py-1.5 text-xs text-accent shadow-sm">拖曳中 · 放開即完成</p>
        ) : (
          overrides.size === 0 && <p className="inline-block rounded-xl bg-surface-2/80 px-3 py-1.5 text-[11px] text-muted shadow-sm">長按卡片可拖曳調整位置</p>
        )}
        {layout.unlinked.length > 0 && viewpointId && (
          <p className="pointer-events-auto inline-block rounded-xl bg-surface-2 px-3 py-1.5 text-xs text-muted shadow-sm">
            有 {layout.unlinked.length} 位成員尚未與視角相連(排在最下方),請補上關係。
          </p>
        )}
      </div>
    </div>
  )
}
