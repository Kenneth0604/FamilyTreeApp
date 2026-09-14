import { supabase, AVATAR_BUCKET } from './supabase.js'

const MAX_EDGE = 512
const QUALITY = 0.85

/** 在瀏覽器端裁成正方形 + 縮圖 + 轉 JPEG,避免手機原圖(數 MB)直接上傳 */
export async function compressAvatar(file) {
  if (!file.type.startsWith('image/')) throw new Error('只能上傳圖片檔')
  const bitmap = await loadImage(file)
  const side = Math.min(bitmap.width, bitmap.height)
  const sx = (bitmap.width - side) / 2
  const sy = (bitmap.height - side) / 2
  const out = Math.min(MAX_EDGE, side)
  const canvas = document.createElement('canvas')
  canvas.width = out
  canvas.height = out
  canvas.getContext('2d').drawImage(bitmap, sx, sy, side, side, 0, 0, out, out)
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', QUALITY))
  if (!blob) throw new Error('圖片處理失敗')
  return blob
}

function loadImage(file) {
  if ('createImageBitmap' in window) {
    return createImageBitmap(file).catch(() => loadViaElement(file))
  }
  return loadViaElement(file)
}

function loadViaElement(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('無法讀取圖片'))
    }
    img.src = url
  })
}

/** 上傳大頭照到 Storage 並回傳公開網址(路徑:<family_id>/<uuid>.jpg) */
export async function uploadAvatar(file, familyId) {
  const blob = await compressAvatar(file)
  const name = `${familyId}/${crypto.randomUUID()}.jpg`
  const { error } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(name, blob, { contentType: 'image/jpeg', upsert: false })
  if (error) throw error
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(name)
  return data.publicUrl
}

/** 從公開網址反推 storage 路徑,用於刪除 */
export function storagePathFromUrl(url) {
  if (!url) return null
  const marker = `/object/public/${AVATAR_BUCKET}/`
  const i = url.indexOf(marker)
  return i === -1 ? null : decodeURIComponent(url.slice(i + marker.length))
}

export async function deleteAvatar(url) {
  const path = storagePathFromUrl(url)
  if (!path) return
  await supabase.storage.from(AVATAR_BUCKET).remove([path])
}
