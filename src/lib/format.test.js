import { describe, it, expect } from 'vitest'
import { parseDeathAge, lifespan, ageLabel, longevityBonus, totalPower } from './format.js'

describe('format.parseDeathAge', () => {
  it('單一數字、範圍、「多」都能解析', () => {
    expect(parseDeathAge('85')).toEqual({ lo: 85, hi: 85 })
    expect(parseDeathAge('約 85 歲')).toEqual({ lo: 85, hi: 85 })
    expect(parseDeathAge('80-90')).toEqual({ lo: 80, hi: 90 })
    expect(parseDeathAge('90～80')).toEqual({ lo: 80, hi: 90 })
    expect(parseDeathAge('80多')).toEqual({ lo: 80, hi: 89 })
  })
  it('看不懂的回 null', () => {
    expect(parseDeathAge('')).toBeNull()
    expect(parseDeathAge('很老')).toBeNull()
    expect(parseDeathAge('1985-03')).toBeNull()
  })
})

describe('format.lifespan / ageLabel / 壽命加成', () => {
  const now = new Date('2026-09-16')
  it('在世者算到今天', () => {
    expect(lifespan({ birth_date: '1990-05-01' }, now)).toEqual({ years: 36, approx: false, deceased: false })
  })
  it('已故:生日 + 逝世日優先,精確到日才不算約', () => {
    expect(lifespan({ is_deceased: true, birth_date: '1938-06-01', death_date: '2021-03-15' })).toEqual({ years: 82, approx: false, deceased: true })
    expect(ageLabel({ is_deceased: true, birth_date: '1930', death_date: '2021' })).toBe('享耆壽 約 91 歲')
  })
  it('已故:沒日期就用大概歲數,範圍取中間值', () => {
    expect(lifespan({ is_deceased: true, death_age: '85' })).toEqual({ years: 85, approx: true, deceased: true, range: undefined })
    expect(ageLabel({ is_deceased: true, death_age: '85' })).toBe('享壽 約 85 歲')
    expect(ageLabel({ is_deceased: true, death_age: '80-90' })).toBe('享壽 約 80–90 歲')
    expect(ageLabel({ is_deceased: true, birth_date: '1930', death_age: '50' })).toBe('享年 約 50 歲')
    expect(ageLabel({ is_deceased: true })).toBe('已故')
  })
  it('壽命加成:60 起每 10 歲 +1,戰力 = 地位 + 加成', () => {
    expect(longevityBonus({ is_deceased: true, death_age: '80-90' }).bonus).toBe(3) // 中間值 85
    expect(longevityBonus({ is_deceased: true, death_age: '59' }).bonus).toBe(0)
    expect(longevityBonus({ birth_date: '1920', is_deceased: false }, now).title).toBe('人瑞')
    expect(totalPower({ power: 9, is_deceased: true, death_age: '85' })).toBe(12)
    expect(totalPower({ is_deceased: true })).toBe(5)
  })
})
