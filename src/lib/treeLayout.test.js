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
  it('兄弟姊妹相鄰、依長幼由左到右;父母置中在孩子上方', () => {
    const row = [...positions.entries()].filter(([, p]) => p.y === positions.get(ids.me).y).sort((a, b) => a[1].x - b[1].x).map(([id]) => id)
    const i = row.indexOf(ids.me)
    expect(row.slice(i, i + 3)).toEqual([ids.me, ids.wife, ids.sis]) // 我 + 配偶是一個單位,妹妹緊接在後
    expect(positions.get(ids.dad).x).toBeLessThan(positions.get(ids.unc).x) // 爸(1965)比叔(1968)年長,排左
    const kidsCenter = (positions.get(ids.me).x + positions.get(ids.sis).x + NODE_W) / 2
    const parentsCenter = (positions.get(ids.dad).x + positions.get(ids.mom).x + NODE_W) / 2
    expect(Math.abs(kidsCenter - parentsCenter)).toBeLessThan(NODE_W)
  })
  it('視角本人在自己那一列是排版的圓心(x 座標為該列中央附近的固定點)', () => {
    // 所有人平移後最左為 0,因此看「我」與孩子 / 父母的相對位置:孩子在正下方
    expect(Math.abs(positions.get(ids.kid).x - (positions.get(ids.me).x + positions.get(ids.wife).x) / 2)).toBeLessThan(NODE_W)
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

describe('treeLayout:前任與姻親', () => {
  const people = []
  const parentChild = []
  const spouses = []
  let n = 0
  const P = (name, gender, birth_date) => {
    const id = `q${++n}`
    people.push({ id, name, gender, birth_date })
    return id
  }
  const dad = P('爸', 'male', '1965')
  const mom = P('媽', 'female', '1967')
  const ex = P('前妻', 'female', '1966')
  const gp = P('爺', 'male', '1940')
  const mgp = P('外公', 'male', '1941')
  const mgm = P('外婆', 'female', '1943')
  spouses.push({ person_a_id: dad, person_b_id: mom, status: 'married' }, { person_a_id: dad, person_b_id: ex, status: 'divorced' }, { person_a_id: mgp, person_b_id: mgm, status: 'married' })
  parentChild.push({ parent_id: gp, child_id: dad }, { parent_id: mgp, child_id: mom }, { parent_id: mgm, child_id: mom })
  const me = P('我', 'male', '1990')
  const half = P('半血緣哥', 'male', '1988')
  parentChild.push({ parent_id: dad, child_id: me }, { parent_id: mom, child_id: me }, { parent_id: dad, child_id: half }, { parent_id: ex, child_id: half })
  const stranger = P('無關', 'male', '1990')
  const graph = buildGraph({ people, parentChild, spouses })
  const terms = computeAllRelationTerms(me, graph)
  const { positions } = layoutTree(graph, terms, me)
  const rowOf = (id) => [...positions.entries()].filter(([, p]) => p.y === positions.get(id).y).sort((a, b) => a[1].x - b[1].x).map(([x]) => x)

  it('現任配偶黏在一起,前任排在旁邊、不插進中間', () => {
    const row = rowOf(dad)
    const i = row.indexOf(dad)
    expect(row[i + 1]).toBe(mom)
    expect(row[i - 1]).toBe(ex)
  })
  it('爸爸的父母排左、媽媽的父母排右(跟夫妻的左右一致)', () => {
    expect(positions.get(gp).x).toBeLessThan(positions.get(mgp).x)
    expect(rowOf(mgp)).toEqual([gp, mgp, mgm])
  })
  it('半血緣哥哥在爸爸與前妻下方、我在爸媽下方,不相連者排最下面', () => {
    expect(positions.get(half).x).toBeLessThan(positions.get(me).x)
    expect(positions.get(stranger).y).toBeGreaterThan(positions.get(me).y)
  })
})

describe('format.initial', () => {
  it('中文取最後一字、英文取首字母', () => {
    expect(initial('林小明')).toBe('明')
    expect(initial('kenneth')).toBe('K')
    expect(initial('')).toBe('?')
  })
})
