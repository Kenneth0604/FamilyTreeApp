import { GENDER_LABEL, SPOUSE_STATUS_LABEL } from './format.js'

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
