// 開發用假資料層:讓 Tree 不需要 Supabase 也能在瀏覧器裡跑(vite.harness.config.js 會把 lib/store.jsx 換成這個)
import { useMemo } from 'react'
import { buildGraph, computeAllRelationTerms } from '../lib/kinship/index.js'

const P = (id, name, gender, birth_date, extra = {}) => ({ id, name, gender, birth_date, is_deceased: false, nicknames: [], tags: [], stats: {}, power: 5, ...extra })

const people = [
  P('gp', '阿公', 'male', '1940', { power: 9 }),
  P('gm', '阿嬤', 'female', '1942', { nicknames: ['阿母'] }),
  P('dad', '爸爸', 'male', '1965', { birth_order: 2, politics: 'blue', stats: { fun: 4, smart: 9, rich: 6 } }),
  P('mom', '媽媽', 'female', '1967'),
  P('uncle', '大伯', 'male', '1962', { birth_order: 1 }),
  P('ex', '前伴侶', 'female', '1966'),
  P('me', '我', 'male', '1990-05-01', { nicknames: ['小明', 'Ming'], tags: ['ADHD'], politics: 'green', stats: { fun: 8, smart: 7, crazy: 6 } }),
  P('sis', '妹妹', 'female', '1993'),
  P('half', '半血緣弟', 'male', '1995', { power: 2 }),
  P('wife', '太太', 'female', '1991'),
  P('kid', '兒子', 'male', '2018'),
]
const parentChild = [
  ['gp', 'dad'], ['gm', 'dad'], ['gp', 'uncle'], ['gm', 'uncle'],
  ['dad', 'me'], ['mom', 'me'], ['dad', 'sis'], ['mom', 'sis'],
  ['dad', 'half'], ['ex', 'half'],
  ['me', 'kid'], ['wife', 'kid'],
].map(([parent_id, child_id], i) => ({ id: `pc${i}`, parent_id, child_id }))
const spouses = [
  { id: 's1', person_a_id: 'gp', person_b_id: 'gm', status: 'married' },
  { id: 's2', person_a_id: 'dad', person_b_id: 'mom', status: 'married' },
  { id: 's3', person_a_id: 'dad', person_b_id: 'ex', status: 'ex_partner' },
  { id: 's4', person_a_id: 'me', person_b_id: 'wife', status: 'partner' },
]

export function useStore() {
  return useMemo(() => {
    const graph = buildGraph({ people, parentChild, spouses })
    const viewpointId = 'me'
    const terms = computeAllRelationTerms(viewpointId, graph, { advanced: true })
    return {
      familyId: 'harness',
      households: [{ id: 'h1', name: '阿公家', color: 'accent', person_ids: ['gp', 'gm', 'dad', 'me'] }],
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
