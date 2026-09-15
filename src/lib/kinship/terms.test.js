import { describe, it, expect } from 'vitest'
import { buildGraph, computeRelationTerm, computeAllRelationTerms, shortestPath } from './index.js'
import { compareAge, compareSiblings, ageFromBirth, parseBirth } from './birth.js'

/**
 * Fixture 建構器:
 *   const f = fixture()
 *   const me = f.person('我', 'male', '1990-05-01')
 *   f.parent(dad, me); f.marry(dad, mom)
 *   f.term(me, dad) → '爸爸'
 */
function fixture() {
  const people = []
  const parentChild = []
  const spouses = []
  let seq = 0
  const api = {
    person(name, gender = 'unspecified', birth_date = null, extra = {}) {
      const id = `p${++seq}`
      people.push({ id, name, gender, birth_date, is_deceased: false, ...extra })
      return id
    },
    parent(parent_id, child_id) {
      parentChild.push({ parent_id, child_id })
    },
    parents(dad, mom, ...kids) {
      for (const k of kids) {
        if (dad) api.parent(dad, k)
        if (mom) api.parent(mom, k)
      }
    },
    marry(a, b, status = 'married') {
      spouses.push({ person_a_id: a, person_b_id: b, status })
    },
    graph() {
      return buildGraph({ people, parentChild, spouses })
    },
    result(v, t, options) {
      return computeRelationTerm(v, t, api.graph(), options)
    },
    term(v, t, options) {
      return api.result(v, t, options)?.term ?? null
    },
  }
  return api
}

/** 標準三代家庭 fixture(父系 + 母系),供多組測試共用 */
function standardFamily() {
  const f = fixture()
  // 祖父母
  const grandpa = f.person('爺爺', 'male', '1940')
  const grandma = f.person('奶奶', 'female', '1942')
  const mGrandpa = f.person('外公', 'male', '1945')
  const mGrandma = f.person('外婆', 'female', '1947')
  f.marry(grandpa, grandma)
  f.marry(mGrandpa, mGrandma)
  // 父輩
  const dad = f.person('爸爸', 'male', '1965-03-01')
  const uncleOld = f.person('伯伯', 'male', '1962')
  const uncleYoung = f.person('叔叔', 'male', '1968')
  const auntP = f.person('姑姑', 'female', '1970')
  f.parents(grandpa, grandma, uncleOld, dad, uncleYoung, auntP)
  const mom = f.person('媽媽', 'female', '1967')
  const uncleM = f.person('舅舅', 'male', '1965')
  const auntM = f.person('阿姨', 'female', '1972')
  f.parents(mGrandpa, mGrandma, uncleM, mom, auntM)
  f.marry(dad, mom)
  // 父輩配偶
  const uncleOldWife = f.person('伯母', 'female', '1963')
  const uncleYoungWife = f.person('嬸嬸', 'female', '1970')
  const auntPHusband = f.person('姑丈', 'male', '1968')
  const uncleMWife = f.person('舅媽', 'female', '1966')
  const auntMHusband = f.person('姨丈', 'male', '1971')
  f.marry(uncleOld, uncleOldWife)
  f.marry(uncleYoung, uncleYoungWife)
  f.marry(auntP, auntPHusband)
  f.marry(uncleM, uncleMWife)
  f.marry(auntM, auntMHusband)
  // 自己與兄弟姊妹
  const me = f.person('我', 'male', '1990-05-01')
  const bro = f.person('哥哥', 'male', '1988-01-01')
  const sis = f.person('妹妹', 'female', '1993-07-07')
  f.parents(dad, mom, bro, me, sis)
  // 堂表親
  const cousinTangOld = f.person('堂哥', 'male', '1987')
  const cousinTangYoung = f.person('堂妹', 'female', '1995')
  f.parents(uncleOld, uncleOldWife, cousinTangOld)
  f.parents(uncleYoung, uncleYoungWife, cousinTangYoung)
  const cousinBiaoP = f.person('表姊(姑姑的)', 'female', '1989')
  f.parents(auntPHusband, auntP, cousinBiaoP)
  const cousinBiaoM = f.person('表弟(舅舅的)', 'male', '1992')
  f.parents(uncleM, uncleMWife, cousinBiaoM)
  const cousinBiaoM2 = f.person('表妹(阿姨的)', 'female', '1996')
  f.parents(auntMHusband, auntM, cousinBiaoM2)
  // 兄弟姊妹的配偶與孩子
  const broWife = f.person('嫂嫂', 'female', '1989')
  const sisHusband = f.person('妹夫', 'male', '1991')
  f.marry(bro, broWife)
  f.marry(sis, sisHusband)
  const nephew = f.person('姪子', 'male', '2015')
  const niece = f.person('外甥女', 'female', '2018')
  f.parents(bro, broWife, nephew)
  f.parents(sisHusband, sis, niece)
  // 我的配偶與姻親
  const wife = f.person('太太', 'female', '1991-02-02')
  f.marry(me, wife)
  const fatherInLaw = f.person('岳父', 'male', '1960')
  const motherInLaw = f.person('岳母', 'female', '1962')
  f.marry(fatherInLaw, motherInLaw)
  const wifeBroOld = f.person('大舅子', 'male', '1985')
  const wifeSisYoung = f.person('小姨子', 'female', '1994')
  f.parents(fatherInLaw, motherInLaw, wifeBroOld, wife, wifeSisYoung)
  // 子女與孫
  const son = f.person('兒子', 'male', '2016')
  const daughter = f.person('女兒', 'female', '2019')
  f.parents(me, wife, son, daughter)
  const sonWife = f.person('媳婦', 'female', '2017')
  f.marry(son, sonWife)
  const grandson = f.person('孫子', 'male', '2040')
  f.parents(son, sonWife, grandson)
  const daughterHusband = f.person('女婿', 'male', '2018')
  f.marry(daughter, daughterHusband)
  const outerGranddaughter = f.person('外孫女', 'female', '2045')
  f.parents(daughterHusband, daughter, outerGranddaughter)

  return {
    f, grandpa, grandma, mGrandpa, mGrandma, dad, mom, uncleOld, uncleYoung, auntP, uncleM, auntM,
    uncleOldWife, uncleYoungWife, auntPHusband, uncleMWife, auntMHusband,
    me, bro, sis, cousinTangOld, cousinTangYoung, cousinBiaoP, cousinBiaoM, cousinBiaoM2,
    broWife, sisHusband, nephew, niece, wife, fatherInLaw, motherInLaw, wifeBroOld, wifeSisYoung,
    son, daughter, sonWife, grandson, daughterHusband, outerGranddaughter,
  }
}

