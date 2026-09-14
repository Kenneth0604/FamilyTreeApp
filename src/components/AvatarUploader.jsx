import { useRef, useState } from 'react'
import { uploadAvatar } from '../lib/images.js'
import { useStore } from '../lib/store.jsx'
import { useToast } from '../lib/toast.jsx'
import Avatar from './Avatar.jsx'

/** 大頭照上傳:選檔 → 裁正方形縮圖 → 上傳 Storage → 回傳網址 */
export default function AvatarUploader({ value, onChange, preview }) {
  const { familyId } = useStore()
  const toast = useToast()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)

  async function onPick(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true)
    try {
      const url = await uploadAvatar(file, familyId)
      onChange(url)
    } catch (err) {
      toast.error(err.message || '上傳失敗')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex items-center gap-4">
      <button type="button" onClick={() => inputRef.current?.click()} className="relative" disabled={busy}>
        <Avatar person={{ ...preview, avatar_url: value }} size="xl" />
        {busy && <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-xs text-white">上傳中…</span>}
      </button>
      <div className="flex flex-col gap-2">
        <button type="button" onClick={() => inputRef.current?.click()} className="btn-secondary btn-sm" disabled={busy}>
          {value ? '更換照片' : '上傳照片'}
        </button>
        {value && (
          <button type="button" onClick={() => onChange(null)} className="btn-danger-outline btn-sm" disabled={busy}>
            移除照片
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" hidden onChange={onPick} />
    </div>
  )
}
