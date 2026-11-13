import { expect, test } from 'vitest'
import { QUESTION_SETS, RESULTS, TYPES, resultKey } from '../quiz'

test('질문 한 벌마다 여덟 유형이 선택지에 네 번씩 나온다', () => {
  for (const set of QUESTION_SETS) {
    expect(set).toHaveLength(8)
    const seen = set.flatMap(q => q.a.map(([t]) => t))
    for (const t of TYPES) expect(seen.filter(x => x === t)).toHaveLength(4)
    expect(set.every(q => new Set(q.a.map(([t]) => t)).size === 4)).toBe(true)
  }
  expect(Object.keys(RESULTS).sort()).toEqual([...TYPES].sort())
  expect(Object.values(RESULTS).every(r => r.tags.length && r.likes.length && r.recs.length)).toBeTruthy()
})

test('가장 많이 고른 유형, 동점이면 나중에 고른 유형', () => {
  expect(resultKey(['j', 'j', 'n', 'z', 'j', 'c', 'd', 'g'])).toBe('j')
  expect(resultKey(['j', 'n', 'j', 'n'])).toBe('n')
})
