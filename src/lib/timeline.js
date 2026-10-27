import { parseBirth } from './kinship/birth.js'
import { ENTRY_CATEGORY_BY_ID, PET_SPECIES_BY_ID, displayName } from './format.js'

/**
 * 家族時間軸:把出生、逝世、生平紀事、寵物出生排成一條線。
 * 日期允許只有年份(YYYY)或年月,排序時缺的月日當成年初,同一天依類型排(出生在前、逝世在後)。
 * @returns {Array<{ id, kind, date, y, m, d, title, sub, icon, personId?, petId?, age? }>} 由舊到新
 */
const KIND_ORDER = { birth: 0, pet: 1, entry: 2, death: 3 }

function ageAt(birth, at) {
  if (!birth || !at) return null
  let a = at.y - birth.y
  if (birth.m && at.m && (at.m < birth.m || (at.m === birth.m && birth.d && at.d && at.d < birth.d))) a -= 1
  return a >= 0 ? a : null
}

export function buildTimeline(people = [], entries = [], pets = []) {
  const out = []
  const byId = new Map(people.map((p) => [p.id, p]))
  for (const p of people) {
    const b = parseBirth(p.birth_date)
    if (b) out.push({ id: `b-${p.id}`, kind: 'birth', date: p.birth_date, ...b, title: `${displayName(p)} 出生`, icon: '👶', personId: p.id })
    const dd = p.is_deceased ? parseBirth(p.death_date) : null
    if (dd) {
      const age = ageAt(b, dd)
      out.push({ id: `d-${p.id}`, kind: 'death', date: p.death_date, ...dd, title: `${displayName(p)} 辭世`, sub: age != null ? `享年 ${age} 歲` : '', icon: '🕯️', personId: p.id })
    }
  }
  for (const e of entries) {
    const s = parseBirth(e.start_date)
    const p = byId.get(e.person_id)
    if (!s || !p) continue
    const cat = ENTRY_CATEGORY_BY_ID[e.category] || ENTRY_CATEGORY_BY_ID.other
    const age = ageAt(parseBirth(p.birth_date), s)
    out.push({ id: `e-${e.id}`, kind: 'entry', date: e.start_date, ...s, title: e.title, sub: `${displayName(p)}${age != null ? ` · ${age} 歲` : ''} · ${cat.label}`, icon: cat.icon, personId: p.id, category: e.category })
  }
  for (const pet of pets) {
    const b = parseBirth(pet.birth_date)
    if (!b) continue
    const sp = PET_SPECIES_BY_ID[pet.species]
    const owner = pet.owner_person_id && byId.get(pet.owner_person_id)
    out.push({ id: `p-${pet.id}`, kind: 'pet', date: pet.birth_date, ...b, title: `${pet.name} 來到這個家`, sub: [sp?.label, owner && `${displayName(owner)} 的寵物`].filter(Boolean).join(' · '), icon: sp?.icon || '🐾', petId: pet.id })
  }
  out.sort((a, b) => a.y - b.y || (a.m ?? 0) - (b.m ?? 0) || (a.d ?? 0) - (b.d ?? 0) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.title.localeCompare(b.title, 'zh-Hant'))
  return out
}

/** 依年代分組:[{ decade: 1980, items: [...] }] */
export function groupByDecade(items) {
  const groups = []
  for (const it of items) {
    const decade = Math.floor(it.y / 10) * 10
    let g = groups[groups.length - 1]
    if (!g || g.decade !== decade) groups.push((g = { decade, items: [] }))
    g.items.push(it)
  }
  return groups
}

/** 顯示用日期:只有年 → '1985',有月 → '1985.3',有日 → '1985.3.9' */
export function shortDate(it) {
  return [it.y, it.m, it.d].filter((x) => x != null).join('.')
}
