import { describe, it, expect } from 'vitest'
import { buildGraph, computeAllRelationTerms } from './kinship/index.js'
import { layoutTree, NODE_W } from './treeLayout.js'
import { initial } from './format.js'

function family() {
  const people = []
  const parentChild = []
  const spouses = []
  let n = 0
  const P = (name, gender, birth_date) => {
    const id = `p${++n}`
    people.push({ id, name, gender, birth_date })
    return id
  }
  const gp = P('爺爺', 'male', '1940')
  const gm = P('奶奶', 'female', '1942')
  spouses.push({ person_a_id: gp, person_b_id: gm, status: 'married' })
  const dad = P('爸', 'male', '1965')
  const unc = P('叔', 'male', '1968')
  for (const c of [dad, unc]) for (const p of [gp, gm]) parentChild.push({ parent_id: p, child_id: c })
  const mom = P('媽', 'female', '1967')
  spouses.push({ person_a_id: dad, person_b_id: mom, status: 'married' })
  const me = P('我', 'male', '1990')
  const sis = P('妹', 'female', '1993')
  for (const c of [me, sis]) for (const p of [dad, mom]) parentChild.push({ parent_id: p, child_id: c })
  const cousin = P('堂弟', 'male', '1995')
  parentChild.push({ parent_id: unc, child_id: cousin })
  const wife = P('妻', 'female', '1991')
  spouses.push({ person_a_id: me, person_b_id: wife, status: 'married' })
  const kid = P('兒', 'male', '2016')
  for (const p of [me, wife]) parentChild.push({ parent_id: p, child_id: kid })
  const stranger = P('無關者', 'unspecified', null)
  return { graph: buildGraph({ people, parentChild, spouses }), ids: { gp, gm, dad, unc, mom, me, sis, cousin, wife, kid, stranger } }
}

describe('treeLayout', () => {
  const { graph, ids } = family()
  const terms = computeAllRelationTerms(ids.me, graph)
  const { positions, unlinked } = layoutTree(graph, terms, ids.me)

  it('每個人都有座標;不相連者列入 unlinked 並排在最下方', () => {
    for (const id of graph.persons.keys()) expect(positions.has(id)).toBe(true)
    expect(unlinked).toEqual([ids.stranger])
    const maxY = Math.max(...Object.values(ids).filter((i) => i !== ids.stranger).map((i) => positions.get(i).y))
    expect(positions.get(ids.stranger).y).toBeGreaterThan(maxY)
  })
  it('父母在子女上方、同輩同一列、配偶同一列', () => {
    expect(positions.get(ids.dad).y).toBeLessThan(positions.get(ids.me).y)
    expect(positions.get(ids.gp).y).toBeLessThan(positions.get(ids.dad).y)
    expect(positions.get(ids.me).y).toBe(positions.get(ids.sis).y)
    expect(positions.get(ids.me).y).toBe(positions.get(ids.cousin).y)
    expect(positions.get(ids.me).y).toBe(positions.get(ids.wife).y)
    expect(positions.get(ids.kid).y).toBeGreaterThan(positions.get(ids.me).y)
  })
  it('同一列的節點不重疊', () => {
    const rows = new Map()
    for (const [id, p] of positions) {
      if (!rows.has(p.y)) rows.set(p.y, [])
      rows.get(p.y).push(p.x)
    }
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b)
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(NODE_W)
    }
  })
  it('配偶相鄰(男左女右)', () => {
    const xs = [...positions.entries()].filter(([, p]) => p.y === positions.get(ids.me).y).sort((a, b) => a[1].x - b[1].x).map(([id]) => id)
    const i = xs.indexOf(ids.me)
    expect(xs[i + 1]).toBe(ids.wife)
    const gxs = [...positions.entries()].filter(([, p]) => p.y === positions.get(ids.gp).y).sort((a, b) => a[1].x - b[1].x).map(([id]) => id)
    expect(gxs).toEqual([ids.gp, ids.gm])
  })
  it('沒有視角時也能排版(以連通分量的相對世代)', () => {
    const { positions: pos } = layoutTree(graph, new Map(), null)
    for (const id of graph.persons.keys()) expect(pos.has(id)).toBe(true)
    expect(pos.get(ids.gp).y).toBeLessThan(pos.get(ids.dad).y)
    expect(pos.get(ids.dad).y).toBeLessThan(pos.get(ids.me).y)
  })
  it('空圖不會出錯', () => {
    const r = layoutTree(buildGraph({}), new Map(), null)
    expect(r.positions.size).toBe(0)
  })
})

describe('format.initial', () => {
  it('中文取最後一字、英文取首字母', () => {
    expect(initial('林小明')).toBe('明')
    expect(initial('kenneth')).toBe('K')
    expect(initial('')).toBe('?')
  })
})
