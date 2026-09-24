import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIOrchestrator, MockAIProvider, type GenerationRequest } from '@miro/providers'
import { runTurn } from '../orchestrator'
import { planTasks } from '../task-router'
import { buildMockProposal } from '../mock-rp'
import { snapshot, relationship } from './fixtures'

const llm = (over: Record<string, unknown> = {}) => new AIOrchestrator({ chain: [
  new MockAIProvider((req: GenerationRequest) => ({ ...buildMockProposal(req.prompt, { characterName: '토마스' }), ...over })),
] })

afterEach(() => vi.unstubAllEnvs())
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

  // 사건이 없어도 대화다운 턴은 캐릭터의 곡선대로 관계를 움직인다. 픽스처의 토마스는 절제·기다림이라 '아주 천천히'(3턴에 한 번).
  it('an ordinary turn brings them a little closer, at the character\'s own pace', async () => {
    const input = '오늘 공방에 온 이유를 천천히 말씀드릴게요'
    const moved = await runTurn({ llm: llm(), snapshot: snapshot({ turnCount: 5 }), userInput: input })
    expect(moved.transition.relationshipDelta).toMatchObject({ trust: 1, attachment: 1, emotionalDistance: -1 })
    const still = await runTurn({ llm: llm(), snapshot: snapshot({ turnCount: 6 }), userInput: input })
    expect(still.transition.relationshipDelta.attachment ?? 0).toBe(0)
    const steady = snapshot({ turnCount: 6 })
    steady.character = { ...steady.character, personality: { ...steady.character.personality, bonding: 'steady' } }
    expect((await runTurn({ llm: llm(), snapshot: steady, userInput: input })).transition.relationshipDelta.attachment).toBe(1)
  })

  // 실시간 음성: 캐릭터는 이미 소리로 말했다. 새로 만들지 않고 그 말을 받아 관계·기억을 채팅 턴처럼 움직인다.
  it('a spoken turn keeps what was said and never calls the dialogue model', async () => {
    const tasks: string[] = []
    const spy = new AIOrchestrator({ chain: [new MockAIProvider((req: GenerationRequest) => { tasks.push(req.task); return buildMockProposal(req.prompt, { characterName: '토마스' }) })] })
    const r = await runTurn({ llm: spy, snapshot: snapshot({ turnCount: 5, mode: 'voice_call' }), userInput: '오늘 공방에 온 이유를 말씀드릴게요', spokenReply: '그래요. 천천히 말해 봐요.' })
    expect(r.transition.blocks).toEqual([{ type: 'dialogue', speaker: '토마스', text: '그래요. 천천히 말해 봐요.' }])
    expect(tasks).not.toContain('dialogue')
    expect(r.transition.relationshipDelta).toMatchObject({ attachment: 1, emotionalDistance: -1 })
  })

  // 2026-09-24: 운영에서도 관계용 AI 분류를 매 턴 돌린다 — 표현 규칙이 못 잡는 평범한 문장 때문에 관계가 멈춰 있었다.
  it('the production preset classifies every turn, not only keyword turns', () => {
    vi.stubEnv('MIRO_MODE', 'production')
    expect(planTasks('오늘 공방에 온 이유를 말씀드릴게요', 1)).toContain('semantic_event')
    vi.stubEnv('MIRO_FEATURE_LLM_SEMANTIC_ANALYSIS', '0')
    expect(planTasks('오늘 공방에 온 이유를 말씀드릴게요', 1)).not.toContain('semantic_event')
  })

  /** ECHO 는 같은 모델을 쓰되 보조 분석을 매 턴 돌린다. */
  it('an ECHO turn never revives a task the deployment turned off', async () => {
    // 배포가 끈 기능은 ECHO 도 되살리지 못한다.
    vi.stubEnv('MIRO_MODE', 'production')
    vi.stubEnv('MIRO_FEATURE_MEMORY_EXTRACTION', '0')
    vi.stubEnv('MIRO_FEATURE_LLM_SEMANTIC_ANALYSIS', '0')
    const tasks: string[] = []
    const auxiliaryLLM = new AIOrchestrator({ chain: [
      new MockAIProvider((req: GenerationRequest) => { tasks.push(req.task); return buildMockProposal(req.prompt, { characterName: '토마스' }) }),
    ] })
    await runTurn({ llm: llm(), snapshot: snapshot(), userInput: '기억해줘 나 커피 좋아해', auxiliaryLLM, auxiliary: 'always' })
    expect(tasks).not.toContain('memory_extraction')
    expect(tasks).not.toContain('semantic_event')
  })

  /**
   * 입력 검열과 보조 분석은 서로를 기다리지 않는다. 순서대로 돌면 유저가 두 번 기다린다 —
   * 실측으로 검열 0.9초 + 추출 1.2초였다. mock provider 는 검열을 건너뛰므로(safety.ts)
   * 검열 자리에 느린 약속을 직접 세워 두 호출이 겹치는지 본다.
   */
  it('does not wait for the input safety check before starting the auxiliary analysis', async () => {
    vi.stubEnv('MIRO_FEATURE_MEMORY_EXTRACTION', '1')
    const t0 = Date.now()
    let extractionStartedAt = -1
    let safetyResolvedAt = -1

    const auxiliaryLLM = new AIOrchestrator({ chain: [new MockAIProvider((req: GenerationRequest) => {
      if (req.task === 'memory_extraction') extractionStartedAt = Date.now() - t0
      return { memories: [] }
    })] })
    // 대사 모델은 검열 역할도 겸한다 — 첫 호출(입력 검열)을 60ms 붙잡는다.
    const llm = new AIOrchestrator({ chain: [new MockAIProvider((req: GenerationRequest) => {
      if (req.task !== 'moderation') return buildMockProposal(req.prompt, { characterName: '토마스' })
      return new Promise(resolve => setTimeout(() => { safetyResolvedAt = Date.now() - t0; resolve({ allowed: true, category: 'safe' }) }, 60))
    })] })

    await runTurn({ llm, snapshot: snapshot(), userInput: '기억해줘 나 커피 좋아해', auxiliaryLLM, auxiliary: 'always' })

    expect(extractionStartedAt, '기억 추출이 돌아야 한다').toBeGreaterThanOrEqual(0)
    // 순차라면 검열이 끝난 뒤에야 시작한다. 병렬이면 그 전에 시작한다.
    if (safetyResolvedAt >= 0) expect(extractionStartedAt).toBeLessThan(safetyResolvedAt)
  })

  it('an ECHO turn runs the auxiliary analysis a MIRO turn would skip', async () => {
    const tasks: string[] = []
    const auxiliaryLLM = new AIOrchestrator({ chain: [
      new MockAIProvider((req: GenerationRequest) => { tasks.push(req.task); return buildMockProposal(req.prompt, { characterName: '토마스' }) }),
    ] })
    // 기능이 켜진 배포를 가정한다 — 등급 차이만 보기 위해서다.
    vi.stubEnv('MIRO_FEATURE_LLM_SEMANTIC_ANALYSIS', '1')
    vi.stubEnv('MIRO_FEATURE_MEMORY_EXTRACTION', '1')
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