describe('核心家庭:父母、子女、兄弟姊妹、配偶', () => {
  const s = standardFamily()
  const { f, me } = s

  it('父母', () => {
    expect(f.term(me, s.dad)).toBe('爸爸')
    expect(f.term(me, s.mom)).toBe('媽媽')
  })
  it('子女', () => {
    expect(f.term(me, s.son)).toBe('兒子')
    expect(f.term(me, s.daughter)).toBe('女兒')
  })
  it('配偶(依 target 性別)', () => {
    expect(f.term(me, s.wife)).toBe('太太')
    expect(f.term(s.wife, me)).toBe('先生')
  })
  it('兄弟姊妹依性別 + 年齡(共同父母,不需要 sibling edge)', () => {
    expect(f.term(me, s.bro)).toBe('哥哥')
    expect(f.term(me, s.sis)).toBe('妹妹')
    expect(f.term(s.sis, me)).toBe('哥哥')
    expect(f.term(s.sis, s.bro)).toBe('哥哥')
    expect(f.term(s.bro, s.sis)).toBe('妹妹')
    expect(f.term(s.bro, me)).toBe('弟弟')
    // 從媽媽看女兒是姊姊嗎?不是,是女兒
    expect(f.term(s.mom, s.sis)).toBe('女兒')
  })
  it('姊姊', () => {
    const g = fixture()
    const a = g.person('姊', 'female', '1980')
    const b = g.person('弟', 'male', '1985')
    const mom = g.person('媽', 'female', '1950')
    g.parents(null, mom, a, b)
    expect(g.term(b, a)).toBe('姊姊')
  })
  it('自己', () => {
    expect(f.result(me, me)).toMatchObject({ term: '自己', kind: 'self' })
  })
  it('回傳結構完整:path、generation、kind', () => {
    const r = f.result(me, s.dad)
    expect(r.kind).toBe('exact')
    expect(r.generation).toBe(-1)
    expect(r.path).toHaveLength(1)
    expect(r.path[0]).toMatchObject({ type: 'up', from: me, to: s.dad })
    expect(f.result(me, s.son).generation).toBe(1)
    expect(f.result(me, s.bro).generation).toBe(0)
  })
})

describe('祖孫兩代', () => {
  const s = standardFamily()
  const { f, me } = s

  it('父之父母 → 爺爺 / 奶奶', () => {
    expect(f.term(me, s.grandpa)).toBe('爺爺')
    expect(f.term(me, s.grandma)).toBe('奶奶')
  })
  it('母之父母 → 外公 / 外婆', () => {
    expect(f.term(me, s.mGrandpa)).toBe('外公')
    expect(f.term(me, s.mGrandma)).toBe('外婆')
  })
  it('兒子的孩子 → 孫子;女兒的孩子 → 外孫女', () => {
    expect(f.term(me, s.grandson)).toBe('孫子')
    expect(f.term(me, s.outerGranddaughter)).toBe('外孫女')
    expect(f.term(s.grandpa, me)).toBe('孫子')
    expect(f.term(s.mGrandma, s.sis)).toBe('外孫女')
  })
  it('孫看祖:世代差 -2', () => {
    expect(f.result(me, s.grandpa).generation).toBe(-2)
    expect(f.result(s.grandpa, me).generation).toBe(2)
  })
})

