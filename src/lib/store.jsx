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
 * - 離線:最後一次成功載入的資料快取在 localStorage,離線時仍可瀏覽
 * - 稱謂:viewpoint 對所有人的稱謂用單次 BFS 一次算完(純前端、即時)
 */

const StoreContext = createContext(null)
const FAMILY_KEY = 'familytree:family'
const cacheKey = (fid) => `familytree:cache:${fid}`
const POLL_MS = 60_000
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
    await supabase.auth.signOut()
    setAuthUser(null)
  }, [])

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

  const scheduleRefresh = useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => {
      refresh().catch((e) => console.warn('重新載入失敗', e))
    }, 250)
  }, [refresh])

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
    ;(async () => {
      try {
        await refresh()
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
  }, [authUser, familyId, attempt, refresh, scheduleRefresh, applySnapshot])

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

  const addPerson = useCallback(
    (fields) =>
      run(async () => {
        const row = { ...stamp(), created_by: member?.id ?? null, ...fields }
        const { data, error } = await supabase.from('people').insert(row).select('id').single()
        throwIf(error)
        // 立即放進本地狀態,讓後續建關係的 UI 不用等 refresh
        setPeople((list) => (list.some((p) => p.id === data.id) ? list : [...list, { ...row, id: data.id, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]))
        return data.id
      }),
    [run, stamp, member],
  )

  const updatePerson = useCallback(
    (id, fields) =>
      run(async () => {
        const patch = { ...fields, updated_by: member?.id ?? null }
        const { error } = await supabase.from('people').update(patch).eq('id', id)
        throwIf(error)
        setPeople((list) => list.map((p) => (p.id === id ? { ...p, ...patch, updated_at: new Date().toISOString() } : p)))
      }),
    [run, member],
  )

  const deletePerson = useCallback(
    (id) =>
      run(async () => {
        const { error } = await supabase.from('people').delete().eq('id', id)
        throwIf(error)
        setPeople((list) => list.filter((p) => p.id !== id))
        setParentChild((list) => list.filter((r) => r.parent_id !== id && r.child_id !== id))
        setSpouses((list) => list.filter((r) => r.person_a_id !== id && r.person_b_id !== id))
        setEntries((list) => list.filter((r) => r.person_id !== id))
      }),
    [run],
  )

  const addParentChild = useCallback(
    (parentId, childId) =>
      run(async () => {
        if (parentId === childId) throw new Error('不能把自己設成自己的父母')
        const row = { family_id: familyId, parent_id: parentId, child_id: childId, created_by: member?.id ?? null }
        const { data, error } = await supabase.from('parent_child').insert(row).select('*').single()
        throwIf(error)
        setParentChild((list) => (list.some((r) => r.id === data.id) ? list : [...list, data]))
        return data.id
      }),
    [run, familyId, member],
  )

  const removeParentChild = useCallback(
    (id) =>
      run(async () => {
        const { error } = await supabase.from('parent_child').delete().eq('id', id)
        throwIf(error)
        setParentChild((list) => list.filter((r) => r.id !== id))
      }),
    [run],
  )

  const addSpouse = useCallback(
    (a, b, status = 'married') =>
      run(async () => {
        if (a === b) throw new Error('不能和自己結婚')
        const row = { family_id: familyId, person_a_id: a, person_b_id: b, status, created_by: member?.id ?? null, updated_by: member?.id ?? null }
        const { data, error } = await supabase.from('spouses').insert(row).select('*').single()
        throwIf(error)
        setSpouses((list) => (list.some((r) => r.id === data.id) ? list : [...list, data]))
        return data.id
      }),
    [run, familyId, member],
  )

  const updateSpouse = useCallback(
    (id, status) =>
      run(async () => {
        const { error } = await supabase.from('spouses').update({ status, updated_by: member?.id ?? null }).eq('id', id)
        throwIf(error)
        setSpouses((list) => list.map((r) => (r.id === id ? { ...r, status } : r)))
      }),
    [run, member],
  )

  const removeSpouse = useCallback(
    (id) =>
      run(async () => {
        const { error } = await supabase.from('spouses').delete().eq('id', id)
        throwIf(error)
        setSpouses((list) => list.filter((r) => r.id !== id))
      }),
    [run],
  )

  const addEntry = useCallback(
    (fields) =>
      run(async () => {
        const row = { ...stamp(), created_by: member?.id ?? null, ...fields }
        const { data, error } = await supabase.from('person_entries').insert(row).select('*').single()
        throwIf(error)
        setEntries((list) => (list.some((r) => r.id === data.id) ? list : [...list, data]))
        return data.id
      }),
    [run, stamp, member],
  )

  const updateEntry = useCallback(
    (id, fields) =>
      run(async () => {
        const patch = { ...fields, updated_by: member?.id ?? null }
        const { error } = await supabase.from('person_entries').update(patch).eq('id', id)
        throwIf(error)
        setEntries((list) => list.map((r) => (r.id === id ? { ...r, ...patch, updated_at: new Date().toISOString() } : r)))
      }),
    [run, member],
  )

  const deleteEntry = useCallback(
    (id) =>
      run(async () => {
        const { error } = await supabase.from('person_entries').delete().eq('id', id)
        throwIf(error)
        setEntries((list) => list.filter((r) => r.id !== id))
      }),
    [run],
  )

  const updateMember = useCallback(
    (patch) =>
      run(async () => {
        if (!member) throw new Error('尚未載入成員資料')
        const { error } = await supabase.from('family_members').update(patch).eq('id', member.id)
        throwIf(error)
        setMembers((list) => list.map((m) => (m.id === member.id ? { ...m, ...patch } : m)))
      }),
    [run, member],
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
    (name) =>
      run(async () => {
        const { error } = await supabase.from('families').update({ name }).eq('id', familyId)
        throwIf(error)
        setFamily((f) => (f ? { ...f, name } : f))
      }),
    [run, familyId],
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
      ready, fatal, retry, refresh, offline, syncing,
      viewpointId, selfId, advanced, terms, termFor,
      addPerson, updatePerson, deletePerson, addParentChild, removeParentChild, addSpouse, updateSpouse, removeSpouse,
      addEntry, updateEntry, deleteEntry,
      setViewpoint, setSelf, setAdvanced, setDisplayName,
      toast,
    }),
    [
      authLoading, authUser, login, signup, logout, memberships, membershipsError, familyId, family, codes, member, members, canEdit,
      switchFamily, createFamily, joinFamily, leaveFamily, renameFamily, regenerateInvite, regenerateViewCode, people, parentChild, spouses, entries,
      graph, peopleById, nameOf, memberName, ready, fatal, retry, refresh, offline, syncing, viewpointId, selfId, advanced,
      terms, termFor, addPerson, updatePerson, deletePerson, addParentChild, removeParentChild, addSpouse, updateSpouse,
      removeSpouse, addEntry, updateEntry, deleteEntry, setViewpoint, setSelf, setAdvanced, setDisplayName, toast,
    ],
  )

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}
