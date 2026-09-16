import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Controls, Handle, Position, useReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useStore } from '../lib/store.jsx'
import { layoutTree, layoutRadial, NODE_W, NODE_H, GAP_Y } from '../lib/treeLayout.js'
import Avatar from '../components/Avatar.jsx'
import TermBadge from '../components/TermBadge.jsx'
import VesselEdge from '../components/VesselEdge.jsx'
import { ageLabel, birthOrderLabel, POWER_DEFAULT, totalPower, powerIcon, STATS, VIEW_MODES, viewPresentation, scaleFromLevel, householdColor } from '../lib/format.js'
import { unionOutline } from '../lib/outline.js'
import { isActiveSpouse } from '../lib/kinship/graph.js'

/**
 * 樹狀圖節點:大頭照 / 姓名(小名)/ 相對於 viewpoint 的稱謂
 * 拖曳交給 React Flow 內建機制(iOS Safari 上經過實戰):只有「編輯排版」模式下被選取的那張卡片 draggable,
 * 其他卡片與背景照常平移畫布。
 */
const PersonNode = memo(function PersonNode({ data }) {
  const { person, term, isViewpoint, isSelf, scale, badge, badgeStrong, tint } = data

  return (
    <div
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
const JunctionNode = memo(function JunctionNode({ data }) {
  const size = data?.thin ? JUNCTION_SIZE * 0.7 : JUNCTION_SIZE
  return (
    <div className="rounded-full" style={{ width: size, height: size, margin: (JUNCTION_SIZE - size) / 2, background: 'var(--t-vessel)' }}>
      <Handle type="target" position={Position.Top} id="top" style={centerHandle} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={centerHandle} />
    </div>
  )
})

/**
 * 小家庭:成員卡片的外框 + 成員之間的親子 / 配偶「走廊」聯集成一個不規則形狀,虛線描邊。
 * 放在所有卡片後面、不吃任何點擊;形狀由 householdNodes 用 lib/outline.js 算好
 */
const HouseholdNode = memo(function HouseholdNode({ data }) {
  return (
    <div className="relative h-full w-full">
      <svg className="absolute inset-0 h-full w-full overflow-visible" viewBox={`${data.x} ${data.y} ${data.w} ${data.h}`} preserveAspectRatio="none">
        <path d={data.path} fill={data.color} fillOpacity={0.08} stroke={data.color} strokeWidth={2} strokeDasharray="7 5" strokeLinejoin="round" fillRule="evenodd" />
      </svg>
      <span className="absolute text-[11px] font-semibold" style={{ color: data.color, left: data.labelX, top: data.labelY }}>
        ⌂ {data.name}
      </span>
    </div>
  )
})

/**
 * 接點:配偶線兩端的小圓點,畫在卡片上方(節點層在連線之上),讓人一眼看出這條線是接到哪張卡;
 * 不相鄰的配偶(前任、被別人隔開的)線會穿過別人,沒有接點會看起來像連錯人
 */
const PORT_SIZE = 10
const PORT_COLOR = { married: 'var(--t-vessel)', widowed: 'var(--t-vessel)', partner: 'var(--t-vessel-partner)', divorced: 'var(--t-vessel-ended-line)', ex_partner: 'var(--t-vessel-ended-line)' }
const PortNode = memo(function PortNode({ data }) {
  return <div className="rounded-full ring-2 ring-surface" style={{ width: PORT_SIZE, height: PORT_SIZE, background: PORT_COLOR[data.status] || PORT_COLOR.married }} />
})

const nodeTypes = { person: PersonNode, junction: JunctionNode, household: HouseholdNode, port: PortNode }
const edgeTypes = { vessel: VesselEdge }
const HOUSEHOLD_PAD = 9 // 比夫妻卡片間距(12)的一半大一點、但小於間距,框線才不會壓到隔壁非成員的卡片
const HOUSEHOLD_LABEL_H = 18
const CORRIDOR_W = 40

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

/** 排版方式(分層 / 放射),存在這台裝置 */
const ARRANGEMENTS = [
  { id: 'layered', label: '分層', icon: '☰', hint: '依世代一層層排,配偶並排、孩子在父母下方' },
  { id: 'radial', label: '放射', icon: '☀', hint: '視角本人在圓心,依親等一圈圈往外;長輩在上半圓、後代在下半圓' },
]
const arrangeKey = (fid) => `familytree:arrange:${fid}`
function readArrangement(fid) {
  try {
    const v = localStorage.getItem(arrangeKey(fid))
    return ARRANGEMENTS.some((a) => a.id === v) ? v : 'layered'
  } catch {
    return 'layered'
  }
}

/**
 * 手動搬過的卡片位置,存在這台裝置(每個家族 × 排版方式一份)。
 * 存的是「相對於自動排版位置的位移」,所以自動排版因為新增成員 / 演算法更新而變動時,搬過的卡片會跟著自己那一家移動,
 * 不會停在舊座標上插進別人中間(v1 存絕對座標,已淘汰)。
 */
const layoutKey = (fid, arrangement) => `familytree:layout:v2:${fid}:${arrangement}`
function readOverrides(fid, arrangement) {
  const key = layoutKey(fid, arrangement)
  try {
    localStorage.removeItem(`familytree:layout:${fid}`) // 舊版絕對座標
    const v = localStorage.getItem(key)
    return { key, map: new Map(Object.entries(v ? JSON.parse(v) : {})) }
  } catch {
    return { key, map: new Map() }
  }
}
function writeOverrides({ key, map }) {
  try {
    if (map.size === 0) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(Object.fromEntries(map)))
  } catch {
    /* ignore */
  }
}

/** 從卡片中心朝 toward 方向走到卡片邊緣的點(放射排版的血管從卡片邊緣出發,而不是藏在卡片底下) */
function rectEdgePoint(box, toward) {
  const cx = box.x + box.w / 2
  const cy = box.y + box.h / 2
  const dx = toward.x - cx
  const dy = toward.y - cy
  if (!dx && !dy) return { x: cx, y: cy }
  const t = Math.min(dx ? box.w / 2 / Math.abs(dx) : Infinity, dy ? box.h / 2 / Math.abs(dy) : Infinity)
  return { x: cx + dx * t, y: cy + dy * t }
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

  // ---- 排版方式 ----
  const [arrangement, setArrangement] = useState(() => readArrangement(familyId))
  useEffect(() => setArrangement(readArrangement(familyId)), [familyId])
  useEffect(() => {
    try {
      localStorage.setItem(arrangeKey(familyId), arrangement)
    } catch {
      /* ignore */
    }
  }, [familyId, arrangement])
  const radial = arrangement === 'radial'

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
  // 每個人依顯示方式的呈現(null = 預設)與卡片縮放倍率
  const presentations = useMemo(() => new Map(people.map((p) => [p.id, view.mode === 'default' ? null : viewPresentation(p, view)])), [people, view])
  const scaleOf = useCallback(
    (id) => {
      const pres = presentations.get(id)
      return pres ? scaleFromLevel(pres.level) : 1
    },
    [presentations],
  )

  // 排版時就用放大後的卡片寬度,大卡片才不會疊到隔壁、蓋掉別人的角標
  const layout = useMemo(() => {
    const widthOf = (id) => NODE_W * scaleOf(id)
    return radial ? layoutRadial(graph, viewpointId, { widthOf }) : layoutTree(graph, terms, viewpointId, { widthOf })
  }, [radial, graph, terms, viewpointId, scaleOf])
  const layoutRef = useRef(layout)
  layoutRef.current = layout

  // ---- 手動排版 ----
  const [ov, setOv] = useState(() => readOverrides(familyId, arrangement))
  useEffect(() => setOv(readOverrides(familyId, arrangement)), [familyId, arrangement])
  useEffect(() => {
    if (ov.key === layoutKey(familyId, arrangement)) writeOverrides(ov) // 切換家族 / 排版時,舊的 map 不要寫進新 key
  }, [familyId, arrangement, ov])
  const overrides = ov.map
  const setOverrides = useCallback((updater) => setOv((prev) => ({ key: prev.key, map: typeof updater === 'function' ? updater(prev.map) : updater })), [])
  const [draggingId, setDraggingId] = useState(null)
  const [layoutMode, setLayoutMode] = useState(false)
  const [selectedId, setSelectedId] = useState(null)
  const suppressClickUntil = useRef(0)
  const toggleLayoutMode = () => {
    setLayoutMode((on) => !on)
    setSelectedId(null)
  }

  const positions = useMemo(() => {
    const out = new Map()
    for (const [id, p] of layout.positions) {
      const d = overrides.get(id)
      out.set(id, d ? { x: p.x + d.dx, y: p.y + d.dy } : p)
    }
    return out
  }, [layout, overrides])
  const resetLayout = () => setOverrides(new Map())
  // 卡片的實際矩形:x 就是排版給的位置(寬度已算進去),縮放後在列內垂直置中
  const boxes = useMemo(() => {
    const out = new Map()
    for (const [id, slot] of positions) {
      const s = scaleOf(id)
      const h = NODE_H * s
      out.set(id, { s, x: slot.x, y: slot.y + (NODE_H - h) / 2, w: NODE_W * s, h })
    }
    return out
  }, [positions, scaleOf])

  // ---- 連接點:同一對父母(或單親)先匯合成一個點,再從那個點分岔給各個孩子(放射排版直接連,不用連接點) ----
  const junctions = useMemo(() => {
    if (radial) return new Map()
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
      const parentBox = g.parentIds.map((id) => boxes.get(id))
      const childBox = g.childIds.map((id) => boxes.get(id))
      const px = parentBox.reduce((s, b) => s + b.x + b.w / 2, 0) / parentBox.length
      const parentBottom = Math.max(...parentBox.map((b) => b.y + b.h))
      const childTop = Math.min(...childBox.map((b) => b.y))
      // 連接點放在列間空隙偏上(0.45)的位置,靠近下一列頂端的那一段留給配偶繞行線;孩子被搬到父母上方時放父母下方一點,線才不會反折
      const y = childTop > parentBottom ? parentBottom + (childTop - parentBottom) * 0.45 : parentBottom + 24
      const xs = [...parentBox, ...childBox].map((b) => b.x + b.w / 2)
      out.set(key, { id: `junction-${key}`, x: px, y, parentIds: g.parentIds, childIds: g.childIds, zone: Math.round(parentBottom), gap: Math.max(0, childTop - parentBottom), minX: Math.min(...xs), maxX: Math.max(...xs), thin: false })
    }
    // 同一段列間空隙裡,橫桿(父母 → 連接點 → 孩子的水平段)會左右延伸;範圍重疊的家庭全疊在同一個高度會看不懂。
    // 依範圍做區間著色分「車道」:重疊的錯開不同高度,並把血管畫細一點
    const zones = new Map()
    for (const j of out.values()) {
      if (!zones.has(j.zone)) zones.set(j.zone, [])
      zones.get(j.zone).push(j)
    }
    for (const list of zones.values()) {
      list.sort((a, b) => a.minX - b.minX || a.maxX - b.maxX)
      const lanes = [] // 每條車道目前延伸到的最右邊
      for (const j of list) {
        j.overlaps = list.some((o) => o !== j && o.minX < j.maxX + 6 && j.minX < o.maxX + 6)
        let lane = lanes.findIndex((right) => right + 6 < j.minX)
        if (lane < 0) lane = lanes.push(-Infinity) - 1
        lanes[lane] = j.maxX
        j.lane = lane
      }
      if (lanes.length <= 1) continue
      const gap = Math.min(...list.map((j) => j.gap)) || GAP_Y
      const step = Math.max(4, Math.min(12, (gap * 0.45 - 20) / (lanes.length - 1)))
      for (const j of list) {
        j.y += (j.lane - (lanes.length - 1) / 2) * step
        j.thin = j.overlaps
      }
    }
    return out
  }, [radial, parentChild, boxes])

  // 每張卡片:實際尺寸與位置(boxes)+ 角標 / 色條
  const cards = useMemo(
    () =>
      people
        .filter((p) => boxes.has(p.id))
        .map((p) => {
          const pres = presentations.get(p.id)
          const power = totalPower(p) // 地位 + 壽命加成
          return {
            p,
            ...boxes.get(p.id),
            badge: pres ? pres.badge : power !== POWER_DEFAULT ? `${powerIcon(power)} ${power}` : '',
            badgeStrong: pres ? (pres.level ?? 0) >= 0.7 : power >= 8,
            tint: pres?.tint ?? null,
          }
        }),
    [people, boxes, presentations],
  )

  // React Flow 拖曳回報的是節點左上角;卡片縮放後在列內是垂直置中的,換算回排版格子位置再存
  const cardsRef = useRef(cards)
  cardsRef.current = cards
  const applyDragPosition = useCallback(
    (id, position) => {
      const c = cardsRef.current.find((x) => x.p.id === id)
      const auto = layoutRef.current.positions.get(id)
      if (!c || !position || !auto) return
      const slot = { x: position.x, y: position.y - (NODE_H - c.h) / 2 }
      setOverrides((prev) => new Map(prev).set(id, { dx: Math.round(slot.x - auto.x), dy: Math.round(slot.y - auto.y) }))
    },
    [setOverrides],
  )
  // 受控模式:React Flow 把位置變更丟回來,我們寫進 overrides 再由 nodes 重新算出位置
  const onNodesChange = useCallback(
    (changes) => {
      for (const ch of changes) if (ch.type === 'position' && ch.position) applyDragPosition(ch.id, ch.position)
    },
    [applyDragPosition],
  )
  const onNodeDragStart = useCallback((_e, node) => setDraggingId(node.id), [])
  const onNodeDragStop = useCallback(
    (_e, node) => {
      applyDragPosition(node.id, node.position)
      setDraggingId(null)
      suppressClickUntil.current = Date.now() + 400 // 放開時瀏覽器還會補一個 click,不要當成點擊
    },
    [applyDragPosition],
  )

  // 小家庭的不規則外框:成員卡片(加邊距)+ 成員之間親子 / 配偶關係的走廊,聯集後描邊。
  // 走廊只走卡片之間的空隙(親子走上下兩列之間、配偶走相鄰卡片之間),不會蓋到非成員的卡片
  const householdNodes = useMemo(() => {
    const byId = new Map(cards.map((c) => [c.p.id, c]))
    const isCoupled = (a, b) => (graph.spousesOf.get(a) || []).some((s) => s.id === b && isActiveSpouse(s.status))
    const isParent = (a, b) => (graph.childrenOf.get(a) || []).includes(b)
    return households
      .map((hh) => {
        const ids = (hh.person_ids || []).filter((id) => byId.has(id))
        if (!ids.length) return null
        const members = ids.map((id) => byId.get(id))
        const topY = Math.min(...members.map((b) => b.y))
        const rects = members.map((b) => {
          const topPad = b.y === topY ? HOUSEHOLD_PAD + HOUSEHOLD_LABEL_H : HOUSEHOLD_PAD // 最上排多留名稱的空間
          return { x: b.x - HOUSEHOLD_PAD, y: b.y - topPad, w: b.w + HOUSEHOLD_PAD * 2, h: b.h + topPad + HOUSEHOLD_PAD }
        })
        for (const a of members) {
          for (const b of members) {
            if (a === b) continue
            const ax = a.x + a.w / 2
            const bx = b.x + b.w / 2
            if (!radial && isParent(a.p.id, b.p.id)) {
              // 親子:a 下緣 → 中間高度 → 橫移到 b 的正上方 → b 上緣(只在 b 就在下一列時畫,搬遠了就不畫;放射排版沒有列,不畫走廊)
              const gapTop = a.y + a.h
              const gapBottom = b.y
              if (gapBottom - gapTop < 12 || gapBottom - gapTop > (NODE_H + GAP_Y) * 1.2) continue
              const midY = (gapTop + gapBottom) / 2
              rects.push({ x: ax - CORRIDOR_W / 2, y: gapTop - 1, w: CORRIDOR_W, h: midY - gapTop + CORRIDOR_W / 2 + 1 })
              rects.push({ x: Math.min(ax, bx) - CORRIDOR_W / 2, y: midY - CORRIDOR_W / 2, w: Math.abs(ax - bx) + CORRIDOR_W, h: CORRIDOR_W })
              rects.push({ x: bx - CORRIDOR_W / 2, y: midY - CORRIDOR_W / 2, w: CORRIDOR_W, h: gapBottom - midY + CORRIDOR_W / 2 + 1 })
            } else if (a.x < b.x && isCoupled(a.p.id, b.p.id) && Math.abs(a.y - b.y) < NODE_H / 2) {
              // 配偶:兩張卡片之間補一段;中間如果夾了非成員就不補
              const left = a.x + a.w
              const right = b.x
              const blocked = cards.some((c) => c !== a && c !== b && Math.abs(c.y - a.y) < NODE_H / 2 && c.x < right && c.x + c.w > left)
              if (blocked) continue
              const cy = a.y + a.h / 2
              rects.push({ x: left - 1, y: cy - CORRIDOR_W / 2, w: right - left + 2, h: CORRIDOR_W })
            }
          }
        }
        const outline = unionOutline(rects, 20)
        if (!outline) return null
        const topMember = members.find((b) => b.y === topY)
        return {
          id: `household-${hh.id}`,
          type: 'household',
          position: { x: outline.x, y: outline.y },
          style: { width: outline.w, height: outline.h },
          zIndex: -1,
          data: { name: hh.name, color: householdColor(hh.color), path: outline.path, x: outline.x, y: outline.y, w: outline.w, h: outline.h, labelX: topMember.x - HOUSEHOLD_PAD + 10 - outline.x, labelY: topMember.y - HOUSEHOLD_PAD - HOUSEHOLD_LABEL_H + 4 - outline.y },
          draggable: false,
          selectable: false,
          focusable: false,
        }
      })
      .filter(Boolean)
  }, [households, cards, graph, radial])

  // 連線與接點一起算:接點的位置由連線決定
  const { edges, ports } = useMemo(() => {
    const out = []
    const ports = [] // { id, x, y, status }
    const port = (id, x, y, status) => ports.push({ id, x, y, status })
    if (radial) {
      // 放射:父母 → 孩子直接連(兩端寬、中段細),配偶之間一小段;都從卡片邊緣出發、直線
      const boxOf = new Map(cards.map((c) => [c.p.id, c]))
      const points = (a, b) => {
        const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
        const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
        const s = rectEdgePoint(a, cb)
        const t = rectEdgePoint(b, ca)
        return { sx: s.x, sy: s.y, tx: t.x, ty: t.y }
      }
      // 配偶線(不並排時)固定從卡片頂端 / 底端的正中央出發,不走跟配偶相鄰的那一側,才不會像是接到隔壁那張卡
      const spousePoints = (a, b) => {
        const ca = { x: a.x + a.w / 2, y: a.y + a.h / 2 }
        const cb = { x: b.x + b.w / 2, y: b.y + b.h / 2 }
        if (Math.abs(ca.y - cb.y) < NODE_H / 2) return points(a, b) // 並排:兩張卡之間
        const down = cb.y > ca.y
        return { sx: ca.x, sy: down ? a.y + a.h : a.y, tx: cb.x, ty: down ? b.y : b.y + b.h }
      }
      for (const r of parentChild) {
        const a = boxOf.get(r.parent_id)
        const b = boxOf.get(r.child_id)
        if (!a || !b) continue
        out.push({ id: `pc-${r.parent_id}-${r.child_id}`, source: r.parent_id, target: r.child_id, sourceHandle: 'bottom', targetHandle: 'top', type: 'vessel', data: { kind: 'direct', route: 'straight', points: points(a, b) } })
      }
      for (const s of spouses) {
        const a = boxOf.get(s.person_a_id)
        const b = boxOf.get(s.person_b_id)
        if (!a || !b) continue
        const pts = spousePoints(a, b)
        const status = s.status || 'married'
        out.push({ id: `sp-${s.id}`, source: s.person_a_id, target: s.person_b_id, sourceHandle: 'bottom', targetHandle: 'top', type: 'vessel', data: { kind: 'spouse', status, route: 'straight', label: SPOUSE_LABEL[s.status], points: pts } })
        if (Math.hypot(pts.tx - pts.sx, pts.ty - pts.sy) > 40) {
          // 不是並排的一對(前任、被隔開的):兩端加接點
          port(`port-${s.id}-a`, pts.sx, pts.sy, status)
          port(`port-${s.id}-b`, pts.tx, pts.ty, status)
        }
      }
      return { edges: out, ports }
    }
    for (const j of junctions.values()) {
      const scale = j.thin ? 0.6 : 1 // 橫桿跟別家重疊錯開時畫細一點,才分得出哪條是哪家的
      for (const pid of j.parentIds) out.push({ id: `pc-in-${j.id}-${pid}`, source: pid, target: j.id, sourceHandle: 'bottom', targetHandle: 'top', type: 'vessel', data: { kind: 'parent', scale } })
      for (const cid of j.childIds) out.push({ id: `pc-out-${j.id}-${cid}`, source: j.id, target: cid, sourceHandle: 'bottom', targetHandle: 'top', type: 'vessel', data: { kind: 'child', scale } })
    }
    // 配偶線:並排的一對 → 兩張卡之間一小段;被別人隔開的(前任、合併樹)→ 從兩張卡的頂端往上繞過整列再下來,
    // 兩端加接點,不會看起來像連到中間那些人
    const boxOf = new Map(cards.map((c) => [c.p.id, c]))
    const arcs = [] // 同一列的繞行線,依橫向範圍分車道錯開高度
    for (const s of spouses) {
      const a = boxOf.get(s.person_a_id)
      const b = boxOf.get(s.person_b_id)
      if (!a || !b) continue
      const [L, R] = a.x <= b.x ? [a, b] : [b, a]
      const status = s.status || 'married'
      const sameRow = Math.abs(L.y - R.y) < NODE_H / 2
      const blocked = sameRow && cards.some((c) => c !== L && c !== R && Math.abs(c.y - L.y) < NODE_H / 2 && c.x < R.x && c.x + c.w > L.x + L.w)
      const base = { id: `sp-${s.id}`, source: L.p.id, target: R.p.id, type: 'vessel' }
      const data = { kind: 'spouse', status, label: SPOUSE_LABEL[s.status] }
      if (sameRow && !blocked) {
        out.push({ ...base, sourceHandle: 'right', targetHandle: 'left', data: { ...data, route: 'straight' } })
      } else if (sameRow) {
        arcs.push({ s, L, R, status, base, data, minX: L.x + L.w / 2, maxX: R.x + R.w / 2, row: Math.round(L.y) })
      } else {
        // 不同列(手動搬過):從上面那張的底部到下面那張的頂端,階梯狀;兩端加接點
        const [T, B] = L.y <= R.y ? [L, R] : [R, L]
        const sx = T.x + T.w / 2
        const sy = T.y + T.h
        const tx = B.x + B.w / 2
        const ty = B.y
        out.push({ ...base, source: T.p.id, target: B.p.id, sourceHandle: 'bottom', targetHandle: 'top', data: { ...data, route: 'step', points: { sx, sy, tx, ty } } })
        port(`port-${s.id}-a`, sx, sy, status)
        port(`port-${s.id}-b`, tx, ty, status)
      }
    }
    // 繞行線分車道:同列、橫向範圍重疊的錯開不同高度(越外圈越高)
    const byRow = new Map()
    for (const arc of arcs) {
      if (!byRow.has(arc.row)) byRow.set(arc.row, [])
      byRow.get(arc.row).push(arc)
    }
    const portShift = new Map() // 同一張卡有多條繞行線時,接點左右錯開
    for (const list of byRow.values()) {
      list.sort((x, y) => x.maxX - x.minX - (y.maxX - y.minX)) // 短的先(內圈)
      const lanes = []
      for (const arc of list) {
        let lane = lanes.findIndex((segs) => segs.every(([m0, m1]) => arc.maxX < m0 - 6 || arc.minX > m1 + 6))
        if (lane < 0) lane = lanes.push([]) - 1
        lanes[lane].push([arc.minX, arc.maxX])
        const lift = 18 + lane * 12
        const shiftOf = (id) => {
          const n = portShift.get(id) || 0
          portShift.set(id, n + 1)
          return n === 0 ? 0 : (n % 2 ? 1 : -1) * Math.ceil(n / 2) * 14
        }
        const sx = arc.L.x + arc.L.w / 2 + shiftOf(arc.L.p.id)
        const tx = arc.R.x + arc.R.w / 2 + shiftOf(arc.R.p.id)
        const sy = arc.L.y
        const ty = arc.R.y
        const top = Math.min(sy, ty) - lift
        out.push({ ...arc.base, sourceHandle: 'bottom', targetHandle: 'top', data: { ...arc.data, route: 'straight', poly: [{ x: sx, y: sy }, { x: sx, y: top }, { x: tx, y: top }, { x: tx, y: ty }] } })
        port(`port-${arc.s.id}-a`, sx, sy, arc.status)
        port(`port-${arc.s.id}-b`, tx, ty, arc.status)
      }
    }
    return { edges: out, ports }
  }, [radial, cards, parentChild, junctions, spouses, positions])

  const nodes = useMemo(
    () => [
      ...householdNodes,
      ...cards.map((c) => ({
        id: c.p.id,
        type: 'person',
        position: { x: c.x, y: c.y },
        style: { width: c.w, height: c.h },
        className: [draggingId === c.p.id && 'person-dragging', layoutMode && selectedId === c.p.id && 'person-selected'].filter(Boolean).join(' ') || undefined,
        data: {
          person: c.p, term: terms.get(c.p.id) ?? null, isViewpoint: c.p.id === viewpointId, isSelf: c.p.id === selfId,
          scale: c.s, badge: c.badge, badgeStrong: c.badgeStrong, tint: c.tint,
        },
        draggable: layoutMode && selectedId === c.p.id, // 只有選取中的卡片能拖,其他卡片按著滑仍是平移
        selectable: false,
      })),
      ...[...junctions.values()].map((j) => ({
        id: j.id,
        type: 'junction',
        position: { x: j.x - JUNCTION_SIZE / 2, y: j.y - JUNCTION_SIZE / 2 },
        data: { thin: j.thin },
        draggable: false,
        selectable: false,
      })),
      ...ports.map((p) => ({
        id: p.id,
        type: 'port',
        position: { x: p.x - PORT_SIZE / 2, y: p.y - PORT_SIZE / 2 },
        data: { status: p.status },
        zIndex: 5, // 蓋在卡片邊緣上
        draggable: false,
        selectable: false,
        focusable: false,
      })),
    ],
    [cards, householdNodes, terms, viewpointId, selfId, junctions, ports, draggingId, layoutMode, selectedId],
  )

  // 點卡片:平常跳出這個人的快速選單(看詳細 / 以這個人為基準新增父母、子女、配偶、兄弟姊妹);編輯排版時是選取
  const [menuId, setMenuId] = useState(null)
  const onNodeClick = useCallback(
    (_e, node) => {
      if (node.type !== 'person' || Date.now() < suppressClickUntil.current) return
      if (layoutMode) setSelectedId(node.id) // 編輯排版:點一下 = 選取,不開詳細頁
      else setMenuId((cur) => (cur === node.id ? null : node.id))
    },
    [layoutMode],
  )
  const onPaneClick = useCallback(() => {
    setSelectedId(null)
    setMenuId(null)
  }, [])
  useEffect(() => setMenuId(null), [layoutMode])
  const menuPerson = menuId ? peopleById.get(menuId) : null
  const ADD_OPTIONS = [
    ['parent', '父母'],
    ['child', '子女'],
    ['spouse', '配偶 / 伴侶'],
    ['sibling', '兄弟姊妹'],
  ]

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
        onPaneClick={onPaneClick}
        onNodesChange={onNodesChange}
        onNodeDragStart={onNodeDragStart}
        onNodeDragStop={onNodeDragStop}
        nodesDraggable={layoutMode}
        nodeDragThreshold={4}
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
          <button onClick={toggleLayoutMode} className={`chip text-xs shadow-sm ${layoutMode ? 'chip-active' : ''}`}>
            {layoutMode ? '✓ 完成排版' : '✋ 編輯排版'}
          </button>
          {overrides.size > 0 && (
            <button onClick={resetLayout} className="chip text-xs shadow-sm" title="清掉手動搬過的位置,回到自動排版">
              ↺ 重新排版
            </button>
          )}
          <button onClick={() => setArrangement((a) => (a === 'radial' ? 'layered' : 'radial'))} className={`chip text-xs shadow-sm ${radial ? 'chip-active' : ''}`} title={ARRANGEMENTS.find((a) => a.id === arrangement)?.hint}>
            {radial ? '☀ 放射' : '☰ 分層'}
          </button>
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
          <p className="mb-1.5 mt-3 text-sm font-semibold text-ink">排版</p>
          <div className="flex flex-wrap gap-1.5">
            {ARRANGEMENTS.map((a) => (
              <button key={a.id} onClick={() => setArrangement(a.id)} className={`chip text-xs ${arrangement === a.id ? 'chip-active' : ''}`}>
                {a.icon} {a.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">{ARRANGEMENTS.find((a) => a.id === arrangement)?.hint}</p>
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

      {menuPerson && !layoutMode && (
        <div className="absolute inset-x-3 bottom-3 z-10 rounded-2xl bg-surface p-3 shadow-lg ring-1 ring-line">
          <div className="flex items-center gap-3">
            <Avatar person={menuPerson} size="md" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink">
                {menuPerson.name}
                {menuPerson.nicknames?.length > 0 && <span className="ml-1 text-xs font-normal text-muted">{menuPerson.nicknames.join('、')}</span>}
              </p>
              <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted">
                {terms.get(menuId) ? <TermBadge result={terms.get(menuId)} /> : <span className="term term-none">未連結</span>}
                <span>{ageLabel(menuPerson)}</span>
              </div>
            </div>
            <button onClick={() => setMenuId(null)} className="rounded-full px-2 py-1 text-xs text-muted" aria-label="關閉">
              ✕
            </button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1.5">
            <Link to={`/people/${menuId}`} className="btn-secondary btn-sm col-span-2">
              查看詳細
            </Link>
            {canEdit &&
              ADD_OPTIONS.map(([rel, label]) => (
                <Link key={rel} to={`/people/new?rel=${rel}&of=${menuId}`} className="btn-primary btn-sm">
                  ＋ {label}
                </Link>
              ))}
          </div>
          {canEdit && <p className="mt-2 text-[11px] text-muted">新增的人會直接以「{menuPerson.name}」為基準建立關係。</p>}
        </div>
      )}

      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-start gap-1.5 p-3">
        {layoutMode && (
          <p className="pointer-events-auto inline-block rounded-xl bg-accent-soft px-3 py-1.5 text-xs text-accent shadow-sm">
            {draggingId ? '拖曳中 · 放開即完成' : selectedId ? `已選取「${peopleById.get(selectedId)?.name ?? ''}」· 按住拖曳移動,點其他卡片切換` : '點一下卡片選取,再按住拖曳移動'}
          </p>
        )}
        {layout.unlinked.length > 0 && viewpointId && (
          <p className="pointer-events-auto inline-block rounded-xl bg-surface-2 px-3 py-1.5 text-xs text-muted shadow-sm">
            有 {layout.unlinked.length} 位成員尚未與視角相連(排在最下方{radial ? '一排' : ''}),請補上關係。
          </p>
        )}
      </div>
    </div>
  )
}
