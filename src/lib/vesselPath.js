/**
 * 血管造型 path 產生器
 *
 * SVG 的 stroke 沒有漸變寬度,所以「兩端寬、中間窄」的管子要用「填色的封閉形狀」畫(Sankey ribbon / 書法筆刷的做法):
 * 1. 中心線的每個內角換成二次貝茲曲線,並沿線等距取樣 → 一條平滑的中心線
 * 2. 依累積弧長算 t∈[0,1],用 widthFn(t, s, L) 決定每個樣本的寬度,沿法線左右各偏移半寬 → 上緣 / 下緣
 * 3. 上緣正走、下緣反走,首尾接起來就是封閉 path
 *
 * 純函式、不依賴 DOM,父子線與配偶線共用。
 */

const round = (v) => Math.round(v * 10) / 10

function dedupe(points) {
  const out = []
  for (const p of points) {
    const last = out[out.length - 1]
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 0.5) out.push(p)
  }
  return out
}

/**
 * 直角骨架 → 平滑中心線取樣點
 * @param {{x:number,y:number}[]} points 折點
 * @param {{ cornerRadius?: number, step?: number }} [opts] 轉角半徑(px)、直線段取樣間距(px)
 */
export function sampleCenterline(points, { cornerRadius = 18, step = 8 } = {}) {
  const pts = dedupe(points)
  if (pts.length < 2) return pts

  // 拆成「直線段」與「彎角」:每個內角前後各退 r,中間用以頂點為控制點的二次貝茲接起來
  const segs = []
  let cur = pts[0]
  for (let i = 1; i < pts.length; i++) {
    const v = pts[i]
    if (i === pts.length - 1) {
      segs.push({ type: 'line', a: cur, b: v })
      break
    }
    const next = pts[i + 1]
    const lenIn = Math.hypot(v.x - cur.x, v.y - cur.y)
    const lenOut = Math.hypot(next.x - v.x, next.y - v.y)
    const r = Math.min(cornerRadius, lenIn / 2, lenOut / 2)
    const inPt = { x: v.x + ((cur.x - v.x) / lenIn) * r, y: v.y + ((cur.y - v.y) / lenIn) * r }
    const outPt = { x: v.x + ((next.x - v.x) / lenOut) * r, y: v.y + ((next.y - v.y) / lenOut) * r }
    segs.push({ type: 'line', a: cur, b: inPt })
    segs.push({ type: 'curve', a: inPt, c: v, b: outPt })
    cur = outPt
  }

  const out = [pts[0]]
  const push = (p) => {
    const l = out[out.length - 1]
    if (Math.hypot(p.x - l.x, p.y - l.y) > 0.25) out.push(p)
  }
  for (const s of segs) {
    if (s.type === 'line') {
      const len = Math.hypot(s.b.x - s.a.x, s.b.y - s.a.y)
      const n = Math.max(1, Math.ceil(len / step))
      for (let k = 1; k <= n; k++) push({ x: s.a.x + ((s.b.x - s.a.x) * k) / n, y: s.a.y + ((s.b.y - s.a.y) * k) / n })
    } else {
      const n = 6
      for (let k = 1; k <= n; k++) {
        const t = k / n
        const u = 1 - t
        push({ x: u * u * s.a.x + 2 * u * t * s.c.x + t * t * s.b.x, y: u * u * s.a.y + 2 * u * t * s.c.y + t * t * s.b.y })
      }
    }
  }
  return out
}

/**
 * @param {{x:number,y:number}[]} points 中心線折點(直角骨架即可,轉角會自動圓滑)
 * @param {(t:number, s:number, L:number) => number} widthFn t = 0..1 弧長比例、s = 已走距離(px)、L = 總長
 * @param {{ cornerRadius?: number, step?: number }} [opts]
 * @returns {{ d: string, centerD: string, center: {x:number,y:number}[], length: number, mid: {x:number,y:number} }}
 *   d = 封閉血管形狀;centerD = 平滑中心線(給流動用的虛線 stroke);mid = 弧長中點(放標籤)
 */
