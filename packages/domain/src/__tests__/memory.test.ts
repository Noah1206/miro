import { describe, expect, it } from 'vitest'
import { filterSalient, selectRelevantMemories } from '../memory/salience.js'
import type { Memory, MemoryCandidate } from '../memory/types.js'

function mem(sessionId: string, id: string, importance = 0.9): Memory {
  return {
    id, sessionId, characterId: 'c1', type: 'user_fact', content: id,
    importance, persistence: 0.9, confidence: 0.9,
    sourceMessageId: null, createdAt: new Date(),
  }
}

describe('memory', () => {
  it('never leaks memories across roleplay sessions', () => {
    const all = [mem('s1', 'mine'), mem('s2', 'other'), mem('s3', 'another')]
    const got = selectRelevantMemories(all, 's1', 10)
    expect(got.map((m) => m.id)).toEqual(['mine'])
  })

  it('drops low-importance candidates (memory is not a conversation log)', () => {
    const cands: MemoryCandidate[] = [
      { type: 'user_fact', content: 'trivial', importance: 0.1, persistence: 0.5, confidence: 0.9 },
      { type: 'promise', content: 'important', importance: 0.9, persistence: 0.9, confidence: 0.9 },
    ]
    expect(filterSalient(cands).map((c) => c.content)).toEqual(['important'])
  })

  it('caps candidates per turn', () => {
    const many = Array.from({ length: 10 }, (_, i): MemoryCandidate => ({
      type: 'user_fact', content: `m${i}`, importance: 0.9, persistence: 0.9, confidence: 0.9,
    }))
    expect(filterSalient(many).length).toBeLessThanOrEqual(3)
  })
})
