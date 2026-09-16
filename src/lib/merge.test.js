import { describe, it, expect } from 'vitest'
import { bridgeRows, linkDescription, resolveSamePerson, findSamePersonCandidates } from './merge.js'
import { buildGraph, computeRelationTerm } from './kinship/index.js'

describe('合併家族樹:同一人', () => {
  const sources = [{ id: 'A', name: '林家' }, { id: 'B', name: '陳家' }]
  const people = [
    { id: 'a1', name: '林大明', gender: 'male', birth_date: '1960', family_id: 'A', nicknames: [] },
    { id: 'a2', name: '林小美', gender: 'female', family_id: 'A', nicknames: ['美美'] },
    { id: 'b1', name: '林大明', gender: 'male', birth_date: '1960', family_id: 'B', nicknames: ['阿明'], tags: ['ADHD'] },
    { id: 'b2', name: '美美', gender: 'female', family_id: 'B', nicknames: [] },
    { id: 'b3', name: '陳志明', gender: 'male', family_id: 'B', nicknames: [] },
  ]
  it('找出同名與小名相符的配對,已決定的不再列出', () => {
    const c = findSamePersonCandidates(people, sources, [])
    expect(c.map((x) => [x.a.id, x.b.id, x.reason])).toEqual([
      ['a1', 'b1', '姓名相同'],
      ['a2', 'b2', '一方的小名等於另一方的姓名'],
    ])
    expect(c[0].hints).toEqual(['性別相同', '出生年相同'])
    const after = findSamePersonCandidates(people, sources, [{ relation: 'not_same_person', person_a_id: 'a2', person_b_id: 'b2' }, { relation: 'same_person', person_a_id: 'a1', person_b_id: 'b1' }])
    expect(after).toEqual([])
  })
  it('resolveSamePerson:b 併進 a,關係改指向 a 並去重,欄位取聯集 / 補空', () => {
    const tree = {
      people,
      parentChild: [
        { id: 'p1', parent_id: 'a1', child_id: 'a2' },
        { id: 'p2', parent_id: 'b1', child_id: 'b3' },
        { id: 'p3', parent_id: 'b1', child_id: 'b2' },
      ],
      spouses: [],
      entries: [{ id: 'e1', person_id: 'b1', title: '開雜貨店' }],
      pets: [{ id: 'pet1', owner_person_id: 'b1' }],
      households: [{ id: 'h1', person_ids: ['b1', 'b3'] }],
    }
    const links = [{ relation: 'same_person', person_a_id: 'a1', person_b_id: 'b1' }, { relation: 'same_person', person_a_id: 'a2', person_b_id: 'b2' }]
    const r = resolveSamePerson(tree, links)
    expect(r.people.map((p) => p.id)).toEqual(['a1', 'a2', 'b3'])
    const a1 = r.people.find((p) => p.id === 'a1')
    expect(a1.aliases).toEqual([{ id: 'b1', family_id: 'B', name: '林大明' }])
    expect(a1.nicknames).toEqual(['阿明'])
    expect(a1.tags).toEqual(['ADHD'])
    const a2 = r.people.find((p) => p.id === 'a2')
    expect(a2.nicknames).toEqual(['美美']) // b2 的名字「美美」已在小名裡,不重複
    // b1 → a2 與 a1 → a2 去重成一條;b1 → b3 變 a1 → b3
    expect(r.parentChild.map((x) => `${x.parent_id}>${x.child_id}`).sort()).toEqual(['a1>a2', 'a1>b3'])
    expect(r.entries[0].person_id).toBe('a1')
    expect(r.pets[0].owner_person_id).toBe('a1')
    expect(r.households[0].person_ids).toEqual(['a1', 'b3'])
    // 稱謂:a2 現在有 b3 這個(半)兄弟
    const g = buildGraph({ people: r.people, parentChild: r.parentChild, spouses: r.spouses })
    expect(computeRelationTerm('a2', 'b3', g)?.term).toMatch(/兄弟|哥哥|弟弟/)
  })
  it('三個來源:每兩家之間都比對;同一人可以串接(c 併進 b、b 併進 a → 都指向 a)', () => {
    const three = [...sources, { id: 'C', name: '王家' }]
    const ppl = [...people, { id: 'c1', name: '林大明', gender: 'male', family_id: 'C', nicknames: ['明仔'] }]
    const c = findSamePersonCandidates(ppl, three, [])
    expect(c.map((x) => [x.a.id, x.b.id])).toEqual(expect.arrayContaining([['a1', 'b1'], ['a1', 'c1'], ['b1', 'c1']]))
    // b1 已併進 a1 後,b1 不再比對,但 a1 仍會跟 c1 比
    const after = findSamePersonCandidates(ppl, three, [{ relation: 'same_person', person_a_id: 'a1', person_b_id: 'b1' }])
    expect(after.map((x) => [x.a.id, x.b.id])).toEqual(expect.arrayContaining([['a1', 'c1'], ['a2', 'b2']]))
    expect(after.some((x) => x.a.id === 'b1' || x.b.id === 'b1')).toBe(false)
    // 串接:c1 → b1 → a1
    const r = resolveSamePerson(
      { people: ppl, parentChild: [{ id: 'p', parent_id: 'c1', child_id: 'b3' }], spouses: [], entries: [], pets: [], households: [] },
      [{ relation: 'same_person', person_a_id: 'a1', person_b_id: 'b1' }, { relation: 'same_person', person_a_id: 'b1', person_b_id: 'c1' }],
    )
    expect(r.people.map((p) => p.id)).toEqual(['a1', 'a2', 'b2', 'b3'])
    const a1 = r.people.find((p) => p.id === 'a1')
    expect(a1.aliases.map((x) => x.id).sort()).toEqual(['b1', 'c1'])
    expect(a1.nicknames).toEqual(['阿明', '明仔'])
    expect(r.parentChild[0]).toMatchObject({ parent_id: 'a1', child_id: 'b3' })
  })
})