export function buildVesselPath(points, widthFn, opts) {
  const c = sampleCenterline(points, opts)
  if (c.length < 2) return { d: '', centerD: '', center: c, length: 0, mid: c[0] ?? { x: 0, y: 0 } }

  const cum = [0]
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + Math.hypot(c[i].x - c[i - 1].x, c[i].y - c[i - 1].y))
  const L = cum[c.length - 1] || 1

  const left = []
  const right = []
  for (let i = 0; i < c.length; i++) {
    // 切線用前後點的中央差分,首尾用單邊
    const p0 = c[Math.max(0, i - 1)]
    const p1 = c[Math.min(c.length - 1, i + 1)]
    let tx = p1.x - p0.x
    let ty = p1.y - p0.y
    const tl = Math.hypot(tx, ty) || 1
    tx /= tl
    ty /= tl
    const nx = -ty
    const ny = tx
    const hw = Math.max(0.5, widthFn(cum[i] / L, cum[i], L)) / 2
    left.push({ x: c[i].x + nx * hw, y: c[i].y + ny * hw })
    right.push({ x: c[i].x - nx * hw, y: c[i].y - ny * hw })
  }

  let d = `M ${round(left[0].x)} ${round(left[0].y)}`
  for (let i = 1; i < left.length; i++) d += ` L ${round(left[i].x)} ${round(left[i].y)}`
  for (let i = right.length - 1; i >= 0; i--) d += ` L ${round(right[i].x)} ${round(right[i].y)}`
  d += ' Z'
  const centerD = c.map((p, i) => `${i ? 'L' : 'M'} ${round(p.x)} ${round(p.y)}`).join(' ')

  let mi = 0
  while (mi < c.length - 1 && cum[mi] < L / 2) mi++
  return { d, centerD, center: c, length: L, mid: c[mi] }
}

/**
 * 連線骨架(直角折點;轉角交給 sampleCenterline 圓滑)
 * - target:先垂直到目標高度再水平(父母 → 連接點,形成連接點高度的一條橫桿)
 * - source:先水平再垂直(連接點 → 孩子,沿橫桿到孩子正上方再直直下去)
 * - step:垂直 → 水平 → 垂直(不同列的配偶)
 * - straight:直線
 */
export function routePoints(sx, sy, tx, ty, route) {
  switch (route) {
    case 'target':
      return [{ x: sx, y: sy }, { x: sx, y: ty }, { x: tx, y: ty }]
    case 'source':
      return [{ x: sx, y: sy }, { x: tx, y: sy }, { x: tx, y: ty }]
    case 'step': {
      const my = (sy + ty) / 2
      return [{ x: sx, y: sy }, { x: sx, y: my }, { x: tx, y: my }, { x: tx, y: ty }]
    }
    default:
      return [{ x: sx, y: sy }, { x: tx, y: ty }]
  }
}

// ---- 寬度函數 ----
export const VESSEL = { max: 12, min: 3.5, funnel: 48 } // 兩端最寬、中段細管、漏斗長度上限(px)
const easeOutCubic = (x) => 1 - (1 - x) ** 3
const easeInCubic = (x) => x ** 3
const funnelLen = (L) => Math.min(VESSEL.funnel, L * 0.45)

/** 父母 → 連接點:出發時最寬,快速收窄成細管 */
export const widthParent = (t, s, L) => {
  const F = funnelLen(L)
  return s < F ? VESSEL.max - (VESSEL.max - VESSEL.min) * easeOutCubic(s / F) : VESSEL.min
}
/** 連接點 → 孩子:一路細管,接近孩子時重新放寬 */
export const widthChild = (t, s, L) => {
  const F = funnelLen(L)
  const r = L - s
  return r < F ? VESSEL.min + (VESSEL.max - VESSEL.min) * easeInCubic(1 - r / F) : VESSEL.min
}
/** 父母 → 孩子直連(放射排版沒有連接點):兩端寬、中段細管 */
export const widthDirect = (t, s, L) => {
  const F = funnelLen(L)
  const r = Math.min(s, L - s)
  return r < F ? VESSEL.min + (VESSEL.max - VESSEL.min) * easeInCubic(1 - r / F) : VESSEL.min
}
/** 配偶:兩端 9、中間 4 的小血管;scale 可整體縮小(伴侶 / 前伴侶) */
export const widthSpouse =
  (scale = 1) =>
  (t) =>
    (4 + 5 * Math.abs(2 * t - 1) ** 1.6) * scale