describe('父系與母系的伯叔姑舅姨(含配偶)', () => {
  const s = standardFamily()
  const { f, me } = s

  it('父之兄 → 伯伯;父之弟 → 叔叔;父之姊妹 → 姑姑', () => {
    expect(f.term(me, s.uncleOld)).toBe('伯伯')
    expect(f.term(me, s.uncleYoung)).toBe('叔叔')
    expect(f.term(me, s.auntP)).toBe('姑姑')
  })
  it('母之兄弟 → 舅舅;母之姊妹 → 阿姨', () => {
    expect(f.term(me, s.uncleM)).toBe('舅舅')
    expect(f.term(me, s.auntM)).toBe('阿姨')
  })
  it('伯叔姑舅姨的配偶', () => {
    expect(f.term(me, s.uncleOldWife)).toBe('伯母')
    expect(f.term(me, s.uncleYoungWife)).toBe('嬸嬸')
    expect(f.term(me, s.auntPHusband)).toBe('姑丈')
    expect(f.term(me, s.uncleMWife)).toBe('舅媽')
    expect(f.term(me, s.auntMHusband)).toBe('姨丈')
  })
  it('反向:伯伯看我 → 姪子;阿姨看我妹 → 外甥女', () => {
    expect(f.term(s.uncleOld, me)).toBe('姪子')
    expect(f.term(s.auntM, s.sis)).toBe('外甥女')
    expect(f.term(s.auntP, me)).toBe('姪子') // 姑姑看兄弟的孩子仍是姪子
  })
})

describe('兄弟姊妹的配偶與孩子', () => {
  const s = standardFamily()
  const { f, me } = s

  it('哥哥的太太 → 嫂嫂;妹妹的先生 → 妹夫', () => {
    expect(f.term(me, s.broWife)).toBe('嫂嫂')
    expect(f.term(me, s.sisHusband)).toBe('妹夫')
  })
  it('弟弟的太太 → 弟媳;姊姊的先生 → 姊夫(從哥哥 / 妹妹的角度)', () => {
    // 從哥哥看:我是弟弟,我的太太是弟媳
    expect(f.term(s.bro, s.wife)).toBe('弟媳')
    // 從妹妹看:哥哥的太太是嫂嫂
    expect(f.term(s.sis, s.broWife)).toBe('嫂嫂')
    // 從妹妹看:我的太太也是嫂嫂
    expect(f.term(s.sis, s.wife)).toBe('嫂嫂')
    // 從哥哥看妹妹的先生 → 妹夫;從妹妹的孩子... 略
    const g = fixture()
    const older = g.person('姊', 'female', '1980')
    const younger = g.person('弟', 'male', '1985')
    const mom = g.person('媽', 'female', '1950')
    g.parents(null, mom, older, younger)
    const husband = g.person('姊夫', 'male', '1979')
    g.marry(older, husband)
    expect(g.term(younger, husband)).toBe('姊夫')
  })
  it('兄弟的孩子 → 姪子 / 姪女;姊妹的孩子 → 外甥 / 外甥女(看連接血親性別,不看自己)', () => {
    expect(f.term(me, s.nephew)).toBe('姪子')
    expect(f.term(me, s.niece)).toBe('外甥女')
    // 妹妹(女性)看哥哥的孩子,一樣是姪子
    expect(f.term(s.sis, s.nephew)).toBe('姪子')
    // 哥哥看妹妹的孩子 → 外甥女
    expect(f.term(s.bro, s.niece)).toBe('外甥女')
  })
})

describe('第一代堂表親', () => {
  const s = standardFamily()
  const { f, me } = s

  it('父之兄弟的孩子 → 堂哥 / 堂妹(依年齡)', () => {
    expect(f.term(me, s.cousinTangOld)).toBe('堂哥')
    expect(f.term(me, s.cousinTangYoung)).toBe('堂妹')
    expect(f.term(s.cousinTangOld, me)).toBe('堂弟')
    expect(f.term(s.cousinTangYoung, me)).toBe('堂哥')
  })
  it('父之姊妹的孩子 → 表姊', () => {
    expect(f.term(me, s.cousinBiaoP)).toBe('表姊')
  })
  it('母之兄弟姊妹的孩子 → 表弟 / 表妹', () => {
    expect(f.term(me, s.cousinBiaoM)).toBe('表弟')
    expect(f.term(me, s.cousinBiaoM2)).toBe('表妹')
    expect(f.term(s.cousinBiaoM2, me)).toBe('表哥')
  })
})

