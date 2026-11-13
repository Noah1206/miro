import { expect, test } from 'vitest'
import { QUESTIONS, RESULTS, TYPES, decodeScores, encodeScores, resultKey } from '../quiz'

test('모든 유형이 선택지에 같은 횟수(48칸 ÷ 유형 수)만큼 나온다', () => {
  expect(QUESTIONS).toHaveLength(12)
  const seen = QUESTIONS.flatMap(q => q.a.map(([t]) => t))
  for (const t of TYPES) expect(seen.filter(x => x === t)).toHaveLength(QUESTIONS.length * 4 / TYPES.length)
  expect(QUESTIONS.every(q => new Set(q.a.map(([t]) => t)).size === 4)).toBe(true)
  expect(Object.keys(RESULTS).sort()).toEqual([...TYPES].sort())
  expect(Object.values(RESULTS).every(r => r.tags.length && r.likes.length && r.recs.length)).toBeTruthy()
  // 취향 지수 표: 첫 줄 = 최애, 마지막 줄 = 지뢰, 점수는 내림차순
  for (const r of Object.values(RESULTS)) {
    expect(r.compat[0]![0]).toBe(r.chemi.type)
    expect(r.compat.at(-1)![0]).toBe(r.bad)
    expect(r.compat.map(c => c[1])).toEqual([...r.compat.map(c => c[1])].sort((a, b) => b - a))
  }
})

test('가장 많이 고른 유형, 동점이면 나중에 고른 유형', () => {
  expect(resultKey(['j', 'j', 'n', 'z', 'j', 'c', 'd', 'g'])).toBe('j')
  expect(resultKey(['j', 'n', 'j', 'n'])).toBe('n')
})

test('점수 글자열: 고른 횟수를 싣고, 틀린 글자열은 버린다', () => {
  const picks = ['j', 'j', 'j', 'n', 'n', 'z', 'h', 'c', 'd', 'g', 'm', 'k'] as const
  const s = encodeScores([...picks])
  expect(decodeScores(s)![0]).toEqual(['j', 3])
  expect(decodeScores(s)!.reduce((n, c) => n + c[1], 0)).toBe(12)
  expect(decodeScores('zzzzzzzzzzzzzzzz')).toBeNull()   // 합이 12가 아님
  expect(decodeScores('123')).toBeNull()
  expect(decodeScores(undefined)).toBeNull()
})
