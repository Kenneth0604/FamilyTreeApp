import { memo, useCallback, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ReactFlow, Background, Controls, Handle, Position, useReactFlow, ReactFlowProvider } from '@xyflow/react'
import { useStore } from '../lib/store.jsx'
import { layoutTree, NODE_W, NODE_H } from '../lib/treeLayout.js'
import Avatar from '../components/Avatar.jsx'
import TermBadge from '../components/TermBadge.jsx'
import { ageLabel } from '../lib/format.js'

/** 樹狀圖節點:大頭照 / 姓名 / 相對於 viewpoint 的稱謂 */
const PersonNode = memo(function PersonNode({ data }) {
  const { person, term, isViewpoint, isSelf } = data
  return (
    <div
      className={`card flex flex-col items-center gap-1.5 px-2 py-3 text-center ${isViewpoint ? 'ring-2 ring-primary' : ''} ${person.is_deceased ? 'opacity-80' : ''}`}
      style={{ width: NODE_W, height: NODE_H }}
    >
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Left} id="left" />
      <Avatar person={person} size="lg" />
      <div className="w-full truncate text-sm font-semibold text-ink">
        {person.name}
        {person.is_deceased && <span className="ml-0.5 text-xs text-muted">†</span>}
      </div>
      <div className="flex max-w-full flex-wrap items-center justify-center gap-1">
        {isSelf && <span className="term term-self">我</span>}
        {term ? <TermBadge result={term} className="max-w-full truncate" /> : <span className="term term-none">未連結</span>}
      </div>
      <div className="text-[11px] text-muted">{ageLabel(person)}</div>
    </div>
  )
})

const nodeTypes = { person: PersonNode }

export default function Tree() {
  return (
    <ReactFlowProvider>
      <TreeCanvas />
    </ReactFlowProvider>
  )
}

function TreeCanvas() {
  const { people, graph, terms, viewpointId, selfId, parentChild, spouses, peopleById } = useStore()
  const navigate = useNavigate()
  const { fitView, setCenter } = useReactFlow()

  const layout = useMemo(() => layoutTree(graph, terms, viewpointId), [graph, terms, viewpointId])

  const nodes = useMemo(
    () =>
      people
        .filter((p) => layout.positions.has(p.id))
        .map((p) => ({
          id: p.id,
          type: 'person',
          position: layout.positions.get(p.id),
          data: { person: p, term: terms.get(p.id) ?? null, isViewpoint: p.id === viewpointId, isSelf: p.id === selfId },
          draggable: false,
          selectable: false,
        })),
    [people, layout, terms, viewpointId, selfId],
  )

  const edges = useMemo(() => {
    const out = []
    for (const r of parentChild) {
      if (!peopleById.has(r.parent_id) || !peopleById.has(r.child_id)) continue
      out.push({ id: `pc-${r.id}`, source: r.parent_id, target: r.child_id, sourceHandle: 'bottom', targetHandle: 'top', type: 'smoothstep', pathOptions: { borderRadius: 12 } })
    }
    for (const s of spouses) {
      if (!peopleById.has(s.person_a_id) || !peopleById.has(s.person_b_id)) continue
      const pa = layout.positions.get(s.person_a_id)
      const pb = layout.positions.get(s.person_b_id)
      if (!pa || !pb) continue
      const [left, right] = pa.x <= pb.x ? [s.person_a_id, s.person_b_id] : [s.person_b_id, s.person_a_id]
      const sameRow = pa.y === pb.y
      out.push({
        id: `sp-${s.id}`,
        source: left,
        target: right,
        sourceHandle: sameRow ? 'right' : 'bottom',
        targetHandle: sameRow ? 'left' : 'top',
        type: sameRow ? 'straight' : 'smoothstep',
        className: s.status === 'divorced' ? 'divorced-edge' : 'spouse-edge',
      })
    }
    return out
  }, [parentChild, spouses, peopleById, layout])

  const onNodeClick = useCallback((_e, node) => navigate(`/people/${node.id}`), [navigate])

  // 以 viewpoint 為中心
  const focusViewpoint = useCallback(() => {
    const pos = viewpointId && layout.positions.get(viewpointId)
    if (pos) setCenter(pos.x + NODE_W / 2, pos.y + NODE_H / 2, { zoom: 0.9, duration: 400 })
    else fitView({ padding: 0.2, duration: 400 })
  }, [viewpointId, layout, setCenter, fitView])

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
        <p className="mt-1 text-sm text-muted">先新增第一位成員(通常是你自己),再從這個人一層層往外加。</p>
        <Link to="/people/new" className="btn-primary mt-4">
          新增第一位成員
        </Link>
      </div>
    )
  }

  return (
    <div className="tree-canvas absolute inset-0">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
        </div>
        {!viewpointId && (
          <Link to="/settings" className="pointer-events-auto rounded-xl bg-info-soft px-3 py-1.5 text-xs text-info shadow-sm">
            尚未設定視角 ›
          </Link>
        )}
      </div>

      {layout.unlinked.length > 0 && viewpointId && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 p-3">
          <p className="pointer-events-auto inline-block rounded-xl bg-surface-2 px-3 py-1.5 text-xs text-muted shadow-sm">
            有 {layout.unlinked.length} 位成員尚未與視角相連(排在最下方),請補上關係。
          </p>
        </div>
      )}
    </div>
  )
}
