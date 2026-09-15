/**
 * 中文親屬稱謂計算引擎(台灣慣用稱呼)
 *
 * computeRelationTerm(viewpointId, targetId, graph, options)
 *   → { term, kind, needsBirthday, path, generation } | null
 *
 * kind:
 *  - 'self'     viewpoint 就是 target
 *  - 'exact'    對照表中的固定稱謂
 *  - 'approx'   有固定稱謂但因缺生日 / 性別未指定而退為中性詞(例如「兄弟姊妹」「叔伯」)
 *  - 'fallback' 表中沒有對應,以「表姊的兒子」這種組合式描述呈現
 *
 * 路徑由 graph.js 的 BFS 找出(純血緣優先),再拆成 U(往上到父母)/ D(往下到子女)/ S(配偶)
 * 的原子步驟,依 code(例如 'UUD' = 父母的兄弟姊妹)查對照規則。
 */
import { bfs, pathFromBfs, generationOfPath } from './graph.js'
import { compareAge, compareSiblings } from './birth.js'

const G = (p) => (p?.gender === 'male' ? 'm' : p?.gender === 'female' ? 'f' : 'u')

const exact = (term) => ({ term, kind: 'exact', needsBirthday: false })
const approx = (term, needsBirthday = false) => ({ term, kind: 'approx', needsBirthday })

/** 依 target 性別選字;性別未指定 → 中性詞(approx) */
function byGender(p, m, f, u) {
  const g = G(p)
  if (g === 'm') return exact(m)
  if (g === 'f') return exact(f)
  return approx(u)
}

/**
 * 需要比較年齡的同輩型稱謂(哥哥/弟弟、堂哥/堂弟、大舅子/小舅子…)
 * @param target 要稱呼的人
 * @param ref    比較基準(自己、配偶、父母…)
 * @param n      { mOld, mYoung, fOld, fYoung, mAny, fAny, any }
 * @param cmp    比較函式:兄弟姊妹用 compareSiblings(可用排行),堂表等非同胞用 compareAge
 */
function elderTerm(target, ref, n, cmp = compareSiblings) {
  const g = G(target)
  if (g === 'u') return approx(n.any)
  const c = cmp(target, ref)
  if (c === 0) return approx(g === 'm' ? n.mAny : n.fAny, true)
  if (g === 'm') return exact(c > 0 ? n.mOld : n.mYoung)
  return exact(c > 0 ? n.fOld : n.fYoung)
}

/** 同輩稱謂組:無前綴時是哥哥/弟弟/姊姊/妹妹,有前綴(堂、表、再堂…)時是堂哥/堂弟… */
const siblingNames = (prefix = '') =>
  prefix
    ? {
        mOld: `${prefix}哥`, mYoung: `${prefix}弟`, fOld: `${prefix}姊`, fYoung: `${prefix}妹`,
        mAny: `${prefix}兄弟`, fAny: `${prefix}姊妹`, any: `${prefix}兄弟姊妹`,
      }
    : {
        mOld: '哥哥', mYoung: '弟弟', fOld: '姊姊', fYoung: '妹妹',
        mAny: '兄弟', fAny: '姊妹', any: '兄弟姊妹',
      }

/** 堂 / 表 判定:父之兄弟的孩子才是「堂」,其餘為「表」;性別資料不足時標「堂/表」 */
function cousinPrefix(parent, uncle) {
  const gp = G(parent)
  const gu = G(uncle)
  if (gp === 'm' && gu === 'm') return '堂'
  if (gp === 'f' || gu === 'f') return '表'
  return '堂/表'
}

/**
 * 查對照表。P 為路徑上的人物(P[0] = viewpoint、P[last] = target)。
 * 回傳 null 代表表中沒有固定稱謂,交給組合式描述處理。
 */
