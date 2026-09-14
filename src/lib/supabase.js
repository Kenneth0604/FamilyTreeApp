import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)

export const supabase = isConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        // 登入一次後長期保持:session 存在裝置 localStorage,access token 到期自動用 refresh token 續期
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'familytree-auth',
      },
    })
  : null

/** 大頭照 Storage bucket(公開讀取;路徑第一段為 family_id,只有該家族成員能上傳) */
export const AVATAR_BUCKET = 'avatars'