const link = (over) => ({ id: 'L1', merged_family_id: 'M', person_a_id: 'a', person_b_id: 'b', created_at: '2026-01-01T00:00:00Z', created_by: null, ...over })

describe('合併家族樹:橋接關係 → 圖', () => {
  it('spouse:保留狀態,方向無關', () => {
    const { spouses, parentChild } = bridgeRows([link({ relation: 'spouse', status: 'partner' })], 'M')
    expect(parentChild).toEqual([])
    expect(spouses).toHaveLength(1)
    expect(spouses[0]).toMatchObject({ id: 'link-L1', family_id: 'M', person_a_id: 'a', person_b_id: 'b', status: 'partner', bridge: true })
  })
  it("parent_side = 'a':產生碼那一方的人是父母", () => {
    const { parentChild } = bridgeRows([link({ relation: 'parent_child', parent_side: 'a' })], 'M')
    expect(parentChild[0]).toMatchObject({ parent_id: 'a', child_id: 'b' })
  })
  it("parent_side = 'b':輸入碼那一方的人是父母", () => {
    const { parentChild } = bridgeRows([link({ relation: 'parent_child', parent_side: 'b' })], 'M')
    expect(parentChild[0]).toMatchObject({ parent_id: 'b', child_id: 'a' })
  })
  it('兩個家族接起來後稱謂引擎能跨橋推算', () => {
    // 家族 A:阿公 → 爸爸;家族 B:媽媽 → 我。橋:爸爸(a,產生碼方)是 我(b)的父母
    const people = [
      { id: 'gp', name: '阿公', gender: 'male', family_id: 'A' },
      { id: 'dad', name: '爸', gender: 'male', family_id: 'A' },
      { id: 'mom', name: '媽', gender: 'female', family_id: 'B' },
      { id: 'me', name: '我', gender: 'male', family_id: 'B' },
    ]
    const parentChild = [
      { parent_id: 'gp', child_id: 'dad' },
      { parent_id: 'mom', child_id: 'me' },
    ]
    const bridges = bridgeRows([link({ relation: 'parent_child', parent_side: 'a', person_a_id: 'dad', person_b_id: 'me' })], 'M')
    const g = buildGraph({ people, parentChild: [...parentChild, ...bridges.parentChild], spouses: [] })
    expect(computeRelationTerm('me', 'dad', g)?.term).toBe('爸爸')
    expect(computeRelationTerm('me', 'gp', g)?.term).toBe('爺爺')
    expect(computeRelationTerm('me', 'mom', g)?.term).toBe('媽媽')
    expect(computeRelationTerm('gp', 'me', g)?.term).toBe('孫子')
  })
  it('linkDescription', () => {
    expect(linkDescription({ family_name: '林家', person_name: '林大明', person_gender: 'male', relation: 'parent_child', is_parent: true })).toBe('林家的 林大明 是對方所選人物的爸爸')
    expect(linkDescription({ family_name: '林家', person_name: '林小美', relation: 'spouse', status: 'married' })).toBe('林家的 林小美 是對方所選人物的已婚配偶 / 伴侶')
    expect(linkDescription({ person_name: '小孩', relation: 'parent_child', is_parent: false })).toBe('小孩 是對方所選人物的小孩')
  })
})
