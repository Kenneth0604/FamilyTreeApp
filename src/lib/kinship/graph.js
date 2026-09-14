/**
 * 家族圖(純資料、無副作用)
 *
 * 圖上只有兩種邊:
 *  - parent_child(有方向:parent → child)
 *  - spouse(無方向;status = married / divorced / widowed)
 * 其他所有關係(兄弟姊妹、叔伯、堂表…)都靠最短路徑推算,不另外儲存。
 */

/**
 * @typedef {{ id:string, name:string, gender:'male'|'female'|'unspecified', birth_date?:string|null, is_deceased?:boolean }} Person
 * @typedef {{ parent_id:string, child_id:string }} ParentChildRow
 * @typedef {{ person_a_id:string, person_b_id:string, status?:'married'|'divorced'|'widowed' }} SpouseRow
 * @typedef {{ persons: Map<string, Person>, parentsOf: Map<string, string[]>, childrenOf: Map<string, string[]>, spousesOf: Map<string, {id:string,status:string}[]> }} Graph
 * @typedef {{ type:'up'|'down'|'spouse', from:string, to:string }} Step
 */

/**
 * 把資料表列組成圖。找不到對應人物的邊會被忽略(資料不一致時不要崩潰)。
 * @param {{ people: Person[], parentChild: ParentChildRow[], spouses: SpouseRow[] }} rows
 * @returns {Graph}
 */
export function buildGraph({ people = [], parentChild = [], spouses = [] }) {
  const persons = new Map()
  for (const p of people) persons.set(p.id, p)

  const parentsOf = new Map()
  const childrenOf = new Map()
  const spousesOf = new Map()
  const push = (map, key, value) => {
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(value)
  }

  for (const r of parentChild) {
    if (!persons.has(r.parent_id) || !persons.has(r.child_id) || r.parent_id === r.child_id) continue
    push(parentsOf, r.child_id, r.parent_id)
    push(childrenOf, r.parent_id, r.child_id)
  }
  for (const s of spouses) {
    if (!persons.has(s.person_a_id) || !persons.has(s.person_b_id) || s.person_a_id === s.person_b_id) continue
    const status = s.status || 'married'
    push(spousesOf, s.person_a_id, { id: s.person_b_id, status })
    push(spousesOf, s.person_b_id, { id: s.person_a_id, status })
  }
  return { persons, parentsOf, childrenOf, spousesOf }
}

/**
 * 從 fromId 出發做 BFS(parent_child 邊雙向可走、spouse 邊可走但離婚的不走)。
 * 同一層若有多條等長路徑,優先選「經過 spouse 邊最少」的(純血緣優先)。
 * 因為每一層處理完才進下一層,同層節點的 prev 都已定案,所以只在同 dist 時比較 spouse 數即可。
 *
 * @param {Graph} graph
 * @param {string} fromId
 * @param {{ toId?: string }} [opts] 指定 toId 時,找到目標所在層就停止
 * @returns {Map<string, { dist:number, spouses:number, prev:string|null, step:Step['type']|null }>}
 */
export function bfs(graph, fromId, { toId } = {}) {
  const best = new Map()
  if (!graph.persons.has(fromId)) return best
  best.set(fromId, { dist: 0, spouses: 0, prev: null, step: null })
  let frontier = [fromId]
  while (frontier.length) {
    const next = []
    for (const id of frontier) {
      const cur = best.get(id)
      const relax = (nid, type) => {
        const isSpouse = type === 'spouse'
        const cand = { dist: cur.dist + 1, spouses: cur.spouses + (isSpouse ? 1 : 0), prev: id, step: type }
        const ex = best.get(nid)
        if (!ex) {
          best.set(nid, cand)
          next.push(nid)
        } else if (ex.dist === cand.dist && cand.spouses < ex.spouses) {
          best.set(nid, cand)
        }
      }
      for (const p of graph.parentsOf.get(id) || []) relax(p, 'up')
      for (const c of graph.childrenOf.get(id) || []) relax(c, 'down')
      for (const s of graph.spousesOf.get(id) || []) if (s.status !== 'divorced') relax(s.id, 'spouse')
    }
    if (toId && best.has(toId)) break
    frontier = next
  }
  return best
}

/**
 * 從 bfs 結果還原 from → to 的原子步驟序列
 * @returns {Step[]|null} 不可達時回傳 null
 */
export function pathFromBfs(best, toId) {
  if (!best.has(toId)) return null
  const steps = []
  let cur = toId
  while (true) {
    const node = best.get(cur)
    if (!node.prev) break
    steps.unshift({ type: node.step, from: node.prev, to: cur })
    cur = node.prev
  }
  return steps
}

/**
 * 找 fromId → toId 的最短路徑(純血緣優先)
 * @returns {Step[]|null}
 */
export function shortestPath(graph, fromId, toId) {
  if (!graph.persons.has(fromId) || !graph.persons.has(toId)) return null
  return pathFromBfs(bfs(graph, fromId, { toId }), toId)
}

/** 路徑的世代差:往下 +1、往上 -1、配偶 0(負數 = 長輩) */
export function generationOfPath(steps) {
  let g = 0
  for (const s of steps) {
    if (s.type === 'up') g -= 1
    else if (s.type === 'down') g += 1
  }
  return g
}
