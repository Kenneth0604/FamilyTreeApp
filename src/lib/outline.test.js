import { describe, it, expect } from 'vitest'
import { unionPolygons, roundedPath, unionOutline } from './outline.js'

describe('outline.unionPolygons', () => {
  it('單一長方形 → 四個頂點、順時針', () => {
    const [poly] = unionPolygons([{ x: 0, y: 0, w: 10, h: 5 }])
    expect(poly).toEqual([[0, 0], [10, 0], [10, 5], [0, 5]])
  })
  it('兩個斜著重疊的正方形聯集成一個階梯形(8 個頂點)', () => {
    const polys = unionPolygons([{ x: 0, y: 0, w: 10, h: 10 }, { x: 5, y: 5, w: 10, h: 10 }])
    expect(polys).toHaveLength(1)
    expect(polys[0]).toHaveLength(8) // 兩個正方形斜著疊 = 8 個角
  })
  it('相鄰但不重疊的長方形合併成一個大長方形', () => {
    const polys = unionPolygons([{ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 10, h: 10 }])
    expect(polys).toHaveLength(1)
    expect(polys[0]).toEqual([[0, 0], [20, 0], [20, 10], [0, 10]])
  })
  it('分開的長方形各自成圈', () => {
    const polys = unionPolygons([{ x: 0, y: 0, w: 10, h: 10 }, { x: 50, y: 0, w: 10, h: 10 }])
    expect(polys).toHaveLength(2)
  })
  it('中空的口字形會多出一個內洞圈', () => {
    const ring = [
      { x: 0, y: 0, w: 30, h: 5 },
      { x: 0, y: 25, w: 30, h: 5 },
      { x: 0, y: 0, w: 5, h: 30 },
      { x: 25, y: 0, w: 5, h: 30 },
    ]
    expect(unionPolygons(ring)).toHaveLength(2)
  })
  it('空輸入回空陣列', () => {
    expect(unionPolygons([])).toEqual([])
  })
})

describe('outline.roundedPath / unionOutline', () => {
  it('每個轉角一段 Q 曲線,並以 Z 收尾', () => {
    const d = roundedPath([[0, 0], [100, 0], [100, 50], [0, 50]], 10)
    expect(d.match(/Q/g)).toHaveLength(4)
    expect(d.endsWith('Z')).toBe(true)
    expect(d.startsWith('M0 10 Q0 0 10 0')).toBe(true) // 從第一個角前 radius 處起筆,繞過角落
  })
  it('半徑不會超過短邊的一半', () => {
    const d = roundedPath([[0, 0], [6, 0], [6, 50], [0, 50]], 20)
    expect(d.startsWith('M0 20 Q0 0 3 0')).toBe(true) // 長邊磨 20、短邊(6)只磨 3
  })
  it('unionOutline 回傳包圍盒與 path', () => {
    const o = unionOutline([{ x: 10, y: 20, w: 100, h: 50 }, { x: 60, y: 60, w: 100, h: 50 }], 8)
    expect(o.x).toBe(10)
    expect(o.y).toBe(20)
    expect(o.w).toBe(150)
    expect(o.h).toBe(90)
    expect(o.pieces).toBe(1)
    expect(unionOutline([])).toBeNull()
  })
})
