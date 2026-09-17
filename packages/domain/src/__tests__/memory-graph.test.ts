import { describe, expect, it } from 'vitest'
import { buildMemoryGraph, tagsOf } from '../memory/graph'
import type { Memory } from '../memory/types'

function mem(id: string, content: string, tags: string[], over: Partial<Memory> = {}): Memory {
  return {
    id, sessionId: 's1', characterId: 'c1', type: 'user_fact', content,
    importance: 0.8, persistence: 0.8, confidence: 0.9, tags,
    sourceMessageId: null, createdAt: new Date(), ...over,
  }
}

describe('memory graph', () => {
  it('never leaks memories across roleplay sessions', () => {
    const g = buildMemoryGraph([mem('a', '내 기억', ['고양이']), mem('b', '남의 기억', ['고양이'], { sessionId: 's2' })], 's1')
    expect(g.nodes.map((n) => n.id)).toEqual(['a'])
    expect(g.edges).toHaveLength(0)
  })

  it('links memories that share a tag and thickens the edge per shared tag', () => {
    const g = buildMemoryGraph([
      mem('a', '루나를 키운다', ['루나', '고양이']),
      mem('b', '루나가 아팠다', ['루나', '고양이']),
      mem('c', '커피를 좋아한다', ['커피']),
    ], 's1')
    expect(g.edges).toHaveLength(1)
    expect(g.edges[0]).toMatchObject({ source: 'a', target: 'b', weight: 2 })
    // 태그를 공유하지 않는 기억은 노드로만 남고 이어지지 않는다.
    expect(g.nodes.map((n) => n.id)).toContain('c')
  })

  it('falls back to content terms when a memory has no tags', () => {
    // 조사는 떨어져 나간다 — '고양이를' 과 '고양이가' 가 같은 태그로 이어지도록.
    expect(tagsOf({ content: '루나라는 고양이를 키운다', tags: [] })).toContain('고양이')
    const g = buildMemoryGraph([mem('a', '주말에 영화 보기로 했다', []), mem('b', '주말에 시간이 없다', [])], 's1')
    expect(g.edges).toHaveLength(1)
  })

  it('keeps the internal summary cache out of the picture', () => {
    const g = buildMemoryGraph([mem('a', '요약', ['x'], { type: 'short_term_summary' }), mem('b', '사실', ['x'])], 's1')
    expect(g.nodes.map((n) => n.id)).toEqual(['b'])
  })

  it('groups nodes by layer so the view can colour them', () => {
    const g = buildMemoryGraph([
      mem('a', '취향', ['x'], { type: 'preference' }),
      mem('b', '다툼', ['x'], { type: 'conflict' }),
      mem('c', '세계', ['x'], { type: 'world_fact' }),
    ], 's1')
    expect(g.nodes.map((n) => n.layer).sort()).toEqual(['long_term', 'relationship', 'world'])
    expect(g.tags[0]).toEqual({ tag: 'x', count: 3 })
  })
})
