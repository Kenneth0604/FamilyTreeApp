import { describe, it, expect } from 'vitest'
import { buildTimeline, groupByDecade, shortDate } from './timeline.js'

const people = [
  { id: 'a', name: '王大明', birth_date: '1950-05-02', is_deceased: true, death_date: '2020-03' },
  { id: 'b', name: '陳美玲', married_surname: '王', birth_date: '1952' },
  { id: 'c', name: '王小華', birth_date: '1980-05-02' },
  { id: 'x', name: '沒生日' },
]
const entries = [
  { id: 'e1', person_id: 'a', category: 'career', title: '開設雜貨店', start_date: '1975-06' },
  { id: 'e2', person_id: 'c', category: 'education', title: '大學畢業', start_date: '2002' },
  { id: 'e3', person_id: 'c', category: 'event', title: '沒日期' },
  { id: 'e4', person_id: 'gone', category: 'event', title: '人不見了', start_date: '1999' },
]
const pets = [{ id: 'p1', name: '小黑', species: 'dog', birth_date: '2010', owner_person_id: 'c' }]

describe('timeline', () => {
  const t = buildTimeline(people, entries, pets)
  it('由舊到新排序,略過沒有日期或找不到人的項目', () => {
    expect(t.map((x) => x.id)).toEqual(['b-a', 'b-b', 'e-e1', 'b-c', 'e-e2', 'p-p1', 'd-a'])
  })
  it('冠夫姓、享年與事件當時年齡', () => {
    expect(t.find((x) => x.id === 'b-b').title).toBe('王陳美玲 出生')
    expect(t.find((x) => x.id === 'd-a').sub).toBe('享年 69 歲')
    expect(t.find((x) => x.id === 'e-e1').sub).toBe('王大明 · 25 歲 · 職業經歷')
    expect(t.find((x) => x.id === 'p-p1').sub).toBe('狗 · 王小華 的寵物')
  })
  it('同一年:出生排在逝世前', () => {
    const s = buildTimeline([{ id: 'q', name: 'Q', birth_date: '2000', is_deceased: true, death_date: '2000' }, { id: 'r', name: 'R', birth_date: '2000' }])
    expect(s.map((x) => x.kind)).toEqual(['birth', 'birth', 'death'])
  })
  it('依年代分組與日期顯示', () => {
    const g = groupByDecade(t)
    expect(g.map((x) => x.decade)).toEqual([1950, 1970, 1980, 2000, 2010, 2020])
    expect(shortDate(t[0])).toBe('1950.5.2')
    expect(shortDate(t[1])).toBe('1952')
  })
})
