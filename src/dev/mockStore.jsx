// 開發用假資料層:讓 Tree 不需要 Supabase 也能在瀏覧器裡跑(vite.harness.config.js 會把 lib/store.jsx 換成這個)
import { useMemo } from 'react'
import { buildGraph, computeAllRelationTerms } from '../lib/kinship/index.js'

const P = (id, name, gender, birth_date, extra = {}) => ({ id, name, gender, birth_date, is_deceased: false, nicknames: [], tags: [], stats: {}, power: 5, ...extra })

// 兩邊的家族都有:爸爸這邊(阿公阿嬤、大伯一家、爸爸的前伴侶與半血緣弟)、媽媽這邊(外公外婆、阿姨一家)、我這邊(太太、兒子)
const people = [
  P('gp', '阿公', 'male', '1938', { power: 9, is_deceased: true, death_date: '2021-03' }),
  P('gm', '阿嬤', 'female', '1942', { nicknames: ['阿母'] }),
  P('uncle', '大伯', 'male', '1962', { birth_order: 1 }),
  P('aunt_in_law', '大伯母', 'female', '1963'),
  P('cousin', '堂哥', 'male', '1988'),
  P('dad', '爸爸', 'male', '1965', { birth_order: 2, politics: 'blue', stats: { fun: 4, smart: 9, rich: 6 } }),
  P('mom', '媽媽', 'female', '1967'),
  P('ex', '前伴侶', 'female', '1966'),
  P('mgp', '外公', 'male', '1935', { is_deceased: true, death_date: '2010' }),
  P('mgm', '外婆', 'female', '1940'),
  P('aunt', '阿姨', 'female', '1970'),
  P('aunt_husband', '姨丈', 'male', '1968'),
  P('cousin2', '表妹', 'female', '1996'),
  P('me', '我', 'male', '1990-05-01', { nicknames: ['小明', 'Ming'], tags: ['ADHD'], politics: 'green', stats: { fun: 8, smart: 7, crazy: 6 } }),
  P('sis', '妹妹', 'female', '1993'),
  P('half', '半血緣弟', 'male', '1995', { power: 2 }),
  P('wife', '太太', 'female', '1991'),
  P('kid', '兒子', 'male', '2018'),
]
const parentChild = [
  ['gp', 'uncle'], ['gm', 'uncle'], ['gp', 'dad'], ['gm', 'dad'],
  ['uncle', 'cousin'], ['aunt_in_law', 'cousin'],
  ['mgp', 'mom'], ['mgm', 'mom'], ['mgp', 'aunt'], ['mgm', 'aunt'],
  ['aunt', 'cousin2'], ['aunt_husband', 'cousin2'],
  ['dad', 'me'], ['mom', 'me'], ['dad', 'sis'], ['mom', 'sis'],
  ['dad', 'half'], ['ex', 'half'],
  ['me', 'kid'], ['wife', 'kid'],
].map(([parent_id, child_id], i) => ({ id: `pc${i}`, parent_id, child_id }))
const spouses = [
  { id: 's1', person_a_id: 'gp', person_b_id: 'gm', status: 'married' },
  { id: 's2', person_a_id: 'dad', person_b_id: 'mom', status: 'married' },
  { id: 's3', person_a_id: 'dad', person_b_id: 'ex', status: 'ex_partner' },
  { id: 's4', person_a_id: 'me', person_b_id: 'wife', status: 'partner' },
  { id: 's5', person_a_id: 'uncle', person_b_id: 'aunt_in_law', status: 'married' },
  { id: 's6', person_a_id: 'mgp', person_b_id: 'mgm', status: 'married' },
  { id: 's7', person_a_id: 'aunt_husband', person_b_id: 'aunt', status: 'married' },
]

export function useStore() {
  return useMemo(() => {
    const graph = buildGraph({ people, parentChild, spouses })
    const viewpointId = 'me'
    const terms = computeAllRelationTerms(viewpointId, graph, { advanced: true })
    return {
      familyId: 'harness',
      households: [
        { id: 'h1', name: '阿公家', color: 'accent', person_ids: ['gm', 'dad', 'mom', 'me'] },
        { id: 'h2', name: '我家', color: 'primary', person_ids: ['me', 'wife', 'kid'] },
      ],
      people,
      parentChild,
      spouses,
      graph,
      terms,
      viewpointId,
      selfId: 'me',
      peopleById: new Map(people.map((p) => [p.id, p])),
      canEdit: true,
      termFor: (id) => terms.get(id) ?? null,
    }
  }, [])
}