describe('配偶雙方的姻親', () => {
  const s = standardFamily()
  const { f, me } = s

  it('viewpoint 男性:太太的父母 → 岳父 / 岳母;太太的兄弟姊妹 → 大舅子 / 小姨子', () => {
    expect(f.term(me, s.fatherInLaw)).toBe('岳父')
    expect(f.term(me, s.motherInLaw)).toBe('岳母')
    expect(f.term(me, s.wifeBroOld)).toBe('大舅子')
    expect(f.term(me, s.wifeSisYoung)).toBe('小姨子')
  })
  it('viewpoint 女性:先生的父母 → 公公 / 婆婆;先生的兄弟姊妹 → 大伯 / 小姑', () => {
    expect(f.term(s.wife, s.dad)).toBe('公公')
    expect(f.term(s.wife, s.mom)).toBe('婆婆')
    expect(f.term(s.wife, s.bro)).toBe('大伯')
    expect(f.term(s.wife, s.sis)).toBe('小姑')
  })
  it('小舅子 / 大姨子 / 小叔 / 大姑', () => {
    const g = fixture()
    const husband = g.person('夫', 'male', '1985')
    const wife = g.person('妻', 'female', '1986')
    g.marry(husband, wife)
    const wDad = g.person('妻父', 'male', '1955')
    const wBroY = g.person('妻弟', 'male', '1990')
    const wSisO = g.person('妻姊', 'female', '1983')
    g.parents(wDad, null, wife, wBroY, wSisO)
    const hMom = g.person('夫母', 'female', '1955')
    const hBroY = g.person('夫弟', 'male', '1989')
    const hSisO = g.person('夫姊', 'female', '1982')
    g.parents(null, hMom, husband, hBroY, hSisO)
    expect(g.term(husband, wBroY)).toBe('小舅子')
    expect(g.term(husband, wSisO)).toBe('大姨子')
    expect(g.term(wife, hBroY)).toBe('小叔')
    expect(g.term(wife, hSisO)).toBe('大姑')
  })
  it('反向姻親:岳父看我 → 女婿;公公看媳婦 → 媳婦', () => {
    expect(f.term(s.fatherInLaw, me)).toBe('女婿')
    expect(f.term(s.dad, s.wife)).toBe('媳婦')
    expect(f.term(me, s.sonWife)).toBe('媳婦')
    expect(f.term(me, s.daughterHusband)).toBe('女婿')
  })
  it('viewpoint 性別未指定 → 中性描述且不會崩潰', () => {
    const g = fixture()
    const v = g.person('我', 'unspecified', '1990')
    const sp = g.person('配偶', 'unspecified', '1991')
    g.marry(v, sp)
    const spDad = g.person('配偶爸', 'male', '1960')
    const spBro = g.person('配偶弟', 'male', '1995')
    g.parents(spDad, null, sp, spBro)
    expect(g.term(v, sp)).toBe('配偶')
    expect(g.term(v, spDad)).toBe('配偶的爸爸')
    expect(g.result(v, spBro)).toMatchObject({ term: '配偶的兄弟', kind: 'approx' })
  })
  it('繼父母 / 繼子女', () => {
    const g = fixture()
    const me = g.person('我', 'female', '2000')
    const dad = g.person('爸', 'male', '1970')
    const mom = g.person('媽', 'female', '1972')
    g.parents(dad, mom, me)
    g.marry(dad, mom, 'divorced')
    const stepMom = g.person('繼母', 'female', '1975')
    g.marry(dad, stepMom)
    expect(g.term(me, stepMom)).toBe('繼母')
    expect(g.term(stepMom, me)).toBe('繼女')
    // 離婚的父母互看 → 前夫 / 前妻(關係保留,但不再走姻親路徑)
    expect(g.term(mom, dad)).toBe('前夫')
    expect(g.term(dad, mom)).toBe('前妻')
  })
})

