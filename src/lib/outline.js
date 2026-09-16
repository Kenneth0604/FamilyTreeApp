/**
 * 小家庭的不規則外框:把一堆(可能重疊的)長方形聯集起來,描出外緣,再把直角磨圓
 *
 * 做法:座標壓縮 → 格子標記被哪些長方形蓋住 → 走一遍格子,蓋住 / 沒蓋住交界的邊就是外框 →
 * 把邊首尾相接串成閉合多邊形(內洞會自然變成反向的圈,搭配 evenodd 填色) → 每個轉角換成二次貝茲曲線。
 * 純數學、無 DOM 依賴,方便測試。
 */

/**
 * @param {{x:number,y:number,w:number,h:number}[]} rects
 * @returns {number[][][]} 多邊形陣列,每個多邊形是 [x, y] 頂點序列(順時針;內洞逆時針),已合併共線頂點
 */
export function unionPolygons(rects) {
  const boxes = rects.filter((r) => r && r.w > 0 && r.h > 0)
  if (!boxes.length) return []
  const xs = [...new Set(boxes.flatMap((r) => [r.x, r.x + r.w]))].sort((a, b) => a - b)
  const ys = [...new Set(boxes.flatMap((r) => [r.y, r.y + r.h]))].sort((a, b) => a - b)
  const cols = xs.length - 1
  const rows = ys.length - 1
  const covered = Array.from({ length: rows }, () => new Array(cols).fill(false))
  for (const r of boxes) {
    const c0 = xs.indexOf(r.x)
    const c1 = xs.indexOf(r.x + r.w)
    const r0 = ys.indexOf(r.y)
    const r1 = ys.indexOf(r.y + r.h)
    for (let i = r0; i < r1; i++) for (let j = c0; j < c1; j++) covered[i][j] = true
  }
  const at = (i, j) => i >= 0 && j >= 0 && i < rows && j < cols && covered[i][j]

  // 有向邊:內部在行進方向的右手邊(螢幕座標 y 向下 → 外框順時針)
  const edges = new Map() // "x,y" 起點 → [終點...]
  const addEdge = (x0, y0, x1, y1) => {
    const key = `${x0},${y0}`
    if (!edges.has(key)) edges.set(key, [])
    edges.get(key).push([x1, y1])
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      if (!covered[i][j]) continue
      const x0 = xs[j], x1 = xs[j + 1], y0 = ys[i], y1 = ys[i + 1]
      if (!at(i - 1, j)) addEdge(x0, y0, x1, y0) // 上緣:向右
      if (!at(i, j + 1)) addEdge(x1, y0, x1, y1) // 右緣:向下
      if (!at(i + 1, j)) addEdge(x1, y1, x0, y1) // 下緣:向左
      if (!at(i, j - 1)) addEdge(x0, y1, x0, y0) // 左緣:向上
    }
  }

  // 串成閉合圈
  const polygons = []
  for (const [startKey, outs] of edges) {
    while (outs.length) {
      const [sx, sy] = startKey.split(',').map(Number)
      const poly = [[sx, sy]]
      let cur = outs.pop()
      let guard = 0
      while (!(cur[0] === sx && cur[1] === sy) && guard++ < 100000) {
        poly.push(cur)
        const next = edges.get(`${cur[0]},${cur[1]}`)
        if (!next || !next.length) break
        // 兩條出邊(對角相接的兩塊)時,選轉彎最順的那條:優先右轉,讓外框不會把兩塊黏成一塊
        let pick = 0
        if (next.length > 1) {
          const prev = poly[poly.length - 2]
          const dx = cur[0] - prev[0], dy = cur[1] - prev[1]
          pick = next.findIndex(([nx, ny]) => dx * (ny - cur[1]) - dy * (nx - cur[0]) > 0)
          if (pick < 0) pick = 0
        }
        cur = next.splice(pick, 1)[0]
      }
      polygons.push(mergeCollinear(poly))
    }
  }
  return polygons
}

function mergeCollinear(poly) {
  const out = []
  const n = poly.length
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]
    const cur = poly[i]
    const next = poly[(i + 1) % n]
    const straight = (cur[0] - prev[0]) * (next[1] - cur[1]) - (cur[1] - prev[1]) * (next[0] - cur[0]) === 0
    if (!straight) out.push(cur)
  }
  return out
}

/**
 * 多邊形 → SVG path(轉角磨圓)。radius 會被相鄰邊長的一半限制,短邊不會磨過頭。
 * @param {number[][]} poly
 * @param {number} radius
 */
export function roundedPath(poly, radius) {
  const n = poly.length
  if (n < 3) return ''
  const pt = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
  const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1])
  const f = (v) => Math.round(v * 10) / 10
  let d = ''
  for (let i = 0; i < n; i++) {
    const prev = poly[(i - 1 + n) % n]
    const cur = poly[i]
    const next = poly[(i + 1) % n]
    const rIn = Math.min(radius, len(prev, cur) / 2)
    const rOut = Math.min(radius, len(cur, next) / 2)
    const a = pt(cur, prev, rIn / len(prev, cur))
    const b = pt(cur, next, rOut / len(cur, next))
    d += `${i === 0 ? 'M' : 'L'}${f(a[0])} ${f(a[1])} Q${f(cur[0])} ${f(cur[1])} ${f(b[0])} ${f(b[1])} `
  }
  return d + 'Z'
}

/**
 * 一次做完:長方形聯集 → 磨圓的 SVG path(多個圈 / 內洞合成一條 path,搭配 fill-rule="evenodd")
 * 並附上外框的包圍盒,方便放進 React Flow 的節點裡
 */
export function unionOutline(rects, radius = 18) {
  const polys = unionPolygons(rects)
  if (!polys.length) return null
  const pts = polys.flat()
  const minX = Math.min(...pts.map((p) => p[0]))
  const minY = Math.min(...pts.map((p) => p[1]))
  const maxX = Math.max(...pts.map((p) => p[0]))
  const maxY = Math.max(...pts.map((p) => p[1]))
  return { path: polys.map((p) => roundedPath(p, radius)).join(' '), x: minX, y: minY, w: maxX - minX, h: maxY - minY, pieces: polys.length }
}