function lookup(code, P, opts) {
  const adv = Boolean(opts.advanced)
  const V = P[0]
  const T = P[P.length - 1]

  switch (code) {
    // ---------------------------------------------------------------- 一步
    case 'U':
      return byGender(T, '爸爸', '媽媽', '父母')
    case 'D':
      return byGender(T, '兒子', '女兒', '孩子')
    case 'S':
      return byGender(T, '先生', '太太', '配偶')

    // ---------------------------------------------------------------- 兩步
    case 'UU': {
      const gp = G(P[1])
      if (gp === 'm') return byGender(T, '爺爺', '奶奶', '祖父母')
      if (gp === 'f') return byGender(T, '外公', '外婆', '外祖父母')
      return { ...byGender(T, '祖父', '祖母', '祖父母'), kind: 'approx' }
    }
    case 'DD': {
      const gc = G(P[1])
      if (gc === 'm') return byGender(T, '孫子', '孫女', '孫子女')
      if (gc === 'f') return byGender(T, '外孫', '外孫女', '外孫子女')
      return { ...byGender(T, '孫子', '孫女', '孫子女'), kind: 'approx' }
    }
    case 'UD':
      return elderTerm(T, V, siblingNames())
    case 'US':
      return byGender(T, '繼父', '繼母', '父母的配偶')
    case 'SD':
      return byGender(T, '繼子', '繼女', '配偶的孩子')
    case 'SU': {
      const gv = G(V)
      if (gv === 'm') return byGender(T, '岳父', '岳母', '太太的父母')
      if (gv === 'f') return byGender(T, '公公', '婆婆', '先生的父母')
      return { ...byGender(T, '配偶的爸爸', '配偶的媽媽', '配偶的父母'), kind: 'approx' }
    }
    case 'DS': {
      const ch = G(P[1])
      const gt = G(T)
      if (gt === 'u') return approx('孩子的配偶')
      if (ch === 'm' && gt === 'f') return exact('媳婦')
      if (ch === 'f' && gt === 'm') return exact('女婿')
      if (ch === 'u') return approx(gt === 'f' ? '媳婦' : '女婿')
      return null // 同性婚姻等組合 → 交給組合式描述(「兒子的先生」)
    }
    case 'DU':
      // 孩子的另一位家長,但不是(現任)配偶
      return { ...byGender(T, '孩子的爸爸', '孩子的媽媽', '孩子的家長'), kind: 'approx' }

    // ---------------------------------------------------------------- 三步
    case 'UUD': {
      const par = P[1]
      const gp = G(par)
      if (gp === 'm') {
        const gt = G(T)
        if (gt === 'm') {
          const c = compareSiblings(T, par)
          if (c === 0) return approx('叔伯', true)
          return exact(c > 0 ? '伯伯' : '叔叔')
        }
        if (gt === 'f') return exact('姑姑')
        return approx('爸爸的兄弟姊妹')
      }
      if (gp === 'f') return byGender(T, '舅舅', '阿姨', '媽媽的兄弟姊妹')
      return { ...byGender(T, '父母的兄弟', '父母的姊妹', '父母的兄弟姊妹'), kind: 'approx' }
    }
    case 'UDD': {
      const sib = G(P[2])
      if (sib === 'm') return byGender(T, '姪子', '姪女', '姪子女')
      if (sib === 'f') return byGender(T, '外甥', '外甥女', '外甥子女')
      return approx('兄弟姊妹的孩子')
    }
    case 'UDS': {
      const sib = P[2]
      const gs = G(sib)
      const gt = G(T)
      if (gs === 'm' && gt === 'f') {
        const c = compareSiblings(sib, V)
        if (c === 0) return approx('兄弟的太太', true)
        return exact(c > 0 ? '嫂嫂' : '弟媳')
      }
      if (gs === 'f' && gt === 'm') {
        const c = compareSiblings(sib, V)
        if (c === 0) return approx('姊妹的先生', true)
        return exact(c > 0 ? '姊夫' : '妹夫')
      }
      if (gs === 'u' && gt === 'u') return approx('兄弟姊妹的配偶')
      return null
    }
    case 'SUD': {
      const spouse = P[1]
      const gv = G(V)
      if (gv === 'm') {
        return elderTerm(T, spouse, {
          mOld: '大舅子', mYoung: '小舅子', fOld: '大姨子', fYoung: '小姨子',
          mAny: '太太的兄弟', fAny: '太太的姊妹', any: '太太的兄弟姊妹',
        })
      }
      if (gv === 'f') {
        return elderTerm(T, spouse, {
          mOld: '大伯', mYoung: '小叔', fOld: '大姑', fYoung: '小姑',
          mAny: '先生的兄弟', fAny: '先生的姊妹', any: '先生的兄弟姊妹',
        })
      }
      return { ...byGender(T, '配偶的兄弟', '配偶的姊妹', '配偶的兄弟姊妹'), kind: 'approx' }
    }
    case 'UUU': {
      if (!adv) return null
      const pure = G(P[1]) === 'm' && G(P[2]) === 'm'
      return pure ? byGender(T, '曾祖父', '曾祖母', '曾祖父母') : byGender(T, '外曾祖父', '外曾祖母', '外曾祖父母')
    }
    case 'DDD': {
      if (!adv) return null
      const pure = G(P[1]) === 'm' && G(P[2]) === 'm'
      return pure ? byGender(T, '曾孫', '曾孫女', '曾孫子女') : byGender(T, '外曾孫', '外曾孫女', '外曾孫子女')
    }
    case 'DDS': {
      if (!adv) return null
      const outer = G(P[1]) === 'f' ? '外' : ''
      const gc = G(P[2])
      const gt = G(T)
      if (gc === 'm' && gt === 'f') return exact(`${outer}孫媳婦`)
      if (gc === 'f' && gt === 'm') return exact(`${outer}孫女婿`)
      return null
    }
    case 'DSU': {
      if (!adv) return null
      return byGender(T, '親家公', '親家母', '親家')
    }

    // ---------------------------------------------------------------- 四步
    case 'UUDD':
      return elderTerm(T, V, siblingNames(cousinPrefix(P[1], P[3])), compareAge)
    case 'UUDS': {
      const par = P[1]
      const unc = P[3]
      const gp = G(par)
      const gu = G(unc)
      const gt = G(T)
      if (gp === 'm') {
        if (gu === 'm' && gt === 'f') {
          const c = compareSiblings(unc, par)
          if (c === 0) return approx('叔伯的太太', true)
          return exact(c > 0 ? '伯母' : '嬸嬸')
        }
        if (gu === 'f' && gt === 'm') return exact('姑丈')
        return null
      }
      if (gp === 'f') {
        if (gu === 'm' && gt === 'f') return exact('舅媽')
        if (gu === 'f' && gt === 'm') return exact('姨丈')
        return null
      }
      return null
    }
    case 'UUUD': {
      if (!adv) return null
      const gp = P[2]
      const g = G(gp)
      const gt = G(T)
      if (g === 'm') {
        if (gt === 'm') {
          const c = compareSiblings(T, gp)
          if (c === 0) return approx('伯公/叔公', true)
          return exact(c > 0 ? '伯公' : '叔公')
        }
        if (gt === 'f') return exact('姑婆')
        return approx('祖父的兄弟姊妹')
      }
      if (g === 'f') return byGender(T, '舅公', '姨婆', '祖母的兄弟姊妹')
      return null
    }
    case 'UUUU': {
      if (!adv) return null
      const pure = G(P[1]) === 'm' && G(P[2]) === 'm' && G(P[3]) === 'm'
      return pure ? byGender(T, '高祖父', '高祖母', '高祖父母') : byGender(T, '外高祖父', '外高祖母', '外高祖父母')
    }
    case 'DDDD': {
      if (!adv) return null
      const pure = G(P[1]) === 'm' && G(P[2]) === 'm' && G(P[3]) === 'm'
      return pure ? byGender(T, '玄孫', '玄孫女', '玄孫子女') : byGender(T, '外玄孫', '外玄孫女', '外玄孫子女')
    }
    case 'UDDD': {
      if (!adv) return null
      const sib = G(P[2])
      if (sib === 'm') return byGender(T, '姪孫', '姪孫女', '姪孫子女')
      if (sib === 'f') return byGender(T, '外甥孫', '外甥孫女', '外甥孫子女')
      return null
    }
    case 'SUDS': {
      if (!adv) return null
      const gv = G(V)
      const gs = G(P[1])
      const gsib = G(P[3])
      const gt = G(T)
      if (gv === 'f' && gs === 'm' && gsib === 'm' && gt === 'f') return exact('妯娌')
      if (gv === 'm' && gs === 'f' && gsib === 'f' && gt === 'm') return exact('連襟')
      return null
    }
    case 'SUDD': {
      if (!adv) return null
      // 配偶的兄弟姊妹的孩子:跟著配偶叫
      const sib = G(P[3])
      if (sib === 'm') return byGender(T, '姪子', '姪女', '姪子女')
      if (sib === 'f') return byGender(T, '外甥', '外甥女', '外甥子女')
      return null
    }

    // ---------------------------------------------------------------- 五步以上(進階)
    case 'UUDDS': {
      if (!adv) return null
      const prefix = cousinPrefix(P[1], P[3])
      const cousin = P[4]
      const gc = G(cousin)
      const gt = G(T)
      if (gc === 'm' && gt === 'f') {
        const c = compareAge(cousin, V)
        if (c === 0) return approx(`${prefix}兄弟的太太`, true)
        return exact(c > 0 ? `${prefix}嫂` : `${prefix}弟媳`)
      }
      if (gc === 'f' && gt === 'm') {
        const c = compareAge(cousin, V)
        if (c === 0) return approx(`${prefix}姊妹的先生`, true)
        return exact(c > 0 ? `${prefix}姊夫` : `${prefix}妹夫`)
      }
      return null
    }
    case 'UUDDD': {
      if (!adv) return null
      const prefix = cousinPrefix(P[1], P[3])
      return byGender(T, `${prefix}姪`, `${prefix}姪女`, `${prefix}姪子女`)
    }
    case 'UUUDD': {
      if (!adv) return null
      const par = P[1]
      const prefix = G(P[2]) === 'm' && G(P[4]) === 'm' ? '堂' : '表'
      const gp = G(par)
      const gt = G(T)
      if (gp === 'm') {
        if (gt === 'm') {
          const c = compareAge(T, par)
          if (c === 0) return approx(`${prefix}叔伯`, true)
          return exact(c > 0 ? `${prefix}伯` : `${prefix}叔`)
        }
        if (gt === 'f') return exact(`${prefix}姑`)
        return approx(`爸爸的${prefix}兄弟姊妹`)
      }
      if (gp === 'f') return byGender(T, `${prefix}舅`, `${prefix}姨`, `媽媽的${prefix}兄弟姊妹`)
      return null
    }
    case 'UUUDS': {
      if (!adv) return null
      const gp = P[2]
      const gu = P[4]
      const gt = G(T)
      if (G(gp) === 'm') {
        if (G(gu) === 'm' && gt === 'f') {
          const c = compareSiblings(gu, gp)
          if (c === 0) return approx('伯婆/嬸婆', true)
          return exact(c > 0 ? '伯婆' : '嬸婆')
        }
        if (G(gu) === 'f' && gt === 'm') return exact('姑丈公')
        return null
      }
      if (G(gp) === 'f') {
        if (G(gu) === 'm' && gt === 'f') return exact('舅婆')
        if (G(gu) === 'f' && gt === 'm') return exact('姨丈公')
      }
      return null
    }
    case 'UUUDDD': {
      if (!adv) return null
      // P = [V, 父母, 祖父母, 曾祖父母, 祖父母的兄弟姊妹, 父母的堂表兄弟姊妹, T]
      const pure = G(P[1]) === 'm' && G(P[2]) === 'm' && G(P[4]) === 'm' && G(P[5]) === 'm'
      return elderTerm(T, V, siblingNames(pure ? '再堂' : '再表'), compareAge)
    }
    default:
      return null
  }
}