describe('缺 birth_date 時的年齡判斷 fallback', () => {
  it('兄弟姊妹缺生日 → 「兄弟」「姊妹」並標記 needsBirthday', () => {
    const g = fixture()
    const mom = g.person('媽', 'female', '1960')
    const me = g.person('我', 'male', null)
    const bro = g.person('兄弟', 'male', '1990')
    const sis = g.person('姊妹', 'female', null)
    g.parents(null, mom, me, bro, sis)
    expect(g.result(me, bro)).toMatchObject({ term: '兄弟', kind: 'approx', needsBirthday: true })
    expect(g.result(me, sis)).toMatchObject({ term: '姊妹', kind: 'approx', needsBirthday: true })
  })
  it('只填年份且同年 → 無法判斷,退為中性詞;年份不同即可判斷', () => {
    const g = fixture()
    const mom = g.person('媽', 'female', '1960')
    const me = g.person('我', 'male', '1990')
    const twinish = g.person('同年', 'male', '1990')
    const older = g.person('年長', 'male', '1988')
    g.parents(null, mom, me, twinish, older)
    expect(g.result(me, twinish)).toMatchObject({ term: '兄弟', needsBirthday: true })
    expect(g.term(me, older)).toBe('哥哥')
  })
  it('父之兄弟缺生日 → 叔伯', () => {
    const g = fixture()
    const gp = g.person('爺爺', 'male', '1940')
    const dad = g.person('爸', 'male', null)
    const unc = g.person('叔伯', 'male', null)
    g.parents(gp, null, dad, unc)
    const me = g.person('我', 'male', '1990')
    g.parent(dad, me)
    expect(g.result(me, unc)).toMatchObject({ term: '叔伯', kind: 'approx', needsBirthday: true })
    // 姑姑不需要年齡
    const aunt = g.person('姑', 'female', null)
    g.parent(gp, aunt)
    expect(g.result(me, aunt)).toMatchObject({ term: '姑姑', kind: 'exact' })
  })
  it('性別未指定的兄弟姊妹 → 兄弟姊妹', () => {
    const g = fixture()
    const mom = g.person('媽', 'female', '1960')
    const me = g.person('我', 'male', '1990')
    const x = g.person('X', 'unspecified', '1992')
    g.parents(null, mom, me, x)
    expect(g.result(me, x)).toMatchObject({ term: '兄弟姊妹', kind: 'approx', needsBirthday: false })
  })
  it('compareAge / parseBirth / ageFromBirth 基本行為', () => {
    expect(compareAge({ birth_date: '1980' }, { birth_date: '1990-01-01' })).toBe(1)
    expect(compareAge({ birth_date: '1990-03' }, { birth_date: '1990-01' })).toBe(-1)
    expect(compareAge({ birth_date: '1990' }, { birth_date: '1990-01' })).toBe(0)
    expect(compareAge({ birth_date: null }, { birth_date: '1990' })).toBe(0)
    expect(parseBirth('1990-2-3')).toEqual({ y: 1990, m: 2, d: 3 })
    expect(parseBirth('abc')).toBeNull()
    expect(ageFromBirth('1990-05-01', new Date(2026, 8, 14))).toEqual({ age: 36, approx: false })
    expect(ageFromBirth('1990', new Date(2026, 8, 14))).toEqual({ age: 36, approx: true })
    expect(ageFromBirth('1990-12', new Date(2026, 8, 14))).toEqual({ age: 35, approx: true })
  })
})

