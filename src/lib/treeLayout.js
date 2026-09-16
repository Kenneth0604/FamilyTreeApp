/**
 * 家族樹排版:以 viewpoint 為中心、依世代分層,家庭單位緊貼、親近的人排在一起
 *
 * 做法(簡化版 Sugiyama 分層排版,單位是「夫妻」而不是個人):
 * 1. 分層   row = 每個人相對 viewpoint 的世代差(稱謂引擎 BFS 的結果;不相連的人依連通分量往下疊)
 * 2. 成組   同一層裡有現任配偶 / 伴侶關係的人黏成一個「單位」(unit),之後所有步驟都以單位為原子,
 *          所以配偶 / 伴侶保證相鄰、永遠不會被別人插在中間。離婚 / 前伴侶不黏,但排序時會盡量放隔壁
 * 3. 排序   每層單位的左右順序用「重心法」反覆掃描:往下掃時把每個單位排到父母單位的正下方(同父母的
 *          兄弟姊妹依長幼排),往上掃時排到孩子的正上方;來回幾次後,親戚就聚在一起、交叉線最少
 * 4. 座標   順序決定後再用「優先權法」定 x:視角本人固定在 0(圓心),其他單位依連線多寡為優先權,
 *          輪流靠向父母 / 孩子的中央,但絕不改變第 3 步定好的順序、也不重疊
 *
 * 不引入圖形排版庫,足以應付一般家族(數十到數百人)。
 */
import { compareSiblings } from './kinship/birth.js'
import { isActiveSpouse } from './kinship/graph.js'

