import { useMemo } from 'react'
import { EdgeLabelRenderer } from '@xyflow/react'
import { buildVesselPath, routePoints, widthParent, widthChild, widthSpouse } from '../lib/vesselPath.js'

const ENDED = new Set(['divorced', 'ex_partner'])

function widthFor(kind, status) {
  if (kind === 'parent') return widthParent
  if (kind === 'child') return widthChild
  return widthSpouse(status === 'partner' || status === 'ex_partner' ? 0.8 : 1)
}

/**
 * 血管造型的 React Flow edge(取代 BusEdge 與內建的 straight / step)
 * data: { kind: 'parent' | 'child' | 'spouse', status?: 配偶狀態, route?: 'target' | 'source' | 'step' | 'straight', label?: string }
 *
 * 三層:
 * - vessel-body   封閉形狀填色(不透明,重疊的細管看起來是同一條)
 * - vessel-flow   沿中心線的粗虛線,用 clipPath 裁成血管形狀 → 一顆顆「血球」隨管徑變粗變細;
 *                 CSS keyframes 動 stroke-dashoffset 就會沿路徑流動(父母 → 孩子),零 JS
 * - vessel-outline 已結束的關係(離婚 / 前伴侶)加一條虛線外框,像乾掉的空管
 * 配偶沒有血緣,不流動。
 */
export default function VesselEdge({ id, sourceX, sourceY, targetX, targetY, data = {}, style }) {
  const kind = data.kind ?? 'child'
  const status = data.status
  const route = data.route ?? (kind === 'parent' ? 'target' : kind === 'child' ? 'source' : 'straight')
  const geo = useMemo(
    () => buildVesselPath(routePoints(sourceX, sourceY, targetX, targetY, route), widthFor(kind, status)),
    [sourceX, sourceY, targetX, targetY, route, kind, status],
  )
  if (!geo.d) return null

  const flowing = kind !== 'spouse'
  const ended = ENDED.has(status)
  const clipId = `vessel-clip-${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}`

  return (
    <g className={`vessel vessel-${kind}${status ? ` vessel-${status}` : ''}`} style={style}>
      <path d={geo.d} className="vessel-body" />
      {ended && <path d={geo.d} className="vessel-outline" />}
      {flowing && (
        <>
          <clipPath id={clipId}>
            <path d={geo.d} />
          </clipPath>
          <path d={geo.centerD} className="vessel-flow" clipPath={`url(#${clipId})`} />
        </>
      )}
      {data.label && (
        <EdgeLabelRenderer>
          <div className="vessel-label" style={{ transform: `translate(-50%, -50%) translate(${geo.mid.x}px, ${geo.mid.y - 11}px)` }}>
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </g>
  )
}