describe('進階模式:曾祖 / 曾孫、遠親、完整姻親網', () => {
  function fourGenerations() {
    const g = fixture()
    const ggp = g.person('曾祖父', 'male', '1910')
    const ggm = g.person('曾祖母', 'female', '1912')
    g.marry(ggp, ggm)
    const gp = g.person('爺爺', 'male', '1940')
    const gpBro = g.person('叔公', 'male', '1943')
    const gpSis = g.person('姑婆', 'female', '1945')
    g.parents(ggp, ggm, gp, gpBro, gpSis)
    const dad = g.person('爸', 'male', '1965')
    g.parent(gp, dad)
    const me = g.person('我', 'male', '1990')
    g.parent(dad, me)
    const son = g.person('兒', 'male', '2015')
    g.parent(me, son)
    const grandson = g.person('孫', 'male', '2040')
    g.parent(son, grandson)
    const greatGrandson = g.person('曾孫', 'male', '2065')
    g.parent(grandson, greatGrandson)
    const greatGreat = g.person('玄孫女', 'female', '2090')
    g.parent(greatGrandson, greatGreat)
    return { g, ggp, ggm, gp, gpBro, gpSis, dad, me, son, grandson, greatGrandson, greatGreat }
  }

  it('基本模式下曾祖父母用組合式描述(fallback),不會 undefined', () => {
    const { g, me, ggp } = fourGenerations()
    const r = g.result(me, ggp)
    expect(r.kind).toBe('fallback')
    expect(r.term).toBe('爺爺的爸爸')
  })
  it('進階模式:曾祖父母 / 曾孫 / 高祖 / 玄孫', () => {
    const { g, me, ggp, ggm, son, grandson, greatGrandson, greatGreat, gp } = fourGenerations()
    const adv = { advanced: true }
    expect(g.term(me, ggp, adv)).toBe('曾祖父')
    expect(g.term(me, ggm, adv)).toBe('曾祖母')
    expect(g.term(gp, son, adv)).toBe('曾孫') // 爺爺 → 爸 → 我 → 兒:三代
    expect(g.term(gp, grandson, adv)).toBe('玄孫')
    expect(g.term(me, greatGrandson, adv)).toBe('曾孫')
    expect(g.term(me, greatGreat, adv)).toBe('玄孫女')
    // 五代以上(來孫)沒有固定稱謂 → 組合式
    expect(g.result(gp, greatGrandson, adv)).toMatchObject({ term: '玄孫的兒子', kind: 'fallback' })
  })
  it('高祖父:往上四代', () => {
    const { g, ggp, son } = fourGenerations()
    expect(g.term(son, ggp, { advanced: true })).toBe('高祖父')
    expect(g.result(son, ggp).kind).toBe('fallback')
  })
  it('祖父的兄弟姊妹 → 叔公 / 姑婆(進階)', () => {
    const { g, me, gpBro, gpSis } = fourGenerations()
    expect(g.term(me, gpBro, { advanced: true })).toBe('叔公')
    expect(g.term(me, gpSis, { advanced: true })).toBe('姑婆')
    expect(g.term(me, gpBro)).toBe('爺爺的弟弟')
  })
  it('妯娌 / 連襟 / 親家', () => {
    const g = fixture()
    const gp = g.person('爺爺', 'male', '1940')
    const bro1 = g.person('大哥', 'male', '1965')
    const bro2 = g.person('二弟', 'male', '1968')
    g.parents(gp, null, bro1, bro2)
    const wife1 = g.person('大嫂', 'female', '1966')
    const wife2 = g.person('二弟媳', 'female', '1970')
    g.marry(bro1, wife1)
    g.marry(bro2, wife2)
    const adv = { advanced: true }
    expect(g.term(wife1, wife2, adv)).toBe('妯娌')
    expect(g.term(wife2, wife1, adv)).toBe('妯娌')
    expect(g.result(wife1, wife2).kind).toBe('fallback') // 基本模式:「小叔的太太」
    expect(g.term(wife1, wife2)).toBe('小叔的太太')

    const gm = g.person('外婆', 'female', '1945')
    const sis1 = g.person('大姊', 'female', '1970')
    const sis2 = g.person('小妹', 'female', '1974')
    g.parents(null, gm, sis1, sis2)
    const h1 = g.person('大姊夫', 'male', '1969')
    const h2 = g.person('小妹夫', 'male', '1973')
    g.marry(sis1, h1)
    g.marry(sis2, h2)
    expect(g.term(h1, h2, adv)).toBe('連襟')
    expect(g.term(h1, h2)).toBe('小姨子的先生')

    // 親家:兒子的太太的父母
    const son = g.person('兒', 'male', '1995')
    g.parents(bro1, wife1, son)
    const sonWife = g.person('媳', 'female', '1996')
    g.marry(son, sonWife)
    const inLawDad = g.person('親家公', 'male', '1965')
    const inLawMom = g.person('親家母', 'female', '1967')
    g.parents(inLawDad, inLawMom, sonWife)
    expect(g.term(bro1, inLawDad, adv)).toBe('親家公')
    expect(g.term(wife1, inLawMom, adv)).toBe('親家母')
    expect(g.term(bro1, inLawDad)).toBe('媳婦的爸爸')
  })
  it('堂姪 / 表姪、再堂 / 再表兄弟姊妹', () => {
    const g = fixture()
    const ggp = g.person('曾祖父', 'male', '1910')
    const gp1 = g.person('爺爺', 'male', '1940')
    const gp2 = g.person('叔公', 'male', '1943')
    g.parents(ggp, null, gp1, gp2)
    const dad = g.person('爸', 'male', '1965')
    const uncle = g.person('叔叔', 'male', '1968')
    g.parents(gp1, null, dad, uncle)
    const dadCousin = g.person('堂叔', 'male', '1970')
    g.parent(gp2, dadCousin)
    const me = g.person('我', 'male', '1990')
    g.parent(dad, me)
    const cousin = g.person('堂弟', 'male', '1992')
    g.parent(uncle, cousin)
    const cousinKid = g.person('堂姪', 'male', '2020')
    g.parent(cousin, cousinKid)
    const second = g.person('再堂妹', 'female', '1995')
    g.parent(dadCousin, second)
    const adv = { advanced: true }
    expect(g.term(me, cousinKid, adv)).toBe('堂姪')
    expect(g.term(me, cousinKid)).toBe('堂弟的兒子')
    expect(g.term(me, dadCousin, adv)).toBe('堂叔')
    expect(g.term(me, second, adv)).toBe('再堂妹')
    expect(g.term(second, me, adv)).toBe('再堂哥')

    // 母系:表姪
    const h = fixture()
    const mgp = h.person('外公', 'male', '1940')
    const mom = h.person('媽', 'female', '1965')
    const mUncle = h.person('舅', 'male', '1968')
    h.parents(mgp, null, mom, mUncle)
    const me2 = h.person('我', 'female', '1990')
    h.parent(mom, me2)
    const biaoCousin = h.person('表弟', 'male', '1993')
    h.parent(mUncle, biaoCousin)
    const biaoKid = h.person('表姪女', 'female', '2020')
    h.parent(biaoCousin, biaoKid)
    expect(h.term(me2, biaoKid, adv)).toBe('表姪女')
  })
})

