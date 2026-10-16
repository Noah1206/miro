import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIContentBlockedError, type LLMProvider } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { UnsafeContentError } from '../safety'
import { analyzeMemory, memoryResult, planTasks } from '../task-router'
import { buildMockProposal } from '../mock-rp'
import { recordedConversationReview, snapshot } from './fixtures'
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
    const ok = await runTurn({ llm: live(async o => { tasks.push(o.task); return o.task === 'agency_verify'
      ? recordedConversationReview(o) : buildMockProposal(o.prompt, { characterName: '토마스' }) }), snapshot: snapshot(), userInput: '안녕하세요' })
    expect(ok.providerMode).toBe('live')
    expect(tasks).toEqual(['dialogue', 'dialogue', 'agency_verify'])
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
    const result = await analyzeMemory(live(async () => ({ memories: [{ type: 'user_fact', content: '바뀐 사실', importance: .8, persistence: .8, confidence: 1, replaces: id, sourceQuote: '정정할게요' }] })),
      'memory_extraction', '정정할게요', snapshot({ memories: [{ id, sessionId: 'someone-else', characterId: 'c2', type: 'user_fact', content: '다른 사용자', importance: .8, persistence: .8, confidence: 1, tags: [], sourceMessageId: null, createdAt: new Date() }] }))
    expect(result.memories[0]?.replaces).toBeUndefined()
  })

  it('keeps an explicit correction and its reason, and gives the summary room for causal history', async () => {
    const id = '11111111-1111-4111-8111-111111111111'
    const s = snapshot({ memories: [{ id, sessionId: 's1', characterId: 'c1', type: 'preference', content: '별명으로 부르는 것을 좋아한다', importance: .8, persistence: .9, confidence: 1, tags: ['호칭'], sourceMessageId: 'source', createdAt: new Date() }] })
    const correction = '이제는 별명 대신 지윤이라고 불러줘. 다른 사람이 들으면 불편해.'
    const result = await analyzeMemory(live(async o => {
      expect(o.system).toContain('최신 사실과 정정 이유')
      expect(JSON.parse(o.prompt).previousMemories[0].id).toBe(id)
      return { memories: [{ type: 'preference', content: '다른 사람이 듣는 곳에서는 별명이 불편하므로 지윤이라고 불러 달라고 정정했다.', importance: .85, persistence: .95, confidence: 1, replaces: id, sourceQuote: correction }] }
    }), 'memory_extraction', correction, s)
    expect(result.memories[0]!.replaces).toBe(id)
    expect(result.memories[0]!.content).toContain('불편')

    const cause = '갈등은 약속을 취소한 일 자체보다 설명 없이 기다리게 한 데서 생겼고 다음에는 미리 연락하기로 합의했다.'
    const summary = '함께 겪은 일을 기록한다. '.repeat(30) + cause
    expect(summary.length).toBeGreaterThan(300)
    const parsed = memoryResult('short_term_summary').parse({ memories: [{ type: 'short_term_summary', content: summary }] })
    expect(parsed.memories[0]!.content).toContain(cause)
    await analyzeMemory(live(async o => {
      expect(o.maxTokens).toBeGreaterThanOrEqual(1500)
      expect(o.system).toContain('갈등의 원인')
      expect(o.system).toContain('최대 900자')
      return { memories: parsed.memories }
    }), 'memory_summary', correction, s)
  })

  // 2026-10-16: 캐릭터가 자기 기억으로 확정한 공유 과거는 캐릭터 원문을 출처로 남긴다 — 다른 종류는 캐릭터 말로 남지 않는다.
  it('keeps a character-told shared past as a shared_event sourced to the character’s words, and nothing else from character words', async () => {
    const told = '그날 손님은 우산이 없었죠.'
    const s = snapshot({ recentMessages: [{ id: 'char-1', role: 'character', content: told }, { id: 'user-1', role: 'user', content: '맞아, 그래서 다 젖었지.' }] as never })
    const result = await analyzeMemory(live(async () => ({ memories: [
      { type: 'shared_event', content: '그날 비가 왔고 사용자는 우산이 없었다', importance: .7, persistence: .9, confidence: .9, sourceQuote: '우산이 없었죠', sourceMessageId: 'char-1' },
      { type: 'user_fact', content: '사용자는 우산을 안 쓴다', importance: .7, persistence: .9, confidence: .9, sourceQuote: '우산이 없었죠', sourceMessageId: 'char-1' },
    ] })), 'memory_extraction', '그날 얘기 더 해 줘', s)
    expect(result.memories.map(m => m.type)).toEqual(['shared_event'])
  })

  it('captures uncomfortable praise and plain preferences before they fall outside the recent conversation window', () => {
    vi.stubEnv('MIRO_FEATURE_MEMORY_EXTRACTION', '1')
    expect(planTasks('완벽하다는 말은 부담스러워', 1)).toContain('memory_extraction')
    expect(planTasks('Stop calling me sweetheart in public.', 2)).toContain('memory_extraction')
    expect(planTasks('나를 지윤이라고 불러줘', 1)).toContain('memory_extraction')
    expect(planTasks('난 비 오는 날에는 창가에 앉아', 4)).toContain('memory_extraction')
    vi.stubEnv('MIRO_FEATURE_MEMORY_EXTRACTION', '0')
    expect(planTasks('싫어', 4, 'always')).not.toContain('memory_extraction')
  })

  it('replaces an explicitly cancelled promise without letting a recalled cancellation delete current memory', async () => {
    const id = '11111111-1111-4111-8111-111111111111', past = '22222222-2222-4222-8222-222222222222'
    const quote = '토요일 약속 취소할게.'
    const old = { id, sessionId: 's1', characterId: 'c1', type: 'promise' as const, content: '토요일에 만나기로 약속했다.',
      importance: .9, persistence: .9, confidence: 1, tags: ['약속'], sourceMessageId: 'source', createdAt: new Date() }
    const candidate = { type: 'promise', content: '토요일 약속은 사용자가 취소했다.', importance: .9, persistence: .9, confidence: 1, replaces: id, sourceQuote: quote }
    const extract = (value: object, input: string, s = snapshot({ memories: [old] })) => analyzeMemory(live(async () => ({ memories: [value] })), 'memory_extraction', input, s)
    expect((await extract(candidate, quote)).memories[0]?.replaces).toBe(id)
    expect((await extract({ ...candidate, sourceMessageId: past }, '책 이야기를 하자.', snapshot({ memories: [old], recentMessages: [{ id: past, role: 'user', content: quote }] }))).memories[0]?.replaces).toBeUndefined()
    expect((await extract({ ...candidate, sourceQuote: '없는 취소 문구' }, quote)).memories).toEqual([])
    expect((await extract({ ...candidate, type: 'user_fact' }, quote)).memories[0]?.replaces).toBeUndefined()
    expect((await extract({ ...candidate, replaces: '33333333-3333-4333-8333-333333333333' }, quote)).memories[0]?.replaces).toBeUndefined()
  })

  it('attributes historical extractions only to an actual visible user quote, never silently to the current input', async () => {
    const past = '11111111-1111-4111-8111-111111111111', actor = '22222222-2222-4222-8222-222222222222'
    const foreign = '33333333-3333-4333-8333-333333333333'
    const quote = '칭찬보다 구체적인 피드백이 좋아'
    const base = { type: 'preference', importance: .8, persistence: .9, confidence: 1 }
    const result = await analyzeMemory(live(async () => ({ memories: [
      { ...base, content: '실용적인 피드백을 원한다', sourceMessageId: past, sourceQuote: quote },
      { ...base, content: '출처를 누락한 과거 선호', sourceQuote: quote },
      { ...base, content: '없는 원문', sourceMessageId: foreign, sourceQuote: quote },
      { ...base, content: '캐릭터 말을 사용자 취향으로 바꿈', sourceMessageId: actor, sourceQuote: quote },
      { ...base, content: '잘못 인용한 원문', sourceMessageId: past, sourceQuote: '없는 문구' },
    ] })), 'memory_extraction', '오늘은 산책을 하자', snapshot({ recentMessages: [
      { id: past, role: 'user', content: quote }, { id: actor, role: 'character', content: quote },
    ] }))
    expect(result.memories).toHaveLength(1)
    expect(result.memories[0]).toMatchObject({ sourceMessageId: past, sourceQuote: quote })
  })
})
