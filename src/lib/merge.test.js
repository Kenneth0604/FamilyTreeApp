import { describe, it, expect } from 'vitest'
import { bridgeRows, linkDescription } from './merge.js'
import { buildGraph, computeRelationTerm } from './kinship/index.js'

const link = (over) => ({ id: 'L1', merged_family_id: 'M', person_a_id: 'a', person_b_id: 'b', created_at: '2026-01-01T00:00:00Z', created_by: null, ...over })

describe('合併家族樹:橋接關係 → 圖', () => {
  it('spouse:保留狀態,方向無關', () => {
    const { spouses, parentChild } = bridgeRows([link({ relation: 'spouse', status: 'partner' })], 'M')
    expect(parentChild).toEqual([])
    expect(spouses).toHaveLength(1)
    expect(spouses[0]).toMatchObject({ id: 'link-L1', family_id: 'M', person_a_id: 'a', person_b_id: 'b', status: 'partner', bridge: true })
  })
  it("parent_side = 'a':產生碼那一方的人是父母", () => {
    const { parentChild } = bridgeRows([link({ relation: 'parent_child', parent_side: 'a' })], 'M')
    expect(parentChild[0]).toMatchObject({ parent_id: 'a', child_id: 'b' })
  })
  it("parent_side = 'b':輸入碼那一方的人是父母", () => {
    const { parentChild } = bridgeRows([link({ relation: 'parent_child', parent_side: 'b' })], 'M')
    expect(parentChild[0]).toMatchObject({ parent_id: 'b', child_id: 'a' })
  })
  it('兩個家族接起來後稱謂引擎能跨橋推算', () => {
    // 家族 A:阿公 → 爸爸;家族 B:媽媽 → 我。橋:爸爸(a,產生碼方)是 我(b)的父母
    const people = [
      { id: 'gp', name: '阿公', gender: 'male', family_id: 'A' },
      { id: 'dad', name: '爸', gender: 'male', family_id: 'A' },
      { id: 'mom', name: '媽', gender: 'female', family_id: 'B' },
      { id: 'me', name: '我', gender: 'male', family_id: 'B' },
    ]
    const parentChild = [
      { parent_id: 'gp', child_id: 'dad' },
      { parent_id: 'mom', child_id: 'me' },
    ]
    const bridges = bridgeRows([link({ relation: 'parent_child', parent_side: 'a', person_a_id: 'dad', person_b_id: 'me' })], 'M')
    const g = buildGraph({ people, parentChild: [...parentChild, ...bridges.parentChild], spouses: [] })
    expect(computeRelationTerm('me', 'dad', g)?.term).toBe('爸爸')
    expect(computeRelationTerm('me', 'gp', g)?.term).toBe('爺爺')
    expect(computeRelationTerm('me', 'mom', g)?.term).toBe('媽媽')
    expect(computeRelationTerm('gp', 'me', g)?.term).toBe('孫子')
  })
  it('linkDescription', () => {
    expect(linkDescription({ family_name: '林家', person_name: '林大明', person_gender: 'male', relation: 'parent_child', is_parent: true })).toBe('林家的 林大明 是對方所選人物的爸爸')
    expect(linkDescription({ family_name: '林家', person_name: '林小美', relation: 'spouse', status: 'married' })).toBe('林家的 林小美 是對方所選人物的已婚配偶 / 伴侶')
    expect(linkDescription({ person_name: '小孩', relation: 'parent_child', is_parent: false })).toBe('小孩 是對方所選人物的小孩')
  })
})