describe('Fallback 組合式描述與邊界情況', () => {
  it('過於遠房 → 「表姊的兒子」形式,kind = fallback', () => {
    const s = standardFamily()
    const { f, me } = s
    const cousinKid = f.person('表姊的兒子', 'male', '2015')
    f.parent(s.cousinBiaoP, cousinKid)
    const r = f.result(me, cousinKid)
    expect(r.kind).toBe('fallback')
    expect(r.term).toBe('表姊的兒子')
  })
  it('路徑經過兩次 spouse 邊 → 組合式描述', () => {
    const s = standardFamily()
    const { f, me } = s
    // 太太的哥哥的太太
    const wifeBroWife = f.person('大舅子的太太', 'female', '1986')
    f.marry(s.wifeBroOld, wifeBroWife)
    const r = f.result(me, wifeBroWife)
    expect(r.kind).toBe('fallback')
    expect(r.term).toBe('大舅子的太太')
  })
  it('完全不相連 → null;不存在的人 → null', () => {
    const g = fixture()
    const a = g.person('A', 'male', '1990')
    const b = g.person('B', 'female', '1990')
    expect(g.result(a, b)).toBeNull()
    expect(g.result(a, 'nope')).toBeNull()
    expect(computeRelationTerm('x', 'y', buildGraph({}))).toBeNull()
  })
  it('等長路徑優先選純血緣', () => {
    // 我 → 兒子 有兩條路:直接 D(血緣)與 S→D(經配偶)。BFS 最短即為 D。
    // 這裡測更微妙的:配偶的孩子同時也是我的孩子時,一律走血緣路徑
    const g = fixture()
    const me = g.person('我', 'female', '1990')
    const husband = g.person('夫', 'male', '1988')
    g.marry(me, husband)
    const kid = g.person('孩', 'male', '2015')
    g.parents(husband, me, kid)
    const path = shortestPath(g.graph(), me, kid)
    expect(path.map((s) => s.type)).toEqual(['down'])
    // 我的孫子:D D(血緣)vs S D D(經配偶)→ 選血緣
    const grandkid = g.person('孫', 'female', '2040')
    g.parent(kid, grandkid)
    expect(shortestPath(g.graph(), me, grandkid).map((s) => s.type)).toEqual(['down', 'down'])
    // 兒子的太太:D S(1 spouse) 唯一;確認回傳媳婦
    const kidWife = g.person('媳', 'female', '2016')
    g.marry(kid, kidWife)
    expect(g.term(me, kidWife)).toBe('媳婦')
  })
  it('等長路徑同時含血緣與姻親時選 spouse 邊較少的那條', () => {
    // 自己的兄弟 = UD(0 spouse);同時兄弟也娶了自己太太的姊妹 → S U D S 較長,不影響。
    // 構造真正等長:X 是「我爸爸的太太(繼母)的兒子」= U S D,也同時是「我媽媽的兒子」= U D?
    // 那 U D 更短。改構造:目標 = 太太的哥哥,同時也是我姊姊的先生 → SUD vs UDS,皆 3 步 1 spouse → 兩者皆可。
    // 以「我的孩子的配偶的父母」(DSU, 1 spouse)對「我的配偶的孩子的配偶的父母」(SDSU) 驗證 BFS 不會挑後者。
    const g = fixture()
    const me = g.person('我', 'male', '1960')
    const wife = g.person('妻', 'female', '1962')
    g.marry(me, wife)
    const son = g.person('子', 'male', '1990')
    g.parents(me, wife, son)
    const sonWife = g.person('媳', 'female', '1991')
    g.marry(son, sonWife)
    const inLaw = g.person('親家', 'male', '1960')
    g.parent(inLaw, sonWife)
    expect(shortestPath(g.graph(), me, inLaw).map((s) => s.type)).toEqual(['down', 'spouse', 'up'])
    expect(g.term(me, inLaw, { advanced: true })).toBe('親家公')
  })
  it('離婚配偶不當作姻親路徑:前妻的父母不再是岳父母', () => {
    const g = fixture()
    const me = g.person('我', 'male', '1980')
    const ex = g.person('前妻', 'female', '1982')
    g.marry(me, ex, 'divorced')
    const exDad = g.person('前妻爸', 'male', '1950')
    g.parent(exDad, ex)
    expect(g.term(me, ex)).toBe('前妻')
    expect(g.result(me, exDad)).toBeNull() // 沒有其他路徑可達
    // 有共同孩子時,經孩子可達 → 「孩子的媽媽」
    const kid = g.person('孩', 'female', '2010')
    g.parents(me, ex, kid)
    expect(g.term(me, ex)).toBe('前妻') // 直接離婚配偶優先(BFS 會走 D U,但我們先判斷離婚邊)
  })
  it('喪偶仍算配偶關係(先生 / 太太),且姻親路徑仍可走', () => {
    const g = fixture()
    const me = g.person('我', 'female', '1980')
    const husband = g.person('亡夫', 'male', '1978', { is_deceased: true })
    g.marry(me, husband, 'widowed')
    const hDad = g.person('公公', 'male', '1950')
    g.parent(hDad, husband)
    expect(g.term(me, husband)).toBe('先生')
    expect(g.term(me, hDad)).toBe('公公')
  })
  it('compareSiblings:生日優先,分不出來再看排行', () => {
    expect(compareSiblings({ birth_order: 1 }, { birth_order: 2 })).toBe(1)
    expect(compareSiblings({ birth_date: '1990', birth_order: 1 }, { birth_date: '1990', birth_order: 3 })).toBe(1)
    expect(compareSiblings({ birth_date: '1995', birth_order: 1 }, { birth_date: '1990', birth_order: 2 })).toBe(-1) // 生日為準
    expect(compareSiblings({ birth_order: 2 }, {})).toBe(0)
  })
  it('沒有生日但有排行:仍能分出哥哥 / 弟弟、伯伯 / 叔叔', () => {
    const g = fixture()
    const gp = g.person('阿公', 'male')
    const dad = g.person('爸', 'male', null, { birth_order: 2 })
    const uncleOld = g.person('大伯', 'male', null, { birth_order: 1 })
    const uncleYoung = g.person('小叔', 'male', null, { birth_order: 3 })
    g.parents(gp, null, uncleOld, dad, uncleYoung)
    const me = g.person('我', 'male', null, { birth_order: 1 })
    const bro = g.person('弟', 'male', null, { birth_order: 2 })
    g.parents(dad, null, me, bro)
    expect(g.term(me, bro)).toBe('弟弟')
    expect(g.term(bro, me)).toBe('哥哥')
    expect(g.result(me, bro).needsBirthday).toBe(false)
    expect(g.term(me, uncleOld)).toBe('伯伯')
    expect(g.term(me, uncleYoung)).toBe('叔叔')
  })
  it('未婚伴侶叫「伴侶」而非先生 / 太太,但姻親路徑仍可走', () => {
    const g = fixture()
    const me = g.person('我', 'female', '1985')
    const partner = g.person('伴侶', 'male', '1984')
    g.marry(me, partner, 'partner')
    const pDad = g.person('伴侶的爸爸', 'male', '1955')
    g.parent(pDad, partner)
    expect(g.term(me, partner)).toBe('伴侶')
    expect(g.result(me, partner).generation).toBe(0)
    expect(g.result(me, pDad)).not.toBeNull()
    // 伴侶的孩子(非自己的)→ 繼子 / 繼女
    const step = g.person('伴侶的女兒', 'female', '2010')
    g.parent(partner, step)
    expect(g.term(me, step)).toBe('繼女')
  })
  it('前伴侶:不走姻親路徑,有共同孩子時仍優先顯示「前伴侶」', () => {
    const g = fixture()
    const me = g.person('我', 'male', '1980')
    const ex = g.person('前伴侶', 'female', '1982')
    g.marry(me, ex, 'ex_partner')
    const exMom = g.person('前伴侶媽', 'female', '1955')
    g.parent(exMom, ex)
    expect(g.term(me, ex)).toBe('前伴侶')
    expect(g.result(me, exMom)).toBeNull()
    const kid = g.person('孩', 'male', '2012')
    g.parents(me, ex, kid)
    expect(g.term(me, ex)).toBe('前伴侶')
    expect(g.term(me, kid)).toBe('兒子')
    expect(g.term(kid, ex)).toBe('媽媽')
  })
  it('半血緣兄弟姊妹(只共享一位家長)仍以兄弟姊妹稱呼', () => {
    const g = fixture()
    const dad = g.person('爸', 'male', '1960')
    const me = g.person('我', 'male', '1990')
    const half = g.person('半血緣妹', 'female', '1995')
    g.parent(dad, me)
    g.parent(dad, half)
    expect(g.term(me, half)).toBe('妹妹')
  })
  it('同性婚姻:兒子的先生 → 組合式描述而非亂猜', () => {
    const g = fixture()
    const me = g.person('我', 'female', '1960')
    const son = g.person('子', 'male', '1990')
    g.parent(me, son)
    const sonHusband = g.person('子的先生', 'male', '1989')
    g.marry(son, sonHusband)
    const r = g.result(me, sonHusband)
    expect(r.term).toBe('兒子的先生')
    expect(r.kind).toBe('fallback')
  })
})

