import { afterEach, describe, expect, it, vi } from 'vitest'
import type { LLMProvider } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { UnsafeContentError } from '../safety'
import { analyzeMemory } from '../task-router'
import { buildMockProposal } from '../mock-rp'
import { snapshot } from './fixtures'
import { buildContext } from '../context'

afterEach(() => vi.unstubAllEnvs())
const live = (fn: (opts: any) => any): LLMProvider => ({ info: { mode: 'live', name: 'test', notice: null }, generateStructured: fn })
describe('P0 safety and memory', () => {
  it('blocks unsafe input before dialogue or auxiliary calls', async () => {
    const generate = vi.fn(async (_opts: any) => ({ allowed: false, category: 'sexual' }))
    await expect(runTurn({ llm: live(generate), snapshot: snapshot(), userInput: 'unsafe' })).rejects.toBeInstanceOf(UnsafeContentError)
    expect(generate).toHaveBeenCalledTimes(1)
    expect(generate.mock.calls[0]?.[0].task).toBe('moderation')
  })
  it('blocks an unsafe model output after input passes', async () => {
    let safety = 0
    const ai = live(async o => o.task === 'moderation' ? { allowed: ++safety === 1, category: safety === 1 ? 'safe' : 'sexual' } : buildMockProposal(o.prompt, { characterName: '토마스' }))
    await expect(runTurn({ llm: ai, snapshot: snapshot(), userInput: '안녕하세요' })).rejects.toBeInstanceOf(UnsafeContentError)
    expect(safety).toBe(2)
  })
  it('does not permit a failed classifier to become a fallback reply', async () => {
    await expect(runTurn({ llm: live(async () => { throw new Error('timeout') }), snapshot: snapshot(), userInput: '안녕' })).rejects.toThrow('timeout')
  })
  it('includes the prior summary and 24 messages in incremental summarization', async () => {
    const s = snapshot({ memories: [{ id: '11111111-1111-4111-8111-111111111111', sessionId: 's1', characterId: 'c1', type: 'short_term_summary', content: '루나라는 고양이', importance: .1, persistence: .1, confidence: 1, sourceMessageId: null, createdAt: new Date() }],
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
      'memory_extraction', '정정할게요', snapshot({ memories: [{ id, sessionId: 'someone-else', characterId: 'c2', type: 'user_fact', content: '다른 사용자', importance: .8, persistence: .8, confidence: 1, sourceMessageId: null, createdAt: new Date() }] }))
    expect(result.memories[0]?.replaces).toBeUndefined()
  })
})
