import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Controls, Handle, Position, BaseEdge, useReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useStore } from '../lib/store.jsx'
import { layoutTree, NODE_W, NODE_H } from '../lib/treeLayout.js'
import Avatar from '../components/Avatar.jsx'
import TermBadge from '../components/TermBadge.jsx'
import { ageLabel, powerScale, POWER_DEFAULT } from '../lib/format.js'

const LONG_PRESS_MS = 350
const MOVE_TOLERANCE = 8 // 長按前手指移動超過這個距離就當作是在平移畫布

/**
 * 樹狀圖節點:大頭照 / 姓名(小名)/ 相對於 viewpoint 的稱謂
 * 長按卡片後可拖曳移動;直接滑動則是平移畫布(不攔截)。React Flow 內建拖曳一按就動、會吃掉平移,所以自己處理。
 */
const PersonNode = memo(function PersonNode({ id, data }) {
  const { person, term, isViewpoint, isSelf, scale, onDragStart, onDrag, onDragEnd } = data
  const power = Number.isFinite(person.power) ? person.power : POWER_DEFAULT
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
      className={`card relative flex flex-col items-center gap-1.5 px-2 py-3 text-center transition-[transform,box-shadow] ${isViewpoint ? 'ring-2 ring-primary' : ''} ${person.is_deceased ? 'opacity-80' : ''}`}
      style={{ width: NODE_W, height: NODE_H, transform: `scale(${scale})`, transformOrigin: 'top left' }}
    >
      {power !== POWER_DEFAULT && (
        <span className={`absolute right-1.5 top-1.5 rounded-full px-1.5 py-px text-[10px] font-bold ${power >= 7 ? 'bg-primary text-primary-fg' : 'bg-surface-2 text-muted'}`} title="戰力(家庭地位)">
          {power >= 10 ? '👑' : '⚔'} {power}
        </span>
      )}
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
      <div className="text-[11px] text-muted">{ageLabel(person)}</div>
    </div>
  )
})

/** 世代連接點:同一對父母(或單親)匯合成一個點,再往下分岔給各個孩子。兩個 handle 都放正中央,進出的線才會接在同一點 */
const JUNCTION_SIZE = 8
const centerHandle = { top: '50%', bottom: 'auto', left: '50%', transform: 'translate(-50%, -50%)', width: 1, height: 1, minWidth: 0, minHeight: 0, opacity: 0 }
const JunctionNode = memo(function JunctionNode() {
  return (
    <div className="rounded-full bg-line" style={{ width: JUNCTION_SIZE, height: JUNCTION_SIZE }}>
      <Handle type="target" position={Position.Top} id="top" style={centerHandle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={centerHandle} />
    </div>
  )
})

const nodeTypes = { person: PersonNode, junction: JunctionNode }

/**
 * 直角「匝道」連線:只有一個轉折,不用 smoothstep 那種在中途多繞一段的彎。
 * bend = 'target':先垂直到目標高度再水平(父母 → 連接點,形成連接點高度的一條橫桿)
 * bend = 'source':先水平再垂直(連接點 → 孩子,沿橫桿到孩子正上方再直直下去)
 */
function BusEdge({ sourceX, sourceY, targetX, targetY, data, style, markerEnd }) {
  const d = data?.bend === 'source' ? `M ${sourceX} ${sourceY} H ${targetX} V ${targetY}` : `M ${sourceX} ${sourceY} V ${targetY} H ${targetX}`
  return <BaseEdge path={d} style={style} markerEnd={markerEnd} />
}
const edgeTypes = { bus: BusEdge }

/** 配偶 / 伴侶連線:婚姻是主色虛線;未婚伴侶、已結束的關係各用不同線型並標上文字 */
const SPOUSE_EDGE = {
  married: { className: 'spouse-edge' },
  widowed: { className: 'spouse-edge' },
  partner: { className: 'partner-edge', label: '伴侶' },
  divorced: { className: 'divorced-edge', label: '離婚' },
  ex_partner: { className: 'ex-partner-edge', label: '前伴侶' },
}

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
  const { familyId, people, graph, terms, viewpointId, selfId, parentChild, spouses, peopleById, canEdit } = useStore()
  const navigate = useNavigate()
  const { fitView, setCenter } = useReactFlow()

  const layout = useMemo(() => layoutTree(graph, terms, viewpointId), [graph, terms, viewpointId])

  // ---- 手動排版 ----
  const [overrides, setOverrides] = useState(() => readOverrides(familyId))
  useEffect(() => setOverrides(readOverrides(familyId)), [familyId])
  useEffect(() => writeOverrides(familyId, overrides), [familyId, overrides])
  const [draggingId, setDraggingId] = useState(null)
  const suppressClickUntil = useRef(0)

  const positions = useMemo(() => {
    const out = new Map(layout.positions)
    for (const [id, p] of overrides) if (out.has(id)) out.set(id, p)
    return out
  }, [layout, overrides])
  const positionsRef = useRef(positions)
  positionsRef.current = positions

  const onDragStart = useCallback((id) => setDraggingId(id), [])
  const onDrag = useCallback((id, dx, dy) => {
    const cur = positionsRef.current.get(id)
    if (!cur) return
    setOverrides((prev) => new Map(prev).set(id, { x: cur.x + dx, y: cur.y + dy }))
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

  const nodes = useMemo(
    () => [
      ...people
        .filter((p) => positions.has(p.id))
        .map((p) => {
          // 戰力越高卡片越大:實際節點尺寸跟著縮放,並置中在原本的排版格子裡
          const s = powerScale(p.power)
          const slot = positions.get(p.id)
          return {
            id: p.id,
            type: 'person',
            position: { x: slot.x + (NODE_W - NODE_W * s) / 2, y: slot.y + (NODE_H - NODE_H * s) / 2 },
            style: { width: NODE_W * s, height: NODE_H * s },
            className: draggingId === p.id ? 'person-dragging' : undefined,
            data: { person: p, term: terms.get(p.id) ?? null, isViewpoint: p.id === viewpointId, isSelf: p.id === selfId, scale: s, onDragStart, onDrag, onDragEnd },
            draggable: false,
            selectable: false,
          }
        }),
      ...[...junctions.values()].map((j) => ({
        id: j.id,
        type: 'junction',
        position: { x: j.x - JUNCTION_SIZE / 2, y: j.y - JUNCTION_SIZE / 2 },
        data: {},
        draggable: false,
        selectable: false,
      })),
    ],
    [people, positions, terms, viewpointId, selfId, junctions, draggingId, onDragStart, onDrag, onDragEnd],
  )

  const edges = useMemo(() => {
    const out = []
    for (const j of junctions.values()) {
      for (const pid of j.parentIds) out.push({ id: `pc-in-${j.id}-${pid}`, source: pid, target: j.id, sourceHandle: 'bottom', targetHandle: 'top', type: 'bus', data: { bend: 'target' } })
      for (const cid of j.childIds) out.push({ id: `pc-out-${j.id}-${cid}`, source: j.id, target: cid, sourceHandle: 'bottom', targetHandle: 'top', type: 'bus', data: { bend: 'source' } })
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
        type: sameRow ? 'straight' : 'step',
        ...(SPOUSE_EDGE[s.status] || SPOUSE_EDGE.married),
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
        </div>
        {!viewpointId && (
          <Link to="/settings" className="pointer-events-auto rounded-xl bg-info-soft px-3 py-1.5 text-xs text-info shadow-sm">
            尚未設定視角 ›
          </Link>
        )}
      </div>

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
