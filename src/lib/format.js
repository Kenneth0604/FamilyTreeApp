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
