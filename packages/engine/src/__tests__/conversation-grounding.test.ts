import { describe, expect, it } from 'vitest'
import type { LLMProvider } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { snapshot } from './fixtures'
import { needsUserGroundingReview, snapshotUserGrounding } from '../conversation-grounding'
import { verifyCommunicationPreferences } from '../agency/realization'
import { responseJsonSchema } from '../agency/provider'

const inventedHistory = '사연에서 밤마다 책을 읽다 잠든다고 하셨을 때 꽂아두시던 그 책갈피군요.'
const inventedAction = '당신이 가방이나 주머니 쪽에서 꺼내 보이거나 쥐고 있을 노란 손수건. 오래된 건데도 깨끗하게 잘 썼네.'
const input = '내가 늘 챙기는 건 파란색 책갈피이야. 할머니가 주신 거라 낡아도 계속 쓰고 있어.'
const groundedReply = '할머니가 주신 거라면 낡아도 계속 쓰고 싶겠어요. 저는 책갈피 대신 방송 원고를 접어 두곤 해요.'

describe('user history and agency grounding before delivery', () => {
  it.each([inventedHistory, inventedAction, '지우가 책을 내려놓는다.', '윤서 씨는 어제 공원에 갔잖아요.'])('routes the observed unsupported claim for review: %s', text => {
    expect(needsUserGroundingReview([{ type: 'dialogue', text }])).toBe(true)
  })

  it('rewrites invented prior user words before any stream callback, without an existing preference', async () => {
    let renders = 0, checks = 0
    const llm: LLMProvider = { info: { mode: 'mock', name: 'grounding-contract', notice: 'Not live quality evaluation' }, async generateStructured(request) {
      if (request.task === 'agency_verify') {
        checks++
        const data = JSON.parse(request.prompt)
        expect(data.groundingEvidence).toContainEqual(expect.objectContaining({ id: 'current-user-input', kind: 'user_statement', text: input }))
        expect(data.groundingEvidence.some((e: { text: string }) => e.text.includes('밤마다 책을 읽다 잠든다'))).toBe(false)
        return request.schema.parse({ acceptable: renders > 1, blockIndex: 0, reason: renders > 1 ? 'none' : 'unsupported_user_history' })
      }
      renders++
      const proposal = { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: renders === 1 ? inventedHistory : groundedReply }] } }
      request.onText?.(JSON.stringify(proposal))
      return request.schema.parse(proposal)
    } }
    const visible: string[][] = []
    const result = await runTurn({ llm, snapshot: snapshot({ experienceType: 'chat', memories: [], recentMessages: [] }), userInput: input,
      stream: { onBlocks: blocks => visible.push(blocks.map(b => b.text)), onReset: () => { throw new Error('Rejected draft streamed') } } })
    expect(renders).toBe(2)
    expect(checks).toBe(2)
    expect(visible).toEqual([[groundedReply]])
    expect(result.transition.blocks[0]!.text).toBe(groundedReply)
  })

  it.each(['지우가 책을 내려놓는다.', '윤서 씨는 어제 공원에 갔잖아요.'])('checks named user claims before delivery: %s', badDraft => {
    return (async () => {
      let renders = 0, checks = 0
      const goodDraft = '저는 책을 덮고 창가에 앉았어요. 같이 읽을까요?'
      const llm: LLMProvider = { info: { mode: 'mock', name: 'named-user-contract', notice: '' }, async generateStructured(request) {
        if (request.task === 'agency_verify') {
          checks++
          return request.schema.parse({ acceptable: renders > 1, blockIndex: 0, reason: renders > 1 ? 'none' : 'controls_user' })
        }
        renders++
        return request.schema.parse({ rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: renders === 1 ? badDraft : goodDraft }] } })
      } }
      const visible: string[][] = []
      const result = await runTurn({ llm, snapshot: snapshot({ experienceType: 'chat', memories: [], recentMessages: [] }), userInput: '책 이야기 해줄래?',
        stream: { onBlocks: blocks => visible.push(blocks.map(b => b.text)), onReset() {} } })
      expect(checks).toBe(2)
      expect(visible).toEqual([[goodDraft]])
      expect(result.transition.blocks[0]!.text).toBe(goodDraft)
    })()
  })

  it('never emits or returns fallback success when all drafts invent a user action', async () => {
    const llm: LLMProvider = { info: { mode: 'mock', name: 'grounding-contract', notice: '' }, async generateStructured(request) {
      if (request.task === 'agency_verify') return request.schema.parse({ acceptable: false, blockIndex: 0, reason: 'controls_user' })
      return request.schema.parse({ rp: { blocks: [{ type: 'narrative', speaker: null, text: inventedAction }] } })
    } }
    const visible: unknown[] = []
    await expect(runTurn({ llm, snapshot: snapshot({ experienceType: 'chat' }), userInput: '노란 손수건을 늘 가지고 다녀.',
      stream: { onBlocks: blocks => visible.push(blocks), onReset() {} } })).rejects.toThrow('conversation_grounding_rejected')
    expect(visible).toEqual([])
  })

  it('keeps actual old user words as evidence and never launders a prior AI assertion into them', async () => {
    const s = snapshot({ memories: [{ id: 'memory', sessionId: 's1', characterId: 'c1', type: 'user_fact', content: '사용자가 독서를 즐김',
      sourceMessageId: 'old-user', sourceText: '밤마다 책을 읽다가 잠들어. 그때 파란 책갈피를 꽂아 둬.', sourceOccurredAt: new Date('2026-09-01'),
      confidence: 1, importance: .8, persistence: .9, createdAt: new Date('2026-09-20'), tags: [] }],
      recentMessages: [{ role: 'character', content: inventedHistory }], turnCount: 120 })
    const evidence = snapshotUserGrounding(s, input)
    const llm: LLMProvider = { info: { mode: 'mock', name: 'grounded-positive-fixture', notice: '' }, async generateStructured(request) {
      const data = JSON.parse(request.prompt)
      expect(data.groundingEvidence).toContainEqual(expect.objectContaining({ id: 'old-user', kind: 'user_statement', text: s.memories[0]!.sourceText }))
      expect(data.groundingEvidence.find((e: { text: string }) => e.text === inventedHistory).kind).toBe('character_words')
      expect(request.system).toContain('cannot prove that the user acted')
      return request.schema.parse({ acceptable: true, blockIndex: 0, reason: 'none' })
    } }
    expect((await verifyCommunicationPreferences(llm, { evidence: [], recentUserMessages: [{ text: input }], groundingEvidence: evidence,
      blocks: [{ type: 'dialogue', speaker: '토마스', text: inventedHistory }] })).acceptable).toBe(true)
  })

  it('reviews the whole block beyond character 800 and keeps the serialized request within 24KB', async () => {
    const text = '따뜻한 빛이 내려앉았다. '.repeat(70) + inventedHistory
    const evidence = Array.from({ length: 30 }, (_, i) => ({ id: `old-${i}`, kind: 'user_statement' as const, text: '파란 책갈피 이야기. '.repeat(90) }))
    evidence.push({ id: 'current-user-input', kind: 'user_statement', text: input })
    const llm: LLMProvider = { info: { mode: 'mock', name: 'bounded-fixture', notice: '' }, async generateStructured(request) {
      expect(JSON.parse(request.prompt).blocks[0].text).toBe(text)
      const bytes = new TextEncoder().encode(request.system + request.prompt + JSON.stringify(responseJsonSchema(request.schema))).length + 512
      expect(bytes).toBeLessThanOrEqual(24_000)
      expect(JSON.parse(request.prompt).groundingEvidence).toContainEqual(expect.objectContaining({ id: 'current-user-input', text: input }))
      return request.schema.parse({ acceptable: false, blockIndex: 0, reason: 'unsupported_user_history' })
    } }
    expect((await verifyCommunicationPreferences(llm, { evidence: [], recentUserMessages: [], groundingEvidence: evidence,
      blocks: [{ type: 'narrative', speaker: null, text }] })).acceptable).toBe(false)
  })

  it('retains relevant old user facts before recent unrelated chatter when the byte budget is tight', async () => {
    const old = { id: 'old-bookmark', kind: 'user_statement' as const, text: '할머니가 주신 파란 책갈피를 늘 쓰고, 밤에는 보리차를 마셔.', occurredAt: '2026-09-01' }
    const unrelated = Array.from({ length: 12 }, (_, i) => ({ id: `recent-${i}`, kind: 'user_statement' as const, text: '회의 일정과 직장 업무를 의논한다. '.repeat(50) }))
    const draft = '창 너머로 햇살이 비치고 멀리서 조용한 음악이 흘렀다. '.repeat(45) + '할머니가 주신 파란 책갈피와 밤에 마시는 보리차 이야기는 기억해요.'
    const llm: LLMProvider = { info: { mode: 'mock', name: 'priority-fixture', notice: '' }, async generateStructured(request) {
      const data = JSON.parse(request.prompt)
      expect(data.groundingEvidence).toContainEqual(old)
      expect(data.groundingEvidence[0]).toMatchObject({ id: 'current-user-input', text: '무엇을 기억해?' })
      expect(data.userMessages).toEqual([])
      expect(new TextEncoder().encode(request.system + request.prompt + JSON.stringify(responseJsonSchema(request.schema))).length + 512).toBeLessThanOrEqual(24_000)
      return request.schema.parse({ acceptable: true, blockIndex: 0, reason: 'none' })
    } }
    expect((await verifyCommunicationPreferences(llm, { evidence: [], recentUserMessages: unrelated.map(item => ({ text: item.text })),
      groundingEvidence: [old, ...unrelated, { id: 'current-user-input', kind: 'user_statement', text: '무엇을 기억해?' }],
      blocks: [{ type: 'dialogue', speaker: '토마스', text: draft }] })).acceptable).toBe(true)
  })

  it('fits a supported 2000-character Korean input and 2200-character reply without losing relevant old evidence', async () => {
    const current = '오늘은 조용히 책을 읽었어. '.repeat(150).slice(0, 2000)
    const old = { id: 'old-bookmark', kind: 'user_statement' as const, text: '할머니가 주신 파란 책갈피를 늘 쓰고, 밤에는 보리차를 마셔.' }
    const draft = ('파란 책갈피를 쓰며 보리차를 마신다고 했죠. ' + '창 밖을 보며 천천히 책을 읽었어요. '.repeat(150)).slice(0, 2200)
    const evidence = [old, ...Array.from({ length: 20 }, (_, i) => ({ id: `noise-${i}`, kind: 'user_statement' as const, text: '회사 일정과 점심 회의를 의논한다. '.repeat(60) })),
      { id: 'current-user-input', kind: 'user_statement' as const, text: current }]
    const llm: LLMProvider = { info: { mode: 'mock', name: 'supported-long-envelope', notice: '' }, async generateStructured(request) {
      const data = JSON.parse(request.prompt)
      expect(data.groundingEvidence).toContainEqual(old)
      expect(data.groundingEvidence[0]).toMatchObject({ id: 'current-user-input', text: current })
      expect(data.blocks.map((b: { text: string }) => b.text).join('')).toBe(draft)
      const bytes = new TextEncoder().encode(request.system + request.prompt + JSON.stringify(responseJsonSchema(request.schema))).length + 512
      expect(bytes).toBeGreaterThan(12_000)
      expect(bytes).toBeLessThanOrEqual(24_000)
      return request.schema.parse({ acceptable: true, blockIndex: 0, reason: 'none' })
    } }
    expect((await verifyCommunicationPreferences(llm, { evidence: [], recentUserMessages: [], groundingEvidence: evidence,
      blocks: [{ type: 'dialogue', speaker: '토마스', text: draft.slice(0, 1200) }, { type: 'dialogue', speaker: '토마스', text: draft.slice(1200) }] })).acceptable).toBe(true)
  })

  it('fails explicitly instead of generating fallback success when essential text cannot fit the review envelope', async () => {
    let reviews = 0
    const llm: LLMProvider = { info: { mode: 'mock', name: 'oversized-essential-contract', notice: '' }, async generateStructured(request) {
      if (request.task === 'agency_verify') { reviews++; return request.schema.parse({ acceptable: true, blockIndex: 0, reason: 'none' }) }
      return request.schema.parse({ rp: { blocks: Array.from({ length: 6 }, () => ({ type: 'dialogue', speaker: '토마스', text: '가'.repeat(1800) })) } })
    } }
    const visible: unknown[] = []
    await expect(runTurn({ llm, snapshot: snapshot({ experienceType: 'chat' }), userInput: '얘기해줘.',
      stream: { onBlocks: blocks => visible.push(blocks), onReset() {} } })).rejects.toThrow('conversation_review_context_budget_exceeded')
    expect(reviews).toBe(0)
    expect(visible).toEqual([])
  })

  it.each([false, true])('does not treat private persona history as already disclosed (actual disclosure: %s)', async disclosed => {
    const history = '나는 의대 출신이야.'
    const s = snapshot({ userPersona: { name: '윤서', gender: null, description: '의대 출신이며 검은 안경을 쓴다.' },
      recentMessages: disclosed ? [{ id: 'disclosure', role: 'user', content: history }] : [], memories: [] })
    const evidence = snapshotUserGrounding(s, '안녕.')
    const llm: LLMProvider = { info: { mode: 'mock', name: 'persona-source-scope-contract', notice: 'Contract fixture, not live semantic verification' }, async generateStructured(request) {
      const data = JSON.parse(request.prompt)
      expect(data.groundingEvidence).toContainEqual(expect.objectContaining({ kind: 'persona_background', text: s.userPersona!.description }))
      expect(data.groundingEvidence.filter((e: { kind: string; text: string }) => e.kind === 'authored_context').some((e: { text: string }) => e.text.includes('의대'))).toBe(false)
      const actualSource = data.groundingEvidence.some((e: { kind: string; text: string }) => e.kind === 'user_statement' && e.text === history)
      expect(actualSource).toBe(disclosed)
      expect(request.system).toContain('never knowledge of a job, education, past')
      return request.schema.parse({ acceptable: actualSource, blockIndex: 0, reason: actualSource ? 'none' : 'unsupported_user_history' })
    } }
    expect((await verifyCommunicationPreferences(llm, { evidence: [], recentUserMessages: [], groundingEvidence: evidence,
      blocks: [{ type: 'dialogue', speaker: '토마스', text: '윤서 씨는 의대 출신이시잖아요.' }] })).acceptable).toBe(disclosed)
  })
})
