import { useMemo } from 'react'
import { EdgeLabelRenderer } from '@xyflow/react'
import { buildVesselPath, routePoints, widthParent, widthChild, widthDirect, widthSpouse } from '../lib/vesselPath.js'

const ENDED = new Set(['divorced', 'ex_partner'])

function widthFor(kind, status) {
  if (kind === 'parent') return widthParent
  if (kind === 'child') return widthChild
  if (kind === 'direct') return widthDirect
  return widthSpouse(status === 'partner' || status === 'ex_partner' ? 0.8 : 1)
}

/**
 * 血管造型的 React Flow edge(取代 BusEdge 與內建的 straight / step)
 * data: { kind: 'parent' | 'child' | 'direct' | 'spouse', status?: 配偶狀態, route?: 'target' | 'source' | 'step' | 'straight', label?: string,
 *         points?: { sx, sy, tx, ty } 明確指定兩端座標(放射排版:從卡片邊緣出發,不用 handle 的位置) }
 *
 * 層次:
 * - vessel-body   封閉形狀填色(不透明,重疊的細管看起來是同一條)
 * - vessel-core   同一條中心線、寬度一半的較淺色內芯 → 管子中央亮、邊緣深,像圓管的漸層打光
 * - vessel-flow   沿中心線的圓點虛線(dash 幾乎為 0 + round cap = 一顆顆圓粒),用 clipPath 裁在血管裡;
 *                 疊兩層(大而淡的光暈 + 小而亮的核心)做出柔和發光的粒子,
 *                 CSS keyframes 動 stroke-dashoffset 就會沿路徑流動(父母 → 孩子),零 JS、零 filter
 * - vessel-outline 已結束的關係(離婚 / 前伴侶)加一條虛線外框,像乾掉的空管
 * 配偶沒有血緣,不流動。
 */
export default function VesselEdge({ id, sourceX: hx, sourceY: hy, targetX: hxt, targetY: hyt, data = {}, style }) {
  const kind = data.kind ?? 'child'
  const status = data.status
  const route = data.route ?? (kind === 'parent' ? 'target' : kind === 'child' ? 'source' : 'straight')
  const ended = ENDED.has(status)
  const sourceX = data.points?.sx ?? hx
  const sourceY = data.points?.sy ?? hy
  const targetX = data.points?.tx ?? hxt
  const targetY = data.points?.ty ?? hyt
  const geo = useMemo(() => {
    const pts = routePoints(sourceX, sourceY, targetX, targetY, route)
    const widthFn = widthFor(kind, status)
    const outer = buildVesselPath(pts, widthFn)
    const core = ended ? null : buildVesselPath(pts, (t, s, L) => widthFn(t, s, L) * 0.5)
    return { ...outer, coreD: core?.d ?? '' }
  }, [sourceX, sourceY, targetX, targetY, route, kind, status, ended])
  if (!geo.d) return null

  const flowing = kind !== 'spouse'
  const clipId = `vessel-clip-${String(id).replace(/[^A-Za-z0-9_-]/g, '_')}`

  return (
    <g className={`vessel vessel-${kind}${status ? ` vessel-${status}` : ''}`} style={style}>
      <path d={geo.d} className="vessel-body" />
      {geo.coreD && <path d={geo.coreD} className="vessel-core" />}
      {ended && <path d={geo.d} className="vessel-outline" />}
      {flowing && (
        <>
          <clipPath id={clipId}>
            <path d={geo.d} />
          </clipPath>
          <path d={geo.centerD} className="vessel-flow vessel-flow-glow" clipPath={`url(#${clipId})`} />
          <path d={geo.centerD} className="vessel-flow vessel-flow-dot" clipPath={`url(#${clipId})`} />
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
