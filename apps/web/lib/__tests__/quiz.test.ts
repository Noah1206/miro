import { expect, test } from 'vitest'
import { QUESTIONS, RESULTS, TYPES, resultKey } from '../quiz'

test('열두 유형이 선택지에 네 번씩 나온다', () => {
  expect(QUESTIONS).toHaveLength(12)
  const seen = QUESTIONS.flatMap(q => q.a.map(([t]) => t))
  for (const t of TYPES) expect(seen.filter(x => x === t)).toHaveLength(4)
  expect(QUESTIONS.every(q => new Set(q.a.map(([t]) => t)).size === 4)).toBe(true)
  expect(Object.keys(RESULTS).sort()).toEqual([...TYPES].sort())
  expect(Object.values(RESULTS).every(r => r.tags.length && r.likes.length && r.recs.length)).toBeTruthy()
})

test('가장 많이 고른 유형, 동점이면 나중에 고른 유형', () => {
  expect(resultKey(['j', 'j', 'n', 'z', 'j', 'c', 'd', 'g'])).toBe('j')
  expect(resultKey(['j', 'n', 'j', 'n'])).toBe('n')
})