export const NODE_W = 132
export const NODE_H = 182
const GAP_X = 28
const GAP_Y = 90
const COUPLE_GAP = 12
const ORDER_SWEEPS = 6
const COORD_SWEEPS = 3

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
  if (unlinked.length) assignComponentGenerations(graph, gen, unlinked)

  const rowsMap = new Map()
  for (const [id, g] of gen) {
    if (!rowsMap.has(g)) rowsMap.set(g, [])
    rowsMap.get(g).push(id)
  }
  const rowKeys = [...rowsMap.keys()].sort((a, b) => a - b)
  const rowIndex = new Map(rowKeys.map((g, i) => [g, i]))

  // ---- 2. 成組:同層的現任配偶黏成單位 ----
  const activeSpouses = (id) => (graph.spousesOf.get(id) || []).filter((s) => isActiveSpouse(s.status)).map((s) => s.id)
  const unitOf = new Map() // person id → unit
  const layers = rowKeys.map(() => []) // rowIndex → unit[]
  for (const g of rowKeys) {
    for (const id of rowsMap.get(g)) {
      if (unitOf.has(id)) continue
      const members = collectUnit(id, (x) => activeSpouses(x).filter((s) => gen.get(s) === g))
      const unit = { members: orderMembers(members, graph), row: rowIndex.get(g), idx: 0, x: 0, w: 0, up: new Map(), down: new Map(), side: new Set(), childRank: new Map() }
      unit.w = unit.members.length * NODE_W + (unit.members.length - 1) * COUPLE_GAP
      for (const m of unit.members) unitOf.set(m, unit)
      layers[unit.row].push(unit)
    }
  }
  // 單位之間的連線:up / down = 親子(值 = 幾條邊),side = 已結束的配偶關係(同層,排序時盡量放隔壁)
  const bump = (map, key) => map.set(key, (map.get(key) || 0) + 1)
  for (const unit of unitOf.values()) {
    if (unit.up.size || unit.down.size || unit.side.size) continue // 同一單位會被每個成員各走一次,只算一次
    for (const m of unit.members) {
      for (const p of graph.parentsOf.get(m) || []) {
        const pu = unitOf.get(p)
        if (pu && pu.row === unit.row - 1) bump(unit.up, pu)
      }
      for (const c of graph.childrenOf.get(m) || []) {
        const cu = unitOf.get(c)
        if (cu && cu.row === unit.row + 1) bump(unit.down, cu)
      }
      for (const s of graph.spousesOf.get(m) || []) {
        const su = unitOf.get(s.id)
        if (su && su !== unit && su.row === unit.row) unit.side.add(su)
      }
    }
  }
  // 同一組父母底下的孩子依長幼排(生日,再看排行):每個父母單位記下每個孩子的名次(0–1)
  const byBirth = (a, b) => -compareSiblings(graph.persons.get(a), graph.persons.get(b)) || String(a).localeCompare(String(b))
  for (const unit of unitOf.values()) {
    if (unit.childRank.size || !unit.down.size) continue
    const kids = new Set()
    for (const m of unit.members) for (const c of graph.childrenOf.get(m) || []) if (unitOf.get(c)?.row === unit.row + 1) kids.add(c)
    const sorted = [...kids].sort(byBirth)
    sorted.forEach((k, i) => unit.childRank.set(k, sorted.length > 1 ? i / (sorted.length - 1) : 0.5))
  }
  /** 孩子單位相對於父母單位 pu 的長幼名次 0–1(單位裡可能不只一個成員是 pu 的孩子,取平均) */
  const rankUnder = (unit, pu) => {
    const ranks = unit.members.map((m) => pu.childRank.get(m)).filter((r) => r != null)
    return ranks.length ? ranks.reduce((a, b) => a + b, 0) / ranks.length : 0.5
  }
  /** 父母單位 pu 的孩子在孩子單位 unit 裡靠左還是靠右 0–1(夫妻各自的父母:先生的父母排左、太太的父母排右) */
  const sideIn = (unit, pu) => {
    const n = unit.members.length
    const pos = unit.members.map((m, i) => (pu.childRank.has(m) ? (n > 1 ? i / (n - 1) : 0.5) : null)).filter((r) => r != null)
    return pos.length ? pos.reduce((a, b) => a + b, 0) / pos.length : 0.5
  }

  // ---- 3. 排序 ----
  // 3a. 初始順序:從視角的單位出發 BFS(先配偶側、再父母、再孩子),先被走到的排前面;其他連通分量接在後面
  const startUnit = (viewpointId && unitOf.get(viewpointId)) || layers.find((l) => l.length)?.[0]
  const visitOrder = new Map()
  const bfsQueue = []
  const enqueue = (u) => {
    if (u && !visitOrder.has(u)) {
      visitOrder.set(u, visitOrder.size)
      bfsQueue.push(u)
    }
  }
  enqueue(startUnit)
  while (bfsQueue.length) {
    const u = bfsQueue.shift()
    for (const s of u.side) enqueue(s)
    for (const p of u.up.keys()) enqueue(p)
    const kids = [...u.down.keys()].sort((a, b) => rankUnder(a, u) - rankUnder(b, u))
    for (const k of kids) enqueue(k)
  }
  for (const layer of layers) for (const u of layer) enqueue(u) // 沒走到的(其他連通分量)
  const reindex = (layer) => layer.forEach((u, i) => (u.idx = i))
  for (const layer of layers) {
    layer.sort((a, b) => visitOrder.get(a) - visitOrder.get(b))
    reindex(layer)
  }
  /** 前任 / 姻親單位 u 要排在對方單位 s 的哪一邊:對方本人在 s 裡偏左就排左(-0.5),偏右就排右(+0.5) */
  const sideOffset = (u, s) => {
    const linked = s.members.findIndex((m) => (graph.spousesOf.get(m) || []).some((x) => u.members.includes(x.id)))
    return linked >= 0 && s.members.length > 1 && linked / (s.members.length - 1) < 0.5 ? -0.5 : 0.5
  }

  /** 「嫁 / 娶進來」的前任:樹上沒有自己的父母、只靠已結束的關係連著 → 一律黏在對方隔壁,不跟著孩子跑 */
  const gluedTo = (u) => (!u.up.size && u.side.size ? [...u.side][0] : null)

  // 3b. 重心法來回掃描(u.idx = 單位在自己那一層目前的序號)
  const reorder = (layer, neighbours, rankOf) => {
    const key = new Map()
    for (const u of layer) {
      const anchor = gluedTo(u)
      if (anchor) {
        key.set(u, anchor.idx + sideOffset(u, anchor)) // 前任:排在對方隔壁、靠對方那一側
        continue
      }
      const ns = neighbours(u)
      let total = 0
      let weight = 0
      for (const [n, w] of ns) {
        total += (n.idx + rankOf(u, n) * 0.5) * w // 父母 / 孩子的序號 + 長幼(或左右)的微小偏移
        weight += w
      }
      key.set(u, weight ? total / weight : u.idx)
    }
    layer.sort((a, b) => key.get(a) - key.get(b) || a.idx - b.idx)
    reindex(layer)
  }
  for (let sweep = 0; sweep < ORDER_SWEEPS; sweep++) {
    for (let i = 1; i < layers.length; i++) reorder(layers[i], (u) => u.up, (u, p) => rankUnder(u, p))
    for (let i = layers.length - 2; i >= 0; i--) reorder(layers[i], (u) => u.down, (p, u) => sideIn(u, p))
  }

  // ---- 4. 座標:優先權法 ----
  // 先緊密排好當起點
  for (const layer of layers) {
    let x = 0
    for (const u of layer) {
      u.x = x + u.w / 2
      x += u.w + GAP_X
    }
  }
  const centerOf = (ns) => {
    let total = 0
    let weight = 0
    for (const [n, w] of ns) {
      total += n.x * w
      weight += w
    }
    return weight ? total / weight : null
  }
  const desiredBeside = (u) => {
    // 前任、沒有親子連線的單位:靠到對方隔壁
    const s = [...u.side][0]
    if (!s) return u.x
    const dir = u.idx < s.idx ? -1 : 1
    return s.x + dir * (s.w / 2 + GAP_X + u.w / 2)
  }
  const place = (layer, neighbours) => {
    const desired = layer.map((u) => (u.members.includes(viewpointId) ? 0 : gluedTo(u) ? desiredBeside(u) : centerOf(neighbours(u)) ?? desiredBeside(u)))
    // 優先權 = 連線數;視角本人最高(固定在 0),黏著對方的前任最低(等對方定位後再靠過去)
    const priority = layer.map((u) => (u.members.includes(viewpointId) ? Infinity : gluedTo(u) ? 0.5 : [...neighbours(u).values()].reduce((a, b) => a + b, 0)))
    placeLayer(layer, desired, priority)
  }
  for (let sweep = 0; sweep < COORD_SWEEPS; sweep++) {
    for (let i = 1; i < layers.length; i++) place(layers[i], (u) => u.up)
    for (let i = layers.length - 2; i >= 0; i--) place(layers[i], (u) => u.down)
  }
  // 收尾:從視角那一列往外推 —— 長輩置中在自己的後代上方、後代置中在父母下方,視角那一列兼顧上下
  const vRow = startUnit.row
  place(layers[vRow], (u) => new Map([...u.up, ...u.down]))
  for (let i = vRow - 1; i >= 0; i--) place(layers[i], (u) => u.down)
  for (let i = vRow + 1; i < layers.length; i++) place(layers[i], (u) => u.up)

  // ---- 輸出 ----
  const positions = new Map()
  for (const layer of layers) {
    for (const u of layer) {
      let x = u.x - u.w / 2
      for (const m of u.members) {
        positions.set(m, { x, y: u.row * (NODE_H + GAP_Y) })
        x += NODE_W + COUPLE_GAP
      }
    }
  }
  const minX = Math.min(...[...positions.values()].map((p) => p.x))
  for (const p of positions.values()) p.x -= minX

  return { positions, rows: rowsMap, unlinked }
}

