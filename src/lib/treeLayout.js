/**
 * 家族樹排版:以 viewpoint 為中心、依世代分層
 *
 * 1. row   = 每個人相對 viewpoint 的世代差(由稱謂引擎的 BFS 結果取得;不相連的人放最下方)
 * 2. 同一 row 內先以「父母的位置」分組排序(孩子跟著父母),再把配偶排在旁邊、子女依生日排序
 * 3. 由下往上把有孩子的節點置中到孩子群的中央,並解決同 row 的重疊
 *
 * 不引入圖形排版庫,足以應付一般家族(數十到百餘人)。
 */
import { compareAge } from './kinship/birth.js'

export const NODE_W = 132
export const NODE_H = 168
const GAP_X = 28
const GAP_Y = 90
const COUPLE_GAP = 12

/**
 * @param {import('./kinship/graph.js').Graph} graph
 * @param {Map<string, {generation:number}>} terms  computeAllRelationTerms 的結果
 * @param {string|null} viewpointId
 * @returns {{ positions: Map<string,{x:number,y:number}>, rows: Map<number,string[]>, unlinked: string[] }}
 */
export function layoutTree(graph, terms, viewpointId) {
  const ids = [...graph.persons.keys()]
  if (ids.length === 0) return { positions: new Map(), rows: new Map(), unlinked: [] }

  // ---- 1. 分層 ----
  const gen = new Map()
  const unlinked = []
  for (const id of ids) {
    const t = terms.get(id)
    if (t) gen.set(id, t.generation)
    else unlinked.push(id)
  }
  // 沒有 viewpoint(或不相連)的人:用自己所在連通分量的相對世代排,分量之間直接往下疊
  if (unlinked.length) assignComponentGenerations(graph, gen, unlinked)

  const rowsMap = new Map()
  for (const [id, g] of gen) {
    if (!rowsMap.has(g)) rowsMap.set(g, [])
    rowsMap.get(g).push(id)
  }
  const rowKeys = [...rowsMap.keys()].sort((a, b) => a - b)

  // ---- 2. 每層排序 ----
  const order = new Map() // id → x index(浮點)
  const spouseOf = (id) => (graph.spousesOf.get(id) || []).filter((s) => s.status !== 'divorced').map((s) => s.id)
  const byBirth = (a, b) => -compareAge(graph.persons.get(a), graph.persons.get(b)) || String(a).localeCompare(String(b))

  for (const g of rowKeys) {
    const rowIds = rowsMap.get(g)
    const placed = new Set()
    const sequence = []

    // 依「父母在上一層的平均位置」決定家庭單位的先後
    const parentKey = (id) => {
      const ps = (graph.parentsOf.get(id) || []).filter((p) => order.has(p))
      if (!ps.length) return Infinity
      return ps.reduce((s, p) => s + order.get(p), 0) / ps.length
    }
    const sorted = [...rowIds].sort((a, b) => {
      const ka = parentKey(a)
      const kb = parentKey(b)
      if (ka !== kb) return ka === Infinity ? 1 : kb === Infinity ? -1 : ka - kb
      if (a === viewpointId) return -1
      if (b === viewpointId) return 1
      return byBirth(a, b)
    })

    for (const id of sorted) {
      if (placed.has(id)) continue
      // 把「有父母在上一層」的血親放前面,配偶接在旁邊
      const unit = [id]
      placed.add(id)
      for (const s of spouseOf(id)) {
        if (rowIds.includes(s) && !placed.has(s)) {
          unit.push(s)
          placed.add(s)
        }
      }
      // 配偶排左或排右:男左女右的慣例;不確定就維持原順序
      unit.sort((a, b) => {
        const ga = graph.persons.get(a)?.gender
        const gb = graph.persons.get(b)?.gender
        if (ga === gb) return 0
        if (ga === 'male') return -1
        if (gb === 'male') return 1
        return 0
      })
      sequence.push(unit)
    }

    let x = 0
    for (const unit of sequence) {
      unit.forEach((id, i) => {
        order.set(id, x + i)
      })
      x += unit.length + 0.35 // 單位之間留一點空隙
    }
  }

  // ---- 3. 轉成座標並置中父母 ----
  const positions = new Map()
  const unitW = NODE_W + GAP_X
  for (const g of rowKeys) {
    for (const id of rowsMap.get(g)) {
      positions.set(id, { x: order.get(id) * unitW, y: 0 })
    }
  }
  // 由下往上:有孩子的「夫妻單位」置中到孩子中央
  for (let i = rowKeys.length - 1; i >= 0; i--) {
    const g = rowKeys[i]
    const rowIds = rowsMap.get(g)
    const shifted = new Set()
    for (const id of rowIds) {
      if (shifted.has(id)) continue
      const unit = [id, ...spouseOf(id).filter((s) => rowIds.includes(s) && !shifted.has(s))].sort((a, b) => positions.get(a).x - positions.get(b).x)
      const kids = new Set()
      for (const u of unit) for (const k of graph.childrenOf.get(u) || []) if (gen.get(k) === g + 1) kids.add(k)
      if (kids.size) {
        const xs = [...kids].map((k) => positions.get(k).x)
        const center = (Math.min(...xs) + Math.max(...xs)) / 2
        const unitCenter = (positions.get(unit[0]).x + positions.get(unit[unit.length - 1]).x) / 2
        const dx = center - unitCenter
        for (const u of unit) positions.get(u).x += dx
      }
      unit.forEach((u) => shifted.add(u))
    }
    // 解決同層重疊:由左到右推開
    const sortedRow = [...rowIds].sort((a, b) => positions.get(a).x - positions.get(b).x)
    for (let k = 1; k < sortedRow.length; k++) {
      const prev = positions.get(sortedRow[k - 1])
      const cur = positions.get(sortedRow[k])
      const isCouple = spouseOf(sortedRow[k]).includes(sortedRow[k - 1])
      const minGap = isCouple ? NODE_W + COUPLE_GAP : unitW
      if (cur.x < prev.x + minGap) cur.x = prev.x + minGap
    }
  }
  // y 座標
  rowKeys.forEach((g, i) => {
    for (const id of rowsMap.get(g)) positions.get(id).y = i * (NODE_H + GAP_Y)
  })
  // 整體平移讓最左為 0
  const minX = Math.min(...[...positions.values()].map((p) => p.x))
  for (const p of positions.values()) p.x -= minX

  return { positions, rows: rowsMap, unlinked }
}

/** 對不相連的人,以連通分量為單位計算相對世代,並疊在已有世代的下方 */
function assignComponentGenerations(graph, gen, unlinked) {
  const seen = new Set()
  let base = gen.size ? Math.max(...gen.values()) + 2 : 0
  for (const start of unlinked) {
    if (seen.has(start) || gen.has(start)) continue
    const local = new Map([[start, 0]])
    const queue = [start]
    seen.add(start)
    while (queue.length) {
      const id = queue.shift()
      const g = local.get(id)
      const visit = (nid, ng) => {
        if (local.has(nid) || gen.has(nid)) return
        local.set(nid, ng)
        seen.add(nid)
        queue.push(nid)
      }
      for (const p of graph.parentsOf.get(id) || []) visit(p, g - 1)
      for (const c of graph.childrenOf.get(id) || []) visit(c, g + 1)
      for (const s of graph.spousesOf.get(id) || []) visit(s.id, g)
    }
    const minLocal = Math.min(...local.values())
    let maxLocal = -Infinity
    for (const [id, g] of local) {
      const gg = base + (g - minLocal)
      gen.set(id, gg)
      maxLocal = Math.max(maxLocal, gg)
    }
    base = maxLocal + 2
  }
}
