import { describe, expect, it } from 'vitest'
import { AIOrchestrator, MockAIProvider, type GenerationRequest } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { buildMockProposal } from '../mock-rp'
import { snapshot, relationship } from './fixtures'

const llm = (over: Record<string, unknown> = {}) => new AIOrchestrator({ chain: [
  new MockAIProvider((req: GenerationRequest) => ({ ...buildMockProposal(req.prompt, { characterName: '토마스' }), ...over })),
] })

describe('runTurn — state update pipeline', () => {
  it('rules move the relationship; the model only adds nuance', async () => {
    const r = await runTurn({
      llm: llm({ relationshipDelta: { jealousy: 40, trust: 30 } }),
      snapshot: snapshot({ relationship: relationship({ jealousy: 30 }) }),
      userInput: '오늘 다른 남자랑 술 마셨어',
    })
    expect(r.semanticEvents.map((e) => e.type)).toContain('mentioned_other_romantic_interest')
    // 규칙 delta(질투 +) 에 모델 뉘앙스 ±3 만 얹힌다 — 40 이 그대로 들어가지 않는다.
    expect(r.transition.relationshipDelta.jealousy).toBeGreaterThan(8)
    expect(r.transition.relationshipDelta.jealousy).toBeLessThanOrEqual(15)
    expect(r.transition.relationshipDelta.trust).toBeLessThanOrEqual(1)
    expect(r.characterState.mood).toBe('jealous')
    expect(r.context.prompt).toContain('지금 기분')
  })
  it('event rules produce the reality intent, with notBefore for delayed ones', async () => {
    const r = await runTurn({
      llm: llm(),
      snapshot: snapshot({ relationship: relationship({ jealousy: 50 }) }),
      userInput: '소개팅 나갔다 왔어',
      now: new Date('2026-01-01T00:00:00Z'),
    })
    expect(r.firedRules).toContain('jealousy_spike')
    expect(r.transition.realityIntent?.channel).toBe('message')
    expect(r.transition.realityIntent?.notBefore).toBeUndefined()
    expect(r.characterState.firedRules).toContain('jealousy_spike')
    expect(r.transition.memories.some((m) => m.type === 'relationship_change')).toBe(true)

    const again = await runTurn({
      llm: llm(),
      snapshot: snapshot({ relationship: relationship({ jealousy: 60 }), characterState: r.characterState }),
      userInput: '또 소개팅 나갔어',
    })
    expect(again.firedRules).not.toContain('jealousy_spike')
  })
  it('a plain sentence keeps the model nuance within the limit and decays jealousy', async () => {
    const r = await runTurn({ llm: llm(), snapshot: snapshot({ relationship: relationship({ jealousy: 10 }) }), userInput: '오늘 날씨 좋다' })
    expect(r.transition.relationshipDelta.jealousy).toBe(-2)
    expect(Math.abs(r.transition.relationshipDelta.trust ?? 0)).toBeLessThanOrEqual(3)
  })

  /** ECHO 는 같은 모델을 쓰되 보조 분석을 매 턴 돌린다. */
  it('an ECHO turn runs the auxiliary analysis a MIRO turn would skip', async () => {
    const tasks: string[] = []
    const auxiliaryLLM = new AIOrchestrator({ chain: [
      new MockAIProvider((req: GenerationRequest) => { tasks.push(req.task); return buildMockProposal(req.prompt, { characterName: '토마스' }) }),
    ] })
    // 규칙이 보조 분석을 요구하지 않는 평범한 입력.
    const plain = '응 그렇구나'

    tasks.length = 0
    await runTurn({ llm: llm(), snapshot: snapshot(), userInput: plain, auxiliaryLLM, auxiliary: 'planned' })
    const miroTasks = [...tasks]

    tasks.length = 0
    await runTurn({ llm: llm(), snapshot: snapshot(), userInput: plain, auxiliaryLLM, auxiliary: 'always' })
    const echoTasks = [...tasks]

    expect(echoTasks).toContain('semantic_event')
    expect(echoTasks).toContain('memory_extraction')
    expect(echoTasks.length).toBeGreaterThan(miroTasks.length)
  })

  it('asks for the tier output limit, still bounded by what the model allows', async () => {
    const seen: (number | undefined)[] = []
    const capturing = () => new AIOrchestrator({ chain: [
      new MockAIProvider((req: GenerationRequest) => { seen.push(req.maxTokens); return buildMockProposal(req.prompt, { characterName: '토마스' }) }),
    ] })
    await runTurn({ llm: capturing(), snapshot: snapshot(), userInput: '안녕', maxOutputTokens: 512 })
    await runTurn({ llm: capturing(), snapshot: snapshot(), userInput: '안녕', maxOutputTokens: 4096 })
    // 등급이 요청한 값이 그대로 내려가되, 모델의 maxOutputTokens 를 넘지는 않는다.
    expect(seen[0]).toBe(512)
    expect(seen[1]).toBeLessThanOrEqual(4096)
    expect(seen[1]).toBeGreaterThan(seen[0]!)
  })

})
