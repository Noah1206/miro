import { expect, test } from 'vitest'
import { QUESTIONS, RESULTS, TRAITS, resultKey } from '../quiz'

test('모든 1위·2위 조합에 결과가 있다', () => {
  for (const a of TRAITS) for (const b of TRAITS) if (a !== b) expect(RESULTS[a + b]).toBeTruthy()
  expect(Object.keys(RESULTS)).toHaveLength(12)
  expect(QUESTIONS.every(q => q.a.length === 4)).toBe(true)
})

test('많이 고른 순서대로, 동점이면 나중에 고른 쪽이 앞선다', () => {
  expect(resultKey(['d', 'd', 'd', 'o', 'o', 'c', 'l', 'd'])).toBe('do')
  expect(resultKey(['d', 'o', 'd', 'o'])).toBe('od')          // 2:2 → 마지막에 고른 관찰이 1위
  expect(resultKey(['l', 'l', 'l', 'l'])).toMatch(/^l[doc]$/)  // 한 성향만 골라도 결과가 나온다
})
