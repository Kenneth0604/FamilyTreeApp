import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase, isConfigured } from './supabase.js'
import { buildGraph, computeAllRelationTerms } from './kinship/index.js'
import { useToast } from './toast.jsx'

/**
 * 全域資料層
 * - Auth:帳號 + 密碼(Supabase Auth 底層仍是 email,帳號在前端轉成 帳號@AUTH_EMAIL_DOMAIN 這個不會實際收信的假信箱,
 *   所以 Supabase 專案要關閉「Confirm email」,否則新帳號永遠收不到驗證信)
 * - 家族群組:一個帳號可加入多個 family,目前使用中的 family 記在 localStorage
 * - 資料:people / parent_child / spouses 一次整包載入(家族樹規模小),
 *   Realtime postgres_changes → 重新抓取;另有 60 秒輪詢與回到前景時重抓作為備援
 * - 離線:最後一次的資料快取在 localStorage,離線時仍可瀏覽;
 *   寫入(新增 / 修改 / 刪除人物、關係、紀事、成員設定)先套用到本機並放進 outbox,再背景依序同步到 Supabase,
 *   離線或連不上時保留在 outbox,連線恢復後自動重送;伺服器拒絕(權限、重複關係)的操作會被丟棄並提示,然後重抓校正。
 *   需要伺服器回應的 RPC(建立 / 加入家族、重產邀請碼)仍為線上操作
 * - 稱謂:viewpoint 對所有人的稱謂用單次 BFS 一次算完(純前端、即時)
 */

const StoreContext = createContext(null)
const FAMILY_KEY = 'familytree:family'
const OUTBOX_KEY = 'familytree:outbox'
const cacheKey = (fid) => `familytree:cache:${fid}`
const POLL_MS = 60_000
const MAX_TRIES = 10 // 有網路卻連續失敗這麼多次就放棄該筆,避免卡住整個佇列
const WATCHED_TABLES = ['people', 'parent_child', 'spouses', 'person_entries', 'family_members', 'families', 'family_codes']

const AUTH_EMAIL_DOMAIN = 'familytree.invalid'
const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{2,30}$/

export function usernameToAuthEmail(username) {
  const u = String(username || '').trim().toLowerCase()
  if (!USERNAME_PATTERN.test(u)) throw new Error('帳號格式錯誤,請用 2-30 個英文字母、數字、下底線或減號')
  return `${u}@${AUTH_EMAIL_DOMAIN}`
}

/** 從 Supabase Auth 的 email 還原顯示用的帳號(去掉內部假網域) */
export function authEmailToUsername(email) {
  return String(email || '').split('@')[0]
}

function readJSON(key) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : null
  } catch {
    return null
  }
}
function writeJSON(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* ignore */
  }
}
function throwIf(error) {
  if (error) throw error
}
function isNetworkError(e) {
  const msg = String(e?.message || e || '')
  return (typeof navigator !== 'undefined' && navigator.onLine === false) || /Failed to fetch|NetworkError|Load failed|network/i.test(msg)
}
const newId = () => crypto.randomUUID()
const nowIso = () => new Date().toISOString()

/** 把一筆 outbox 操作真的送到 Supabase */
async function execOp(op) {
  if (op.type === 'insert') {
    const { error } = await supabase.from(op.table).insert(op.row)
    // 重送時上次可能其實已寫入(回應遺失):同一主鍵重複視為成功;其他唯一鍵衝突(重複關係)是真正的錯誤
    if (error && !/_pkey/.test(error.message || '')) throw error
  } else if (op.type === 'update') {
    const { error } = await supabase.from(op.table).update(op.row).eq('id', op.rowId)
    throwIf(error)
  } else if (op.type === 'delete') {
    const { error } = await supabase.from(op.table).delete().eq('id', op.rowId)
    throwIf(error)
  }
}

/** 把 Supabase 的錯誤訊息翻成比較好懂的中文 */
export function friendlyError(e) {
  const m = String(e?.message || e || '')
  if (/Invalid login credentials/i.test(m)) return '帳號或密碼錯誤'
  if (/Email not confirmed/i.test(m)) return '這個帳號尚未通過驗證,請聯絡管理員確認 Supabase 專案的 Email 驗證設定'
  if (/User already registered/i.test(m)) return '這個帳號已經註冊過了,請直接登入'
  if (/Password should be at least/i.test(m)) return '密碼至少需要 6 個字元'
  if (/rate limit/i.test(m)) return '操作太頻繁,請稍後再試'
  if (/找不到這個邀請碼/.test(m)) return '找不到這個邀請碼'
  if (/row-level security/i.test(m)) return '你在這個家族只能查看,不能編輯'
  if (/duplicate key.*spouses_pair/i.test(m)) return '這兩個人已經有配偶紀錄了'
  if (/duplicate key.*parent_child/i.test(m)) return '這組親子關係已經存在'
  if (/parent_child_check/i.test(m)) return '不能把自己設成自己的父母'
  if (isNetworkError(e)) return '目前離線或連線失敗'
  return m || '發生未知錯誤'
}