/** 由步驟序列產生 code('UUD')與人物序列 P */
function unpack(viewpointId, steps, graph) {
  const code = steps.map((s) => (s.type === 'up' ? 'U' : s.type === 'down' ? 'D' : 'S')).join('')
  const P = [graph.persons.get(viewpointId), ...steps.map((s) => graph.persons.get(s.to))]
  return { code, P }
}

/** 對照表查詢(不做組合式描述) */
function lookupSteps(viewpointId, steps, graph, opts) {
  if (steps.length === 0) return null
  const { code, P } = unpack(viewpointId, steps, graph)
  if (P.some((p) => !p)) return null
  return lookup(code, P, opts)
}

/**
 * 依步驟序列算稱謂;表中查不到就做組合式描述。
 * 組合方式:找「最長的、能查到固定稱謂的前綴」,其餘部分改以該中繼人物為視角遞迴計算,
 * 再用「的」串起來,例如 UUDDD → 表姊(UUDD)+ 兒子(D)= 「表姊的兒子」。
 * 單步(U/D/S)一定查得到,所以遞迴必然終止。
 */
function termForSteps(viewpointId, steps, graph, opts) {
  const hit = lookupSteps(viewpointId, steps, graph, opts)
  if (hit) return hit
  for (let k = steps.length - 1; k >= 1; k--) {
    const head = lookupSteps(viewpointId, steps.slice(0, k), graph, opts)
    if (!head) continue
    const midId = steps[k - 1].to
    const rest = termForSteps(midId, steps.slice(k), graph, opts)
    return {
      term: `${head.term}的${rest.term}`,
      kind: 'fallback',
      needsBirthday: Boolean(head.needsBirthday || rest.needsBirthday),
    }
  }
  // 理論上到不了這裡(單步必有結果);保底不要回 undefined
  return { term: '親屬', kind: 'fallback', needsBirthday: false }
}

