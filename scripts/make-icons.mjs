/**
 * 產生 PWA 圖示(不依賴 canvas 套件,直接用 zlib 編 PNG)
 * 圖案:粉紅 → 薰衣草漸層底、白色的三代家族樹(三個圓點 + 連線)
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'

const OUT = new URL('../public/icons/', import.meta.url)
mkdirSync(OUT, { recursive: true })

function crc32(buf) {
  let c
  const table = []
  for (let n = 0; n < 256; n++) {
    c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function encodePng(size, rgba) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

const lerp = (a, b, t) => a + (b - a) * t
const FROM = [0xe8, 0x6a, 0xa8]
const TO = [0xa7, 0x8b, 0xfa]

function render(size) {
  const px = Buffer.alloc(size * size * 4)
  const S = size
  const r = S * 0.22 // 圓角半徑
  // 節點(相對座標)與連線
  const nodes = [
    { x: 0.5, y: 0.27, r: 0.085 }, // 祖
    { x: 0.32, y: 0.55, r: 0.075 }, // 父母
    { x: 0.68, y: 0.55, r: 0.075 },
    { x: 0.22, y: 0.8, r: 0.06 }, // 子
    { x: 0.42, y: 0.8, r: 0.06 },
    { x: 0.68, y: 0.8, r: 0.06 },
  ]
  const lines = [
    [0, 1], [0, 2], [1, 3], [1, 4], [2, 5],
  ]
  const lw = 0.035

  const distSeg = (px_, py_, ax, ay, bx, by) => {
    const dx = bx - ax, dy = by - ay
    const t = Math.max(0, Math.min(1, ((px_ - ax) * dx + (py_ - ay) * dy) / (dx * dx + dy * dy)))
    return Math.hypot(px_ - (ax + t * dx), py_ - (ay + t * dy))
  }

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = (y * S + x) * 4
      // 圓角遮罩
      const cx = Math.min(Math.max(x + 0.5, r), S - r)
      const cy = Math.min(Math.max(y + 0.5, r), S - r)
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      const alpha = Math.max(0, Math.min(1, r - d + 0.5))
      if (alpha <= 0) continue
      const t = (x + y) / (2 * S)
      let R = lerp(FROM[0], TO[0], t), Gc = lerp(FROM[1], TO[1], t), B = lerp(FROM[2], TO[2], t)
      // 白色圖形
      const u = (x + 0.5) / S, v = (y + 0.5) / S
      let w = 0
      for (const [a, b] of lines) {
        const dd = distSeg(u, v, nodes[a].x, nodes[a].y, nodes[b].x, nodes[b].y)
        w = Math.max(w, Math.min(1, (lw / 2 - dd) * S + 0.5))
      }
      for (const n of nodes) {
        const dd = Math.hypot(u - n.x, v - n.y)
        w = Math.max(w, Math.min(1, (n.r - dd) * S + 0.5))
      }
      if (w > 0) {
        R = lerp(R, 255, w); Gc = lerp(Gc, 255, w); B = lerp(B, 255, w)
      }
      px[i] = R; px[i + 1] = Gc; px[i + 2] = B; px[i + 3] = Math.round(alpha * 255)
    }
  }
  return px
}

for (const size of [180, 192, 512]) {
  const png = encodePng(size, render(size))
  writeFileSync(new URL(`icon-${size}.png`, OUT), png)
  console.log(`icon-${size}.png`, png.length, 'bytes')
}
