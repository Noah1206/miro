import { describe, expect, it } from 'vitest'
import { dedupeCandidates, pruneMemories } from '../memory/consolidate'
import type { Memory, MemoryCandidate } from '../memory/types'

function mem(content: string, importance = 0.9, persistence = 0.9): Memory {
  return {
    id: content, sessionId: 's1', characterId: 'c1', type: 'user_fact',
    content, importance, persistence, confidence: 0.9,
    sourceMessageId: null, createdAt: new Date(),
  }
}
function cand(content: string): MemoryCandidate {
  return { type: 'user_fact', content, importance: 0.9, persistence: 0.9, confidence: 0.9 }
}

describe('memory dedupe', () => {
  it('drops a candidate identical to an existing memory', () => {
    const out = dedupeCandidates([cand('사용자는 커피를 안 마신다')], [mem('사용자는 커피를 안 마신다')])
    expect(out).toHaveLength(0)
  })

  it('ignores punctuation and spacing differences', () => {
    const out = dedupeCandidates(
      [cand('사용자는  커피를 안 마신다.')],
      [mem('사용자는 커피를 안 마신다')],
    )
    expect(out).toHaveLength(0)
  })

  it('keeps a genuinely new memory', () => {
    const out = dedupeCandidates([cand('사용자는 고양이를 키운다')], [mem('사용자는 커피를 안 마신다')])
    expect(out).toHaveLength(1)
  })

  it('dedupes within the same batch too', () => {
    const out = dedupeCandidates([cand('약속을 지켰다'), cand('약속을 지켰다')], [])
    expect(out).toHaveLength(1)
  })

  it('does not treat a short fragment as a duplicate', () => {
    const out = dedupeCandidates([cand('싫다')], [mem('사용자는 비 오는 날을 싫다고 했다')])
    expect(out).toHaveLength(1)
  })
})

describe('memory pruning', () => {
  it('keeps everything under the limit', () => {
    const { keep, drop } = pruneMemories([mem('a'), mem('b')], 10)
    expect(keep).toHaveLength(2)
    expect(drop).toHaveLength(0)
  })

  it('drops the least important when over the limit', () => {
    const { keep, drop } = pruneMemories(
      [mem('중요', 0.95), mem('보통', 0.5), mem('사소', 0.1)], 2,
    )
    expect(keep.map((m) => m.content)).toEqual(['중요', '보통'])
    expect(drop.map((m) => m.content)).toEqual(['사소'])
  })

  it('keeps an old but important memory over a recent trivial one', () => {
    const promise = mem('주말에 만나기로 약속했다', 0.95, 0.95)
    const trivia = mem('오늘 날씨 얘기를 했다', 0.2, 0.2)
    const { keep } = pruneMemories([trivia, promise], 1)
    expect(keep[0]!.content).toBe('주말에 만나기로 약속했다')
  })
})