/**
 * 直接的配偶 / 伴侶關係中,不能交給 BFS 的幾種:
 * - 離婚 / 前伴侶:BFS 不走已結束的邊,要另外判斷(即使可經由共同孩子繞到,也應顯示前夫 / 前妻)
 * - 未婚伴侶:走得到,但不該叫先生 / 太太
 */
function directSpouseTerm(viewpointId, targetId, graph) {
  const list = graph.spousesOf.get(viewpointId) || []
  const hit = list.find((s) => s.id === targetId)
  if (!hit) return null
  const T = graph.persons.get(targetId)
  const base = { path: [{ type: 'spouse', from: viewpointId, to: targetId }], generation: 0 }
  if (hit.status === 'divorced') return { ...byGender(T, '前夫', '前妻', '前配偶'), ...base }
  if (hit.status === 'ex_partner') return { term: '前伴侶', kind: 'exact', needsBirthday: false, ...base }
  if (hit.status === 'partner') return { term: '伴侶', kind: 'exact', needsBirthday: false, ...base }
  return null
}

function finish(result, steps) {
  return { ...result, path: steps, generation: generationOfPath(steps) }
}

const SELF = () => ({ term: '自己', kind: 'self', needsBirthday: false, path: [], generation: 0 })

/**
 * 計算 viewpoint 眼中 target 的稱謂
 * @param {string} viewpointId
 * @param {string} targetId
 * @param {import('./graph.js').Graph} graph
 * @param {{ advanced?: boolean }} [options]
 * @returns {{ term:string, kind:'self'|'exact'|'approx'|'fallback', needsBirthday:boolean, path:import('./graph.js').Step[], generation:number } | null}
 *          兩人不在圖中或完全不相連時回傳 null
 */
