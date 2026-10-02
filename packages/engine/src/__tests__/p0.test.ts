import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIContentBlockedError, type LLMProvider } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { UnsafeContentError } from '../safety'
import { analyzeMemory } from '../task-router'
import { buildMockProposal } from '../mock-rp'
import { snapshot } from './fixtures'
import { buildContext } from '../context'

afterEach(() => vi.unstubAllEnvs())
const live = (fn: (opts: any) => any): LLMProvider => ({ info: { mode: 'live', name: 'test', notice: null }, generateStructured: fn })
describe('P0 safety and memory', () => {
  // 10/2: 검열 분류기를 뺐다 — 턴의 첫 호출이 바로 대사이고, 공급자 필터가 막은 대사만 안전 거부가 된다.
  it('calls no classifier: a provider-blocked reply is the only safety refusal', async () => {
    const tasks: string[] = []
    await expect(runTurn({ llm: live(async o => { tasks.push(o.task); throw new AIContentBlockedError() }), snapshot: snapshot(), userInput: 'unsafe' }))
      .rejects.toBeInstanceOf(UnsafeContentError)
    expect(tasks).toEqual(['dialogue'])
    const ok = await runTurn({ llm: live(async o => { tasks.push(o.task); return buildMockProposal(o.prompt, { characterName: '토마스' }) }), snapshot: snapshot(), userInput: '안녕하세요' })
    expect(ok.providerMode).toBe('live')
    expect(tasks).toEqual(['dialogue', 'dialogue'])
  })
  it('includes the prior summary and 24 messages in incremental summarization', async () => {
    const s = snapshot({ memories: [{ id: '11111111-1111-4111-8111-111111111111', sessionId: 's1', characterId: 'c1', type: 'short_term_summary', content: '루나라는 고양이', importance: .1, persistence: .1, confidence: 1, tags: [], sourceMessageId: null, createdAt: new Date() }],
      recentMessages: Array.from({ length: 24 }, (_, i) => ({ role: 'user', content: `message ${i}` })) })
    const ai = live(async o => {
      const payload = JSON.parse(o.prompt)
      expect(payload.previousMemories[0].content).toContain('루나')
      expect(payload.recent).toHaveLength(24)
      return { memories: [{ type: 'short_term_summary', content: '루나라는 고양이와 살고 토요일에 만난다', importance: .9, persistence: .9, confidence: 1 }] }
    })
    await analyzeMemory(ai, 'memory_summary', '토요일에 만나요', s)
    expect(buildContext(s).prompt).toContain('루나')
  })
  it('ignores correction targets belonging to another session', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const result = await analyzeMemory(live(async () => ({ memories: [{ type: 'user_fact', content: '바뀐 사실', importance: .8, persistence: .8, confidence: 1, replaces: id }] })),
      'memory_extraction', '정정할게요', snapshot({ memories: [{ id, sessionId: 'someone-else', characterId: 'c2', type: 'user_fact', content: '다른 사용자', importance: .8, persistence: .8, confidence: 1, tags: [], sourceMessageId: null, createdAt: new Date() }] }))
    expect(result.memories[0]?.replaces).toBeUndefined()
  })
})