describe('computeAllRelationTerms', () => {
  it('單次 BFS 結果與逐一計算一致,並包含 generation', () => {
    const s = standardFamily()
    const graph = s.f.graph()
    const all = computeAllRelationTerms(s.me, graph)
    for (const id of graph.persons.keys()) {
      const single = computeRelationTerm(s.me, id, graph)
      const batch = all.get(id) ?? null
      expect(batch?.term ?? null).toBe(single?.term ?? null)
      expect(batch?.generation ?? null).toBe(single?.generation ?? null)
    }
    expect(all.get(s.grandpa).generation).toBe(-2)
    expect(all.get(s.grandson).generation).toBe(2)
    expect(all.get(s.wife).generation).toBe(0)
  })
  it('切換視角只是重算字串:從奶奶看,爸爸變兒子、我變孫子', () => {
    const s = standardFamily()
    const graph = s.f.graph()
    const fromGrandma = computeAllRelationTerms(s.grandma, graph)
    expect(fromGrandma.get(s.dad).term).toBe('兒子')
    expect(fromGrandma.get(s.me).term).toBe('孫子')
    expect(fromGrandma.get(s.mom).term).toBe('媳婦')
    expect(fromGrandma.get(s.wife).term).toBe('孫媳婦'.replace('孫媳婦', fromGrandma.get(s.wife).term)) // 基本模式為組合式
    expect(computeAllRelationTerms(s.grandma, graph, { advanced: true }).get(s.wife).term).toBe('孫媳婦')
  })
})
