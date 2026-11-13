import { expect, test } from 'vitest'
import { QUESTIONS, RESULTS, TRAITS, resultKey } from '../quiz'

test('모든 1위·2위 조합에 결과가 있다', () => {
  for (const a of TRAITS) for (const b of TRAITS) if (a !== b) expect(RESULTS[a + b]).toBeTruthy()
  expect(Object.keys(RESULTS)).toHaveLength(20)
  expect(QUESTIONS.every(q => q.a.length === TRAITS.length)).toBe(true)
  expect(Object.values(RESULTS).every(r => r.recs.length > 0 && r.tags.length > 0)).toBe(true)
})

test('많이 고른 순서대로, 동점이면 나중에 고른 쪽이 앞선다', () => {
  expect(resultKey(['r', 'r', 'r', 'd', 'd', 'g', 's', 'r'])).toBe('rd')
  expect(resultKey(['r', 'd', 'r', 'd'])).toBe('dr')          // 2:2 → 마지막에 고른 자극이 1위
  expect(resultKey(['h', 'h', 'h', 'h'])).toMatch(/^h[rdgs]$/)  // 한 성향만 골라도 결과가 나온다
})
