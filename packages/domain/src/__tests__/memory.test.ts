import { describe, expect, it } from 'vitest'
import { filterSalient, selectRelevantMemories } from '../memory/salience'
import type { Memory, MemoryCandidate } from '../memory/types'
import { retrieveMemories } from '../memory/layers'

function mem(sessionId: string, id: string, importance = 0.9): Memory {
  return {
    id, sessionId, characterId: 'c1', type: 'user_fact', content: id,
    importance, persistence: 0.9, confidence: 0.9,
    tags: [], sourceMessageId: null, createdAt: new Date(),
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

  it('does not discard the rolling summary when three high-scoring facts arrive in the same turn', () => {
    const facts: MemoryCandidate[] = Array.from({ length: 3 }, (_, i) => ({ type: 'user_fact', content: `fact ${i}`, importance: .95, persistence: .95, confidence: 1 }))
    const summary: MemoryCandidate = { type: 'short_term_summary', content: '서운했던 이유와 이후 서로 합의한 대응', importance: .8, persistence: .8, confidence: 1 }
    const got = filterSalient([...facts, summary])
    expect(got.filter(m => m.type === 'user_fact')).toHaveLength(3)
    expect(got.find(m => m.type === 'short_term_summary')).toEqual(summary)
  })

  it('retains a sourced preference and the cause of a conflict beyond a hundred unrelated memories', () => {
    const noise = Array.from({ length: 110 }, (_, i) => ({ ...mem('s1', `fact ${i}`, .99), persistence: .99 }))
    const preference: Memory = { ...mem('s1', 'preference', .65), type: 'preference', sourceMessageId: 'original-user-message',
      content: '과한 칭찬은 평가받는 느낌이라 부담스럽다. 고칠 점을 구체적으로 말해 주기를 원한다.', createdAt: new Date('2026-01-01') }
    const conflict: Memory = { ...mem('s1', 'conflict', .65), type: 'conflict', content: '약속을 취소한 사실보다 설명 없이 기다리게 한 점이 서운했고 미리 알려주기로 했다.' }
    const other: Memory = { ...preference, id: 'other-session', sessionId: 's2', importance: 1 }
    const got = retrieveMemories([...noise, preference, conflict, other], 's1', 8, '오늘은 밖에서 걸을까?')
    expect(got).toContain(preference)
    expect(got).toContain(conflict)
    expect(got).not.toContain(other)
    expect(got).toHaveLength(8)
  })

  it('retrieves an old event through its topic tag and Korean particles without repeating its original wording', () => {
    const target: Memory = { ...mem('s1', 'feedback', .7), type: 'shared_event',
      content: '글을 읽고 과장된 응원 대신 첫 문장을 함께 고쳤고 그 방식이 편하다고 했다.', tags: ['피드백', '첫 문장'] }
    const noise = Array.from({ length: 30 }, (_, i) => mem('s1', `unrelated ${i}`, .9))
    expect(retrieveMemories([...noise, target], 's1', 2, '그때 피드백으로 도와준 거 기억해?')).toContain(target)
    expect(retrieveMemories([...noise, target], 's1', 0, '피드백')).toEqual([])
  })

  it('prefers a recent correction among enduring preferences instead of letting obsolete high scores dominate', () => {
    const preferences = Array.from({ length: 8 }, (_, i): Memory => ({ ...mem('s1', `preference-${i}`, .9), type: 'preference',
      createdAt: new Date(`2026-01-${String(i + 1).padStart(2, '0')}`) }))
    const corrected: Memory = { ...mem('s1', 'correction', .65), type: 'preference', content: '이제 별명 대신 지윤이라고 불러 달라. 사람들이 듣는 곳에서는 별명이 불편하다.',
      createdAt: new Date('2026-02-01'), sourceMessageId: 'correction-source' }
    expect(retrieveMemories([...preferences, corrected], 's1', 4, '저녁 먹었어?')).toContain(corrected)
  })

  it('does not let later food preferences crowd an old communication preference out of the candidate pool', () => {
    const address: Memory = { ...mem('s1', 'address', .65), type: 'preference', content: '공개된 곳에서는 별명보다 지윤이라는 이름을 원한다.',
      tags: ['대화 선호'], sourceMessageId: 'address-source', createdAt: new Date('2026-01-01') }
    const foods = Array.from({ length: 20 }, (_, i): Memory => ({ ...mem('s1', `음식 취향 ${i}`, .99), type: 'preference', createdAt: new Date('2026-02-01') }))
    expect(retrieveMemories([address, ...foods], 's1', 24, '다음 이야기를 해 볼까')).toContain(address)
    expect(retrieveMemories([address, ...foods], 's1', 8, '다음 이야기를 해 볼까')).toContain(address)
  })
})