/** 從 id 出發,沿 next(id) 給的鄰居收集成一個單位(配偶鏈:A–B–C 都黏在一起) */
function collectUnit(id, next) {
  const members = [id]
  const seen = new Set(members)
  for (let i = 0; i < members.length; i++) {
    for (const s of next(members[i])) {
      if (!seen.has(s)) {
        seen.add(s)
        members.push(s)
      }
    }
  }
  return members
}

/**
 * 單位內的左右順序:兩人 → 男左女右(慣例;不確定就維持原順序);
 * 三人以上(配偶鏈,例如喪偶後再婚)→ 從鏈的一端走到另一端,每對配偶都相鄰
 */
function orderMembers(members, graph) {
  if (members.length <= 1) return members
  if (members.length === 2) {
    const [a, b] = members
    const ga = graph.persons.get(a)?.gender
    const gb = graph.persons.get(b)?.gender
    if (ga !== gb && gb === 'male') return [b, a]
    return members
  }
  const set = new Set(members)
  const linked = (id) => (graph.spousesOf.get(id) || []).map((s) => s.id).filter((s) => set.has(s))
  const start = members.find((m) => linked(m).length === 1) || members[0]
  const out = [start]
  const seen = new Set(out)
  while (out.length < members.length) {
    const nxt = linked(out[out.length - 1]).find((s) => !seen.has(s)) || members.find((m) => !seen.has(m))
    seen.add(nxt)
    out.push(nxt)
  }
  return out
}

/**
 * 優先權法:依優先權高→低逐一把單位放到想要的位置,但只能在「已放好的高優先權單位」留下的空間內移動,
 * 所以左右順序不變、也不會重疊;中間還沒放的低優先權單位一定塞得進去(空間有預留)
 */
function placeLayer(layer, desired, priority) {
  const n = layer.length
  const fixed = new Array(n).fill(false)
  const order = layer.map((_, i) => i).sort((a, b) => priority[b] - priority[a] || a - b)
  for (const i of order) {
    let lo = -Infinity
    let hi = Infinity
    let span = 0
    for (let j = i - 1; j >= 0; j--) {
      span += layer[j].w + GAP_X
      if (fixed[j]) {
        lo = Math.max(lo, layer[j].x - layer[j].w / 2 + span + layer[i].w / 2)
        break
      }
    }
    span = 0
    for (let j = i + 1; j < n; j++) {
      span += layer[j].w + GAP_X
      if (fixed[j]) {
        hi = Math.min(hi, layer[j].x + layer[j].w / 2 - span - layer[i].w / 2)
        break
      }
    }
    layer[i].x = Math.min(hi, Math.max(lo, desired[i]))
    fixed[i] = true
  }
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
