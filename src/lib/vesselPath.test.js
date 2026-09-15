import { describe, it, expect } from 'vitest'
import { buildVesselPath, routePoints, sampleCenterline, widthParent, widthChild, widthSpouse, VESSEL } from './vesselPath.js'

describe('vesselPath', () => {
  it('routePoints:直角骨架', () => {
    expect(routePoints(0, 0, 100, 50, 'target')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }])
    expect(routePoints(0, 0, 100, 50, 'source')).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }])
    expect(routePoints(0, 0, 100, 100, 'step')).toEqual([{ x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 100 }])
  })
  it('轉角被圓滑:取樣點不再經過原本的直角頂點,但首尾不變', () => {
    const c = sampleCenterline([{ x: 0, y: 0 }, { x: 0, y: 100 }, { x: 100, y: 100 }])
    expect(c[0]).toEqual({ x: 0, y: 0 })
    expect(c[c.length - 1]).toEqual({ x: 100, y: 100 })
    expect(c.some((p) => p.x === 0 && p.y === 100)).toBe(false)
    // 轉角附近有點同時偏離兩條直線 → 真的是曲線
    expect(c.some((p) => p.x > 0.5 && p.y < 99.5)).toBe(true)
  })
  it('寬度函數:父母端寬→細管、細管→孩子端寬、配偶兩端寬中間窄', () => {
    expect(widthParent(0, 0, 200)).toBe(VESSEL.max)
    expect(widthParent(1, 200, 200)).toBeCloseTo(VESSEL.min)
    expect(widthChild(0, 0, 200)).toBeCloseTo(VESSEL.min)
    expect(widthChild(1, 200, 200)).toBeCloseTo(VESSEL.max)
    const sp = widthSpouse()
    expect(sp(0)).toBeCloseTo(9)
    expect(sp(0.5)).toBeCloseTo(4)
    expect(sp(1)).toBeCloseTo(9)
  })
  it('buildVesselPath:封閉形狀、中心線、中點', () => {
    const g = buildVesselPath([{ x: 0, y: 0 }, { x: 0, y: 200 }], widthParent)
    expect(g.d.startsWith('M ')).toBe(true)
    expect(g.d.endsWith(' Z')).toBe(true)
    expect(g.centerD.startsWith('M 0 0')).toBe(true)
    expect(g.length).toBeCloseTo(200)
    expect(g.mid.y).toBeCloseTo(100, -1)
    // 起點兩側各偏移半個最大寬度
    expect(g.d.startsWith(`M ${-VESSEL.max / 2} 0`) || g.d.startsWith(`M ${VESSEL.max / 2} 0`)).toBe(true)
  })
  it('退化輸入(重疊點)回傳空字串而不是壞掉的 path', () => {
    expect(buildVesselPath([{ x: 1, y: 1 }, { x: 1, y: 1 }], widthParent).d).toBe('')
    // 骨架中間點跟終點重疊(sx === tx)→ 自動退成直線
    expect(buildVesselPath(routePoints(10, 0, 10, 80, 'target'), widthParent).d).not.toBe('')
  })
})
