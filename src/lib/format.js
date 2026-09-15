import { ageFromBirth, formatBirth } from './kinship/birth.js'

export const GENDER_LABEL = { male: '男', female: '女', unspecified: '未指定' }
/** 配偶 / 伴侶關係狀態(顯示順序即此順序) */
export const SPOUSE_STATUS_LABEL = { married: '已婚', partner: '伴侶(未婚)', divorced: '離婚', ex_partner: '前伴侶', widowed: '喪偶' }

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

const CN_NUM = ['', '大', '二', '三', '四', '五', '六', '七', '八', '九', '十']
/** 排行:1 → 老大、2 → 老二 … 10 → 老十,更多則「第 N」;沒填回空字串 */
export function birthOrderLabel(n) {
  if (!Number.isFinite(n) || n < 1) return ''
  return n <= 10 ? `老${CN_NUM[n]}` : `第 ${n}`
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
  { id: 'health', label: '健康 / 疾病', icon: '🩺', hint: '疾病、過敏、手術、慢性病、家族病史;可填發病或確診時間' },
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

/** 把「小明、阿明, Ming」這種輸入切成不重複的陣列(小名、標籤共用) */
export function parseList(text) {
  const out = []
  for (const raw of String(text || '').split(/[、,，;；\n]+/)) {
    const n = raw.trim()
    if (n && !out.includes(n)) out.push(n)
  }
  return out
}
export const parseNicknames = parseList

/**
 * 遊戲角色式屬性(0–10)。low / high 是低分 / 高分時的描述,越好笑越好。
 * negative = 負面屬性:分數越高越糟,算綜合評分時反過來計(10 - 分數)
 */
export const STATS = [
  { id: 'fun', label: '有趣', icon: '🎉', low: '無聊到睡著', high: '全場焦點' },
  { id: 'crazy', label: '有病', icon: '🤪', low: '正常人', high: '病入膏肓', negative: true },
  { id: 'temper', label: '脾氣', icon: '🌋', low: '一秒爆炸', high: '佛系' },
  { id: 'smart', label: '聰明', icon: '🧠', low: '傻人有傻福', high: '人形電腦' },
  { id: 'education', label: '學歷', icon: '🎓', low: '社會大學', high: '博士後' },
  { id: 'rich', label: '有錢', icon: '💰', low: '月光族', high: '土豪' },
  { id: 'looks', label: '顏值', icon: '✨', low: '靠氣質', high: '天選之人' },
  { id: 'cooking', label: '廚藝', icon: '🍳', low: '黑暗料理', high: '總鋪師' },
  { id: 'drinking', label: '酒量', icon: '🍺', low: '一杯倒', high: '千杯不醉' },
  { id: 'nagging', label: '愛唸', icon: '🗣️', low: '惜字如金', high: '唸經大師', negative: true },
  { id: 'luck', label: '運氣', icon: '🍀', low: '烏鴉嘴', high: '天選之子' },
  { id: 'stubborn', label: '固執', icon: '🪨', low: '隨便都好', high: '撞牆也不轉彎', negative: true },
  { id: 'gossip', label: '八卦', icon: '📡', low: '不知人間事', high: '家族情報局' },
  { id: 'sleepy', label: '嗜睡', icon: '😴', low: '早起的鳥', high: '睡到自然醒' },
  { id: 'generous', label: '大方', icon: '🧧', low: '紅包薄如紙', high: '紅包厚如磚' },
  { id: 'tech', label: '科技力', icon: '📱', low: '長輩圖製造機', high: '3C 達人' },
  { id: 'direction', label: '方向感', icon: '🧭', low: '出門就迷路', high: '人體 GPS' },
  { id: 'singing', label: '歌喉', icon: '🎤', low: '五音不全', high: '麥霸' },
  { id: 'lazy', label: '懶', icon: '🛋️', low: '勤勞小蜜蜂', high: '沙發長出來', negative: true },
  { id: 'gaming', label: '電動', icon: '🎮', low: '不知 Switch 為何物', high: '電競選手' },
  { id: 'foodie', label: '吃貨', icon: '🍜', low: '吃不下', high: '什麼都吃' },
  { id: 'talkative', label: '話多', icon: '💬', low: '句點王', high: '停不下來' },
  { id: 'cute', label: '可愛', icon: '🐣', low: '威嚴', high: '融化全場' },
  { id: 'strength', label: '力氣', icon: '💪', low: '醬油瓶打不開', high: '徒手搬冰箱' },
  { id: 'punctual', label: '準時', icon: '⏱️', low: '永遠遲到', high: '提早半小時' },
  { id: 'fashion', label: '時尚', icon: '👗', low: '藍白拖', high: '走秀模特' },
  { id: 'driving', label: '開車', icon: '🚗', low: '馬路三寶', high: '賽車手' },
  { id: 'mahjong', label: '麻將', icon: '🀄', low: '桌邊觀眾', high: '牌神' },
  { id: 'memory', label: '記性', icon: '🐟', low: '金魚腦', high: '過目不忘' },
  { id: 'patience', label: '耐心', icon: '🧘', low: '三秒不耐', high: '高僧' },
]
export const STAT_BY_ID = Object.fromEntries(STATS.map((s) => [s.id, s]))

/** 分數對應的描述:低 / 中 / 高 */
export function statDescriptor(stat, value) {
  if (value <= 3) return stat.low
  if (value >= 8) return stat.high
  return '普通'
}

/** 戰力(家庭地位)0–10:影響樹狀圖卡片大小 */
export const POWER_DEFAULT = 5
export const POWER_LEVELS = [
  [10, '家族大魔王'],
  [9, '話事人'],
  [7, '有份量'],
  [5, '一般成員'],
  [3, '小咖'],
  [0, '邊緣人'],
]
export function powerLabel(power) {
  const p = Number.isFinite(power) ? power : POWER_DEFAULT
  return POWER_LEVELS.find(([min]) => p >= min)[1]
}
/** 卡片縮放:0 → 0.8、5 → 1.0、10 → 1.2(最大不超過卡片間距,避免重疊) */
export function powerScale(power) {
  const p = Number.isFinite(power) ? power : POWER_DEFAULT
  return 0.8 + p * 0.04
}

const RANKS = [
  [90, 'S', '傳說級人物'],
  [75, 'A', '主角級'],
  [60, 'B', '重要配角'],
  [45, 'C', '路人甲'],
  [0, 'D', '新手村'],
]

/** 負面屬性反過來算:有病 8 分 = 只值 2 分 */
export const effectiveStat = (stat, value) => (stat.negative ? 10 - value : value)

/**
 * 綜合評分:已評屬性(負面者反算)的平均 × 10(0–100),附等級、稱號、最強 / 最弱屬性;沒評任何屬性回 null
 * catalog / ranks 可換成寵物的
 */
export function overallRating(stats, catalog = STATS, ranks = RANKS) {
  const items = catalog.filter((s) => Number.isFinite(stats?.[s.id])).map((s) => ({ ...s, value: stats[s.id], effective: effectiveStat(s, stats[s.id]) }))
  if (!items.length) return null
  const score = Math.round((items.reduce((a, s) => a + s.effective, 0) / items.length) * 10)
  const [, rank, title] = ranks.find(([min]) => score >= min)
  const sorted = [...items].sort((a, b) => b.effective - a.effective)
  return { score, rank, title, count: items.length, best: sorted[0], worst: sorted.length > 1 ? sorted[sorted.length - 1] : null }
}

// ---- 寵物 ----
export const PET_SPECIES = [
  { id: 'dog', label: '狗', icon: '🐶' },
  { id: 'cat', label: '貓', icon: '🐱' },
  { id: 'rabbit', label: '兔', icon: '🐰' },
  { id: 'bird', label: '鳥', icon: '🐦' },
  { id: 'fish', label: '魚', icon: '🐟' },
  { id: 'hamster', label: '鼠', icon: '🐹' },
  { id: 'turtle', label: '龜', icon: '🐢' },
  { id: 'reptile', label: '爬蟲', icon: '🦎' },
  { id: 'other', label: '其他', icon: '🐾' },
]
export const PET_SPECIES_BY_ID = Object.fromEntries(PET_SPECIES.map((s) => [s.id, s]))
export const PET_GENDER_LABEL = { male: '公', female: '母', unspecified: '未指定' }

/** 寵物屬性(0–10),negative 者越高越糟 */
export const PET_STATS = [
  { id: 'cute', label: '可愛', icon: '🥹', low: '長相隨性', high: '融化全家' },
  { id: 'clingy', label: '黏人', icon: '🫂', low: '高冷', high: '人形口香糖' },
  { id: 'spoiled', label: '撒嬌', icon: '🥺', low: '不屑', high: '奧斯卡等級' },
  { id: 'smart', label: '聰明', icon: '🧠', low: '單純可愛', high: '會自己開門' },
  { id: 'obedient', label: '聽話', icon: '🎓', low: '當你透明', high: '口令大師' },
  { id: 'social', label: '社交', icon: '🐾', low: '怕生', high: '見人就撲' },
  { id: 'brave', label: '膽子', icon: '🦁', low: '看到吸塵器就逃', high: '護家神獸' },
  { id: 'greedy', label: '貪吃', icon: '🍖', low: '挑食', high: '四腳吸塵器' },
  { id: 'lazy', label: '懶', icon: '🛋️', low: '過動', high: '一天睡 20 小時' },
  { id: 'looks', label: '顏值', icon: '✨', low: '靈魂系', high: '網美級' },
  { id: 'status', label: '地位', icon: '👑', low: '寵物', high: '真正的一家之主' },
  { id: 'naughty', label: '搗蛋', icon: '😈', low: '模範生', high: '拆家大隊長', negative: true },
  { id: 'loud', label: '音量', icon: '📢', low: '安靜', high: '鄰居報警', negative: true },
  { id: 'shedding', label: '掉毛', icon: '🧹', low: '不掉毛', high: '毛毛雪', negative: true },
  { id: 'vet', label: '看醫生', icon: '🏥', low: '健康寶寶', high: '獸醫 VIP', negative: true },
]
export const PET_RANKS = [
  [90, 'S', '鎮宅神獸'],
  [75, 'A', '家族團寵'],
  [60, 'B', '乖寶寶'],
  [45, 'C', '一般寵物'],
  [0, 'D', '還在調教'],
]

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
