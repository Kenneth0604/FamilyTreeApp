/**
 * 生日工具:birth_date 允許 'YYYY' / 'YYYY-MM' / 'YYYY-MM-DD',或 null
 */

/** @returns {{ y:number, m:number|null, d:number|null } | null} */
export function parseBirth(value) {
  if (!value) return null
  const m = /^(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?$/.exec(String(value).trim())
  if (!m) return null
  const y = Number(m[1])
  if (!Number.isFinite(y) || y < 1 || y > 9999) return null
  return { y, m: m[2] ? Number(m[2]) : null, d: m[3] ? Number(m[3]) : null }
}

/**
 * 比較兩個人誰年長。
 * @returns {1|-1|0} 1 = a 比較年長(出生較早),-1 = a 比較年輕,0 = 無法判斷(缺生日或精度不足以分出先後)
 */
export function compareAge(a, b) {
  const ba = parseBirth(a?.birth_date)
  const bb = parseBirth(b?.birth_date)
  if (!ba || !bb) return 0
  if (ba.y !== bb.y) return ba.y < bb.y ? 1 : -1
  if (ba.m == null || bb.m == null) return 0
  if (ba.m !== bb.m) return ba.m < bb.m ? 1 : -1
  if (ba.d == null || bb.d == null) return 0
  if (ba.d !== bb.d) return ba.d < bb.d ? 1 : -1
  return 0
}

/**
 * 比較兩個「兄弟姊妹」誰年長:先看生日,生日分不出來(缺、或只有年份且同年)再看排行(birth_order,1 = 老大)。
 * 排行只在同一組兄弟姊妹之間有意義,堂表之間請用 compareAge。
 * @returns {1|-1|0}
 */
export function compareSiblings(a, b) {
  const c = compareAge(a, b)
  if (c) return c
  const oa = a?.birth_order
  const ob = b?.birth_order
  if (Number.isFinite(oa) && Number.isFinite(ob) && oa !== ob) return oa < ob ? 1 : -1
  return 0
}

/** 由生日算年齡(只有年份時為概略值)。回傳 { age, approx } 或 null */
export function ageFromBirth(value, now = new Date()) {
  const b = parseBirth(value)
  if (!b) return null
  let age = now.getFullYear() - b.y
  let approx = b.m == null || b.d == null
  if (b.m != null) {
    const nm = now.getMonth() + 1
    if (nm < b.m || (nm === b.m && b.d != null && now.getDate() < b.d)) age -= 1
  }
  return { age: Math.max(0, age), approx }
}

/** 顯示用:'1985' → '1985 年'、'1985-03' → '1985 年 3 月'、'1985-03-09' → '1985/03/09' */
export function formatBirth(value) {
  const b = parseBirth(value)
  if (!b) return ''
  if (b.m == null) return `${b.y} 年`
  if (b.d == null) return `${b.y} 年 ${b.m} 月`
  return `${b.y}/${String(b.m).padStart(2, '0')}/${String(b.d).padStart(2, '0')}`
}
