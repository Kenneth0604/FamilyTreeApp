import { ageFromBirth, formatBirth } from './kinship/birth.js'

export const GENDER_LABEL = { male: '男', female: '女', unspecified: '未指定' }
export const SPOUSE_STATUS_LABEL = { married: '已婚', divorced: '離婚', widowed: '喪偶' }

/** 「36 歲」「約 36 歲」「已故」;沒生日回空字串 */
export function ageLabel(person) {
  if (!person) return ''
  if (person.is_deceased) return '已故'
  const a = ageFromBirth(person.birth_date)
  if (!a) return ''
  return `${a.approx ? '約 ' : ''}${a.age} 歲`
}

export function birthLabel(person) {
  return formatBirth(person?.birth_date)
}

/** 年 / 月 / 日(可缺後段)→ 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD';沒有年回 null */
export function toPartialDate(y, m, d) {
  if (!y) return null
  const yy = String(y).padStart(4, '0')
  if (!m) return yy
  const mm = String(m).padStart(2, '0')
  if (!d) return `${yy}-${mm}`
  return `${yy}-${mm}-${String(d).padStart(2, '0')}`
}

/** 生平紀事的類別(顯示順序即此順序) */
export const ENTRY_CATEGORIES = [
  { id: 'career', label: '職業經歷', icon: '💼', hint: '公司 / 職稱、創業、務農、從軍…' },
  { id: 'education', label: '學歷', icon: '🎓', hint: '學校、科系、師承' },
  { id: 'event', label: '重要事蹟', icon: '⭐', hint: '遷居來台、創辦事業、重大經歷、家族故事' },
  { id: 'residence', label: '居住地', icon: '🏠', hint: '曾住過的地方' },
  { id: 'award', label: '榮譽獎項', icon: '🏅', hint: '得獎、表揚、頭銜' },
  { id: 'other', label: '其他', icon: '📌', hint: '興趣、信仰、健康、任何想記下的事' },
]
export const ENTRY_CATEGORY_BY_ID = Object.fromEntries(ENTRY_CATEGORIES.map((c) => [c.id, c]))

/** 「1985 年 – 1990 年」「2001 年 起」「至 1999 年」;都沒填回空字串 */
export function periodLabel(start, end, ongoing) {
  const s = formatBirth(start)
  const e = formatBirth(end)
  if (s && ongoing) return `${s} 起`
  if (s && e) return `${s} – ${e}`
  if (s) return s
  if (e) return `至 ${e}`
  return ongoing ? '至今' : ''
}

/** 生平紀事排序:有起始時間的依時間先後,沒有的排最後,再依 sort_order / 建立時間 */
export function compareEntries(a, b) {
  const sa = a.start_date || a.end_date || ''
  const sb = b.start_date || b.end_date || ''
  if (sa && sb && sa !== sb) return sa < sb ? -1 : 1
  if (sa && !sb) return -1
  if (!sa && sb) return 1
  return (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.created_at).localeCompare(String(b.created_at))
}

/** 把「小明、阿明, Ming」這種輸入切成不重複的小名陣列 */
export function parseNicknames(text) {
  const out = []
  for (const raw of String(text || '').split(/[、,，;；\n]+/)) {
    const n = raw.trim()
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}

/** 世代標籤:-2 → 祖輩、-1 → 父輩、0 → 同輩、1 → 子輩、2 → 孫輩 */
export function generationLabel(g) {
  if (g == null) return '未連結'
  if (g === 0) return '同輩'
  if (g === -1) return '父母輩'
  if (g === -2) return '祖父母輩'
  if (g === -3) return '曾祖輩'
  if (g < -3) return `上 ${-g} 代`
  if (g === 1) return '子女輩'
  if (g === 2) return '孫輩'
  if (g === 3) return '曾孫輩'
  return `下 ${g} 代`
}

export function relativeTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return '剛剛'
  if (m < 60) return `${m} 分鐘前`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} 小時前`
  const day = Math.floor(h / 24)
  if (day < 30) return `${day} 天前`
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`
}

/** 大頭照佔位字:中文名取最後一個字,拉丁字母名取首字母大寫 */
export function initial(name) {
  const chars = Array.from((name || '').trim())
  if (!chars.length) return '?'
  if (/^[A-Za-z]/.test(chars[0])) return chars[0].toUpperCase()
  return chars[chars.length - 1]
}