export function computeRelationTerm(viewpointId, targetId, graph, options = {}) {
  if (!graph?.persons?.has(viewpointId) || !graph.persons.has(targetId)) return null
  if (viewpointId === targetId) return SELF()
  const direct = directSpouseTerm(viewpointId, targetId, graph)
  if (direct) return direct
  const best = bfs(graph, viewpointId, { toId: targetId })
  const steps = pathFromBfs(best, targetId)
  if (!steps) return null
  return finish(termForSteps(viewpointId, steps, graph, options), steps)
}

/**
 * 一次算出 viewpoint 對圖上所有人的稱謂(單次 BFS,供列表 / 樹狀圖使用)
 * @returns {Map<string, ReturnType<typeof computeRelationTerm>>} 不相連的人不會出現在 Map 中
 */
export function computeAllRelationTerms(viewpointId, graph, options = {}) {
  const out = new Map()
  if (!graph?.persons?.has(viewpointId)) return out
  const best = bfs(graph, viewpointId)
  for (const id of graph.persons.keys()) {
    if (id === viewpointId) {
      out.set(id, SELF())
      continue
    }
    const direct = directSpouseTerm(viewpointId, id, graph)
    if (direct) {
      out.set(id, direct)
      continue
    }
    const steps = pathFromBfs(best, id)
    if (!steps) continue
    out.set(id, finish(termForSteps(viewpointId, steps, graph, options), steps))
  }
  return out
}
