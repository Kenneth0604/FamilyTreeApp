import { GENDER_LABEL, SPOUSE_STATUS_LABEL } from './format.js'
import { parseBirth } from './kinship/birth.js'

export const pairKey = (x, y) => [x, y].sort().join('|')
const uniq = (arr) => [...new Set(arr)]
const dedupeBy = (arr, keyFn) => {
  const seen = new Set()
  return arr.filter((x) => {
    const k = keyFn(x)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}
const normName = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, '')

/**
 * 合併樹:同一人標記(same_person,a = 第一個來源的人、b = 第二個來源的人)→ 把 b 併進 a。
 * b 從人物清單消失;所有指向 b 的關係 / 紀事 / 寵物 / 小家庭改指向 a 並去重;a 沒填的欄位用 b 的補,小名 / 標籤取聯集,
 * a.aliases 記錄被併進來的人。兩個家族的樹因此在這個人身上接起來,雙方的親戚就串在同一張圖上。
 */
export function resolveSamePerson(tree, links) {
  const same = (links || []).filter((l) => l.relation === 'same_person')
  if (!same.length) return tree
  const alias = new Map(same.map((l) => [l.person_b_id, l.person_a_id]))
  const map = (id) => alias.get(id) ?? id
  const byId = new Map((tree.people || []).map((p) => [p.id, p]))

  const people = (tree.people || [])
    .filter((p) => !alias.has(p.id))
    .map((p) => {
      const others = same.filter((l) => l.person_a_id === p.id).map((l) => byId.get(l.person_b_id)).filter(Boolean)
      if (!others.length) return p
      const m = { ...p, aliases: others.map((o) => ({ id: o.id, family_id: o.family_id, name: o.name })) }
      for (const o of others) {
        m.nicknames = uniq([...(m.nicknames || []), ...(normName(o.name) !== normName(p.name) ? [o.name] : []), ...(o.nicknames || [])])
        m.tags = uniq([...(m.tags || []), ...(o.tags || [])])
        if (!m.birth_date && o.birth_date) m.birth_date = o.birth_date
        if (!m.death_date && o.death_date) m.death_date = o.death_date
        if ((m.gender || 'unspecified') === 'unspecified' && o.gender && o.gender !== 'unspecified') m.gender = o.gender
        if (!m.avatar_url && o.avatar_url) m.avatar_url = o.avatar_url
        if (!m.note && o.note) m.note = o.note
        if (m.birth_order == null && o.birth_order != null) m.birth_order = o.birth_order
        if (!m.politics && o.politics) m.politics = o.politics
        m.stats = { ...(o.stats || {}), ...(m.stats || {}) }
        m.is_deceased = Boolean(m.is_deceased || o.is_deceased)
      }
      return m
    })

  const parentChild = dedupeBy(
    (tree.parentChild || []).map((r) => ({ ...r, parent_id: map(r.parent_id), child_id: map(r.child_id) })).filter((r) => r.parent_id !== r.child_id),
    (r) => `${r.parent_id}>${r.child_id}`,
  )
  const spouses = dedupeBy(
    (tree.spouses || []).map((r) => ({ ...r, person_a_id: map(r.person_a_id), person_b_id: map(r.person_b_id) })).filter((r) => r.person_a_id !== r.person_b_id),
    (r) => pairKey(r.person_a_id, r.person_b_id),
  )
  const entries = (tree.entries || []).map((e) => ({ ...e, person_id: map(e.person_id) }))
  const pets = (tree.pets || []).map((p) => ({ ...p, owner_person_id: p.owner_person_id ? map(p.owner_person_id) : p.owner_person_id }))
  const households = (tree.households || []).map((h) => ({ ...h, person_ids: uniq((h.person_ids || []).map(map)) }))
  return { ...tree, people, parentChild, spouses, entries, pets, households }
}

/**
 * 找「可能是同一人」的配對:第一個來源 × 第二個來源,姓名相同或一方的姓名等於另一方的小名。
 * 已標記(同一人 / 不是同一人)的配對、已被併過的人不再列出。附上性別 / 出生年是否一致的提示,有衝突的排後面。
 */
export function findSamePersonCandidates(people, sources, links) {
  if (!sources || sources.length < 2) return []
  const [s0, s1] = sources.map((s) => s.id)
  const decided = new Set()
  const aliased = new Set()
  for (const l of links || []) {
    if (l.relation !== 'same_person' && l.relation !== 'not_same_person') continue
    decided.add(pairKey(l.person_a_id, l.person_b_id))
    if (l.relation === 'same_person') {
      aliased.add(l.person_a_id)
      aliased.add(l.person_b_id)
    }
  }
  const A = (people || []).filter((p) => p.family_id === s0 && !aliased.has(p.id))
  const B = (people || []).filter((p) => p.family_id === s1 && !aliased.has(p.id))
  const out = []
  for (const a of A) {
    const na = normName(a.name)
    for (const b of B) {
      if (decided.has(pairKey(a.id, b.id))) continue
      const nb = normName(b.name)
      let reason = null
      if (na && na === nb) reason = '姓名相同'
      else if ((a.nicknames || []).some((n) => normName(n) === nb) || (b.nicknames || []).some((n) => normName(n) === na)) reason = '一方的小名等於另一方的姓名'
      if (!reason) continue
      const hints = []
      const ga = a.gender || 'unspecified'
      const gb = b.gender || 'unspecified'
      if (ga !== 'unspecified' && gb !== 'unspecified') hints.push(ga === gb ? '性別相同' : '性別不同')
      const ya = parseBirth(a.birth_date)?.y
      const yb = parseBirth(b.birth_date)?.y
      if (ya && yb) hints.push(ya === yb ? '出生年相同' : '出生年不同')
      out.push({ a, b, reason, hints, conflict: hints.some((h) => h.endsWith('不同')) })
    }
  }
  return out.sort((x, y) => Number(x.conflict) - Number(y.conflict))
}

/**
 * 合併家族樹:把 family_links(橋接關係)轉成 buildGraph 認得的 parent_child / spouses 列。
 * person_a 永遠是產生連結碼那一方的人,person_b 是輸入碼合併那一方的人;
 * parent_side = 'a' → a 是父母、b 是小孩;'b' 則相反。
 */
export function bridgeRows(links, mergedFamilyId) {
  const parentChild = []
  const spouses = []
  for (const l of links || []) {
    const base = { id: `link-${l.id}`, family_id: mergedFamilyId, created_by: l.created_by ?? null, created_at: l.created_at, bridge: true }
    if (l.relation === 'spouse') {
      spouses.push({ ...base, person_a_id: l.person_a_id, person_b_id: l.person_b_id, status: l.status || 'married', updated_by: null, updated_at: l.created_at })
    } else if (l.relation === 'parent_child') {
      const aIsParent = l.parent_side !== 'b'
      parentChild.push({ ...base, parent_id: aIsParent ? l.person_a_id : l.person_b_id, child_id: aIsParent ? l.person_b_id : l.person_a_id })
    }
  }
  return { parentChild, spouses }
}

export const LINK_RELATIONS = [
  { id: 'spouse', label: '配偶 / 伴侶' },
  { id: 'parent_child', label: '親子' },
]

/** 「林家的 林大明(男)是你選的人的 爸爸」這類描述,給連結碼預覽與清單用 */
export function linkDescription(inv, { personName = inv?.person_name, familyName = inv?.family_name } = {}) {
  if (!inv) return ''
  const who = familyName ? `${familyName}的 ${personName}` : personName
  if (inv.relation === 'spouse') return `${who} 是對方所選人物的${SPOUSE_STATUS_LABEL[inv.status] || ''}配偶 / 伴侶`
  if (inv.is_parent) {
    const g = inv.person_gender
    return `${who} 是對方所選人物的${g === 'male' ? '爸爸' : g === 'female' ? '媽媽' : '父母'}`
  }
  return `${who} 是對方所選人物的小孩`
}

export const genderLabel = (g) => GENDER_LABEL[g] || GENDER_LABEL.unspecified