export function StoreProvider({ children }) {
  const toast = useToast()

  // ---------- 離線寫入佇列 ----------
  const [outbox, setOutboxState] = useState(() => readJSON(OUTBOX_KEY) ?? [])
  const outboxRef = useRef(outbox)
  const flushing = useRef(false)
  const setOutbox = useCallback((next) => {
    const value = typeof next === 'function' ? next(outboxRef.current) : next
    outboxRef.current = value
    writeJSON(OUTBOX_KEY, value.length ? value : null)
    setOutboxState(value)
  }, [])

  // ---------- Auth ----------
  const [authLoading, setAuthLoading] = useState(isConfigured)
  const [authUser, setAuthUser] = useState(null)

  useEffect(() => {
    if (!supabase) return
    supabase.auth
      .getSession()
      .then(({ data }) => setAuthUser(data.session?.user ?? null))
      .finally(() => setAuthLoading(false))
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  const login = useCallback(async (username, password) => {
    let email
    try {
      email = usernameToAuthEmail(username)
    } catch (e) {
      throw new Error(friendlyError(e))
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw new Error(friendlyError(error))
  }, [])

  const signup = useCallback(async (username, password) => {
    const email = usernameToAuthEmail(username) // 拋錯訊息已經是中文,不需要 friendlyError 包一層
    const { data, error } = await supabase.auth.signUp({ email, password })
    if (error) throw new Error(friendlyError(error))
    // 專案若開啟「Confirm email」,signUp 不會直接回 session(帳號用的是假信箱,收不到驗證信,務必關閉此設定)
    return { needsConfirm: !data.session }
  }, [])

  const logout = useCallback(async () => {
    // 尚未同步的變更綁定目前帳號,登出後不能由另一個帳號送出
    const n = outboxRef.current.length
    if (n > 0 && !confirm(`還有 ${n} 筆變更尚未同步到伺服器,登出會直接捨棄。確定登出?`)) return
    setOutbox([])
    await supabase.auth.signOut()
    setAuthUser(null)
  }, [setOutbox])

  // ---------- 家族群組 ----------
  const [memberships, setMemberships] = useState(null) // null = 尚未載入
  const [familyId, setFamilyIdState] = useState(() => readJSON(FAMILY_KEY))
  const [membershipsError, setMembershipsError] = useState('')

  const loadMemberships = useCallback(async () => {
    if (!authUser) return []
    const { data, error } = await supabase
      .from('family_members')
      .select('*, families(*)')
      .eq('auth_user_id', authUser.id)
      .order('joined_at')
    throwIf(error)
    return data ?? []
  }, [authUser])

  const [membershipAttempt, setMembershipAttempt] = useState(0)
  useEffect(() => {
    if (!authUser) {
      setMemberships(null)
      return
    }
    let cancelled = false
    setMembershipsError('')
    loadMemberships()
      .then((list) => {
        if (cancelled) return
        setMemberships(list)
        // 目前選的家族若已不在清單中(被移除 / 換帳號),改選第一個
        setFamilyIdState((cur) => {
          if (cur && list.some((m) => m.family_id === cur)) return cur
          const next = list[0]?.family_id ?? null
          writeJSON(FAMILY_KEY, next)
          return next
        })
      })
      .catch((e) => {
        if (cancelled) return
        // 離線且有快取的家族 → 允許進入離線模式
        if (isNetworkError(e) && familyId && readJSON(cacheKey(familyId))) {
          setMemberships([])
        } else {
          setMembershipsError(friendlyError(e))
        }
      })
    return () => {
      cancelled = true
    }
  }, [authUser, loadMemberships, membershipAttempt]) // eslint-disable-line react-hooks/exhaustive-deps

  const switchFamily = useCallback((fid) => {
    writeJSON(FAMILY_KEY, fid)
    setFamilyIdState(fid)
  }, [])

  const createFamily = useCallback(
    async (name, displayName) => {
      const { data, error } = await supabase.rpc('create_family', { p_name: name, p_display_name: displayName })
      if (error) throw new Error(friendlyError(error))
      const list = await loadMemberships()
      setMemberships(list)
      switchFamily(data)
      return data
    },
    [loadMemberships, switchFamily],
  )

  // 同一個入口吃兩種邀請碼,後端依碼的種類決定 editor / viewer
  const joinFamily = useCallback(
    async (code, displayName) => {
      const { data, error } = await supabase.rpc('join_family', { p_code: code, p_display_name: displayName })
      if (error) throw new Error(friendlyError(error))
      const list = await loadMemberships()
      setMemberships(list)
      switchFamily(data)
      return data
    },
    [loadMemberships, switchFamily],
  )

  // ---------- 家族資料 ----------
  const [family, setFamily] = useState(null)
  const [codes, setCodes] = useState(null) // { invite_code, view_code },只有 editor 拿得到
  const [members, setMembers] = useState([])
  const [people, setPeople] = useState([])
  const [parentChild, setParentChild] = useState([])
  const [spouses, setSpouses] = useState([])
  const [entries, setEntries] = useState([]) // 生平紀事(整個家族一次載入)
  const [ready, setReady] = useState(false)
  const [fatal, setFatal] = useState('')
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' && navigator.onLine === false)
  const [syncing, setSyncing] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const refreshTimer = useRef(null)

  const applySnapshot = useCallback((snap) => {
    setFamily(snap.family ?? null)
    setMembers(snap.members ?? [])
    setPeople(snap.people ?? [])
    setParentChild(snap.parentChild ?? [])
    setSpouses(snap.spouses ?? [])
    setEntries(snap.entries ?? [])
  }, [])

  const refresh = useCallback(async () => {
    if (!familyId || !authUser) return
    if (outboxRef.current.length > 0) return // 還有未同步的變更:不覆蓋本機狀態,flush 完成後會再抓
    setSyncing(true)
    try {
      const [fam, mem, ppl, pc, sp, en, cd] = await Promise.all([
        supabase.from('families').select('*').eq('id', familyId).maybeSingle(),
        supabase.from('family_members').select('*').eq('family_id', familyId).order('joined_at'),
        supabase.from('people').select('*').eq('family_id', familyId).order('created_at'),
        supabase.from('parent_child').select('*').eq('family_id', familyId),
        supabase.from('spouses').select('*').eq('family_id', familyId),
        supabase.from('person_entries').select('*').eq('family_id', familyId).order('created_at'),
        // viewer 被 RLS 擋掉會拿到 null(不是錯誤)
        supabase.from('family_codes').select('*').eq('family_id', familyId).maybeSingle(),
      ])
      for (const r of [fam, mem, ppl, pc, sp, en]) throwIf(r.error)
      if (outboxRef.current.length > 0) return // 抓取期間又有新變更:以本機為準
      const snap = { family: fam.data, members: mem.data ?? [], people: ppl.data ?? [], parentChild: pc.data ?? [], spouses: sp.data ?? [], entries: en.data ?? [], at: Date.now() }
      applySnapshot(snap)
      setCodes(cd.error ? null : cd.data)
      writeJSON(cacheKey(familyId), snap)
      setOffline(false)
      setFatal('')
    } catch (e) {
      if (isNetworkError(e)) setOffline(true)
      else throw e
    } finally {
      setSyncing(false)
    }
  }, [familyId, authUser, applySnapshot])

  /** 依序把 outbox 送出;連不上就保留稍後重送,被伺服器拒絕就丟棄並提示 */
  const flush = useCallback(async () => {
    if (flushing.current || !authUser || outboxRef.current.length === 0) return
    flushing.current = true
    setSyncing(true)
    let needRefresh = false
    try {
      while (outboxRef.current.length > 0) {
        const op = outboxRef.current[0]
        if (op.uid !== authUser.id) {
          // 別的帳號留下的變更不能用目前身分送出
          setOutbox((q) => q.filter((x) => x.id !== op.id))
          needRefresh = true
          continue
        }
        try {
          await execOp(op)
          setOutbox((q) => q.filter((x) => x.id !== op.id))
          setOffline(false)
          needRefresh = true
        } catch (e) {
          if (isNetworkError(e)) {
            setOffline(true)
            if (navigator.onLine !== false) {
              // 明明有網路卻一直送不出去:累計次數,超過上限就放棄這筆,避免後面全部卡住
              const tries = (op.tries ?? 0) + 1
              if (tries >= MAX_TRIES) {
                setOutbox((q) => q.filter((x) => x.id !== op.id))
                toast.error(`同步多次失敗,已放棄這筆變更:${friendlyError(e)}`)
                needRefresh = true
                continue
              }
              setOutbox((q) => q.map((x) => (x.id === op.id ? { ...x, tries } : x)))
            }
            break
          }
          setOutbox((q) => q.filter((x) => x.id !== op.id))
          toast.error(`同步失敗,已還原:${friendlyError(e)}`)
          needRefresh = true
        }
      }
    } finally {
      flushing.current = false
      setSyncing(false)
    }
    if (needRefresh) await refresh().catch(() => {})
  }, [authUser, setOutbox, refresh, toast])

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      if (outboxRef.current.length > 0) flush().catch(() => {})
      else refresh().catch((e) => console.warn('重新載入失敗', e))
    }, 250)
  }, [refresh, flush])

  useEffect(() => {
    if (!authUser || !familyId) {
      setReady(false)
      return
    }
    let cancelled = false
    setFatal('')
    // 先用快取畫出來(離線 / 慢網路時立刻可用)
    const cached = readJSON(cacheKey(familyId))
    if (cached) {
      applySnapshot(cached)
      setReady(true)
    } else {
      setReady(false)
      applySnapshot({})
    }
    // 丟掉別的帳號留下的未同步變更(同一台裝置換人登入)
    const foreign = outboxRef.current.filter((op) => op.uid !== authUser.id)
    if (foreign.length > 0) {
      setOutbox((q) => q.filter((op) => op.uid === authUser.id))
      toast.info(`已捨棄 ${foreign.length} 筆其他帳號未同步的變更`)
    }

    ;(async () => {
      try {
        if (outboxRef.current.length > 0) await flush()
        else await refresh()
        if (!cancelled) setReady(true)
      } catch (e) {
        if (cancelled) return
        if (!cached) setFatal(`載入資料失敗:${friendlyError(e)}`)
      }
    })()

    const channel = supabase.channel(`familytree-${familyId}`)
    for (const table of WATCHED_TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table, filter: table === 'families' ? `id=eq.${familyId}` : `family_id=eq.${familyId}` }, scheduleRefresh)
    }
    channel.subscribe()

    const onVisible = () => document.visibilityState === 'visible' && scheduleRefresh()
    const onOnline = () => {
      setOffline(false)
      scheduleRefresh()
    }
    const onOffline = () => setOffline(true)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const poll = setInterval(scheduleRefresh, POLL_MS)

    return () => {
      cancelled = true
      clearTimeout(refreshTimer.current)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      supabase.removeChannel(channel)
    }
  }, [authUser, familyId, attempt, refresh, flush, scheduleRefresh, applySnapshot, setOutbox, toast])

  // 本機變更(含尚未同步的)也寫進快取,離線時關掉再開不會看到舊資料;family.id 對不上代表還是上一個家族的資料
  useEffect(() => {
    if (!ready || !familyId || family?.id !== familyId) return
    writeJSON(cacheKey(familyId), { family, members, people, parentChild, spouses, entries, at: Date.now() })
  }, [ready, familyId, family, members, people, parentChild, spouses, entries])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  // ---------- 對照 ----------
  const member = useMemo(() => members.find((m) => m.auth_user_id === authUser?.id) ?? null, [members, authUser])
  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people])
  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members])
  const nameOf = useCallback((pid) => peopleById.get(pid)?.name ?? '(已刪除)', [peopleById])
  const memberName = useCallback((mid) => membersById.get(mid)?.display_name ?? '未知成員', [membersById])

  const graph = useMemo(() => buildGraph({ people, parentChild, spouses }), [people, parentChild, spouses])

  const selfId = member?.self_person_id && peopleById.has(member.self_person_id) ? member.self_person_id : null
  const viewpointId = useMemo(() => {
    const v = member?.viewpoint_person_id
    if (v && peopleById.has(v)) return v
    return selfId
  }, [member, peopleById, selfId])
  const advanced = Boolean(member?.advanced_terms)
  const canEdit = member?.role !== 'viewer'

  const terms = useMemo(
    () => (viewpointId ? computeAllRelationTerms(viewpointId, graph, { advanced }) : new Map()),
    [viewpointId, graph, advanced],
  )
  const termFor = useCallback((pid) => terms.get(pid) ?? null, [terms])

  // ---------- 寫入 ----------
  const stamp = useCallback(() => ({ family_id: familyId, updated_by: member?.id ?? null }), [familyId, member])

  /** 線上操作(需要伺服器回應的 RPC):失敗直接拋出中文錯誤 */
  const run = useCallback(
    async (fn) => {
      try {
        const out = await fn()
        scheduleRefresh()
        return out
      } catch (e) {
        throw new Error(friendlyError(e))
      }
    },
    [scheduleRefresh],
  )

  /** 離線優先寫入:先套用到本機、寫進 outbox,再背景同步 */
  const mutate = useCallback(
    (op, applyLocal) => {
      applyLocal()
      setOutbox((q) => [...q, { id: newId(), uid: authUser?.id ?? null, ...op }])
      setTimeout(() => flush().catch(() => {}), 0)
    },
    [authUser, setOutbox, flush],
  )

  const addPerson = useCallback(
    async (fields) => {
      const row = { id: newId(), ...stamp(), created_by: member?.id ?? null, ...fields }
      mutate({ type: 'insert', table: 'people', row }, () => setPeople((list) => [...list, { ...row, created_at: nowIso(), updated_at: nowIso() }]))
      return row.id
    },
    [mutate, stamp, member],
  )

  const updatePerson = useCallback(
    async (id, fields) => {
      const patch = { ...fields, updated_by: member?.id ?? null }
      mutate({ type: 'update', table: 'people', rowId: id, row: patch }, () =>
        setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...patch, updated_at: nowIso() } : p))),
      )
    },
    [mutate, member],
  )

  const deletePerson = useCallback(
    async (id) => {
      mutate({ type: 'delete', table: 'people', rowId: id }, () => {
        setPeople((list) => list.filter((p) => p.id !== id))
        setParentChild((list) => list.filter((r) => r.parent_id !== id && r.child_id !== id))
        setSpouses((list) => list.filter((r) => r.person_a_id !== id && r.person_b_id !== id))
        setEntries((list) => list.filter((r) => r.person_id !== id))
      })
    },
    [mutate],
  )

  const addParentChild = useCallback(
    async (parentId, childId) => {
      if (parentId === childId) throw new Error('不能把自己設成自己的父母')
      if (parentChild.some((r) => r.parent_id === parentId && r.child_id === childId)) throw new Error('這組親子關係已經存在')
      const row = { id: newId(), family_id: familyId, parent_id: parentId, child_id: childId, created_by: member?.id ?? null }
      mutate({ type: 'insert', table: 'parent_child', row }, () => setParentChild((list) => [...list, { ...row, created_at: nowIso() }]))
      return row.id
    },
    [mutate, familyId, member, parentChild],
  )

  const removeParentChild = useCallback(
    async (id) => mutate({ type: 'delete', table: 'parent_child', rowId: id }, () => setParentChild((list) => list.filter((r) => r.id !== id))),
    [mutate],
  )

  const addSpouse = useCallback(
    async (a, b, status = 'married') => {
      if (a === b) throw new Error('不能和自己結婚')
      if (spouses.some((r) => (r.person_a_id === a && r.person_b_id === b) || (r.person_a_id === b && r.person_b_id === a))) throw new Error('這兩個人已經有配偶紀錄了')
      const row = { id: newId(), family_id: familyId, person_a_id: a, person_b_id: b, status, created_by: member?.id ?? null, updated_by: member?.id ?? null }
      mutate({ type: 'insert', table: 'spouses', row }, () => setSpouses((list) => [...list, { ...row, created_at: nowIso(), updated_at: nowIso() }]))
      return row.id
    },
    [mutate, familyId, member, spouses],
  )

  const updateSpouse = useCallback(
    async (id, status) => {
      const patch = { status, updated_by: member?.id ?? null }
      mutate({ type: 'update', table: 'spouses', rowId: id, row: patch }, () => setSpouses((list) => list.map((r) => (r.id === id ? { ...r, ...patch, updated_at: nowIso() } : r))))
    },
    [mutate, member],
  )

  const removeSpouse = useCallback(
    async (id) => mutate({ type: 'delete', table: 'spouses', rowId: id }, () => setSpouses((list) => list.filter((r) => r.id !== id))),
    [mutate],
  )

  const addEntry = useCallback(
    async (fields) => {
      const row = { id: newId(), ...stamp(), created_by: member?.id ?? null, ...fields }
      mutate({ type: 'insert', table: 'person_entries', row }, () => setEntries((list) => [...list, { ...row, created_at: nowIso(), updated_at: nowIso() }]))
      return row.id
    },
    [mutate, stamp, member],
  )

  const updateEntry = useCallback(
    async (id, fields) => {
      const patch = { ...fields, updated_by: member?.id ?? null }
      mutate({ type: 'update', table: 'person_entries', rowId: id, row: patch }, () =>
        setEntries((list) => list.map((r) => (r.id === id ? { ...r, ...patch, updated_at: nowIso() } : r))),
      )
    },
    [mutate, member],
  )

  const deleteEntry = useCallback(
    async (id) => mutate({ type: 'delete', table: 'person_entries', rowId: id }, () => setEntries((list) => list.filter((r) => r.id !== id))),
    [mutate],
  )

  const updateMember = useCallback(
    async (patch) => {
      if (!member) throw new Error('尚未載入成員資料')
      mutate({ type: 'update', table: 'family_members', rowId: member.id, row: patch }, () => setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, ...patch } : m))))
    },
    [mutate, member],
  )
  const setViewpoint = useCallback((pid) => updateMember({ viewpoint_person_id: pid }), [updateMember])
  const setSelf = useCallback(
    (pid) => {
      // 設定自己時,若視角尚未設定(或等於舊的自己)就一起切過去
      const patch = { self_person_id: pid }
      if (!member?.viewpoint_person_id || member.viewpoint_person_id === member.self_person_id) patch.viewpoint_person_id = pid
      return updateMember(patch)
    },
    [updateMember, member],
  )
  const setAdvanced = useCallback((on) => updateMember({ advanced_terms: Boolean(on) }), [updateMember])
  const setDisplayName = useCallback((name) => updateMember({ display_name: name }), [updateMember])

  const renameFamily = useCallback(
    async (name) => mutate({ type: 'update', table: 'families', rowId: familyId, row: { name } }, () => setFamily((f) => (f ? { ...f, name } : f))),
    [mutate, familyId],
  )

  const regenerateInvite = useCallback(
    () =>
      run(async () => {
        const { data, error } = await supabase.rpc('regenerate_invite_code', { p_family_id: familyId })
        throwIf(error)
        setCodes((c) => ({ ...c, invite_code: data }))
        return data
      }),
    [run, familyId],
  )

  const regenerateViewCode = useCallback(
    () =>
      run(async () => {
        const { data, error } = await supabase.rpc('regenerate_view_code', { p_family_id: familyId })
        throwIf(error)
        setCodes((c) => ({ ...c, view_code: data }))
        return data
      }),
    [run, familyId],
  )

  const leaveFamily = useCallback(async () => {
    if (!member) return
    const { error } = await supabase.from('family_members').delete().eq('id', member.id)
    if (error) throw new Error(friendlyError(error))
    writeJSON(cacheKey(familyId), null)
    const list = await loadMemberships()
    setMemberships(list)
    switchFamily(list[0]?.family_id ?? null)
  }, [member, familyId, loadMemberships, switchFamily])

  const value = useMemo(
    () => ({
      configured: isConfigured,
      authLoading, authUser, login, signup, logout,
      memberships, membershipsError, retryMemberships: () => setMembershipAttempt((n) => n + 1),
      familyId, family, codes, member, members, canEdit, switchFamily, createFamily, joinFamily, leaveFamily, renameFamily, regenerateInvite, regenerateViewCode,
      people, parentChild, spouses, entries, graph, peopleById, nameOf, memberName,
      ready, fatal, retry, refresh, offline, syncing, pending: outbox.length, sync: flush,
      viewpointId, selfId, advanced, terms, termFor,
      addPerson, updatePerson, deletePerson, addParentChild, removeParentChild, addSpouse, updateSpouse, removeSpouse,
      addEntry, updateEntry, deleteEntry,
      setViewpoint, setSelf, setAdvanced, setDisplayName,
      toast,
    }),
    [
      authLoading, authUser, login, signup, logout, memberships, membershipsError, familyId, family, codes, member, members, canEdit,
      switchFamily, createFamily, joinFamily, leaveFamily, renameFamily, regenerateInvite, regenerateViewCode, people, parentChild, spouses, entries,
      graph, peopleById, nameOf, memberName, ready, fatal, retry, refresh, offline, syncing, outbox.length, flush, viewpointId, selfId, advanced,
      terms, termFor, addPerson, updatePerson, deletePerson, addParentChild, removeParentChild, addSpouse, updateSpouse,
      removeSpouse, addEntry, updateEntry, deleteEntry, setViewpoint, setSelf, setAdvanced, setDisplayName, toast,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}
