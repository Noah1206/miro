import { AGENCY_PLANNER_VERSION } from '../agency/planner'
import { verifyAgencyRealization } from '../agency/realization'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgencyState, type AgencyCandidate, type AgencyEvidence, type AgencyGoal, type CompiledCharacter } from '@miro/domain'
import { AIBudgetDeniedError, AIContentBlockedError, type LLMProvider } from '@miro/providers'
import { UnsafeContentError } from '../safety'
import { runTurn } from '../orchestrator'
import type { AgencyTurnInput } from '../agency-turn'
import { recordedConversationReview, event, snapshot, relationship } from './fixtures'

const now = '2026-09-24T12:00:00.000Z'
const statement = '상대를 소유하려 하지 않는다.'
const compiled: CompiledCharacter = { version: 1, sourceHash: 'fixture-source', rules: [{
  id: 'respect', domain: 'value', statement, source: { field: 'personality', start: 0, end: statement.length }, origin: 'explicit', confidence: 1, priority: 1,
}] }
const proof: AgencyEvidence = { id: 'input-1', sessionId: 's1', actor: 'user', kind: 'message', epistemic: 'reported', quote: '소개팅에 갔다 왔어.', occurredAt: now, knownTo: ['c1'] }
const response = '알겠어요. 지금 어떤 이야기를 하고 싶어요?'
const selected = (overrides: Partial<AgencyCandidate> = {}): AgencyCandidate => ({
  id: 'respond', action: 'respond', description: '상대의 선택을 존중하며 대화를 이어간다.', targetActor: 'c1',
  evidenceIds: ['input-1'], ruleIds: ['respect'], goalIds: [], ruleFit: [{ ruleId: 'respect', fit: 1 }], goalFit: [],
  preconditions: [], uncertainty: .1, cost: 0, ...overrides,
})
function agency(mode: 'live' | 'shadow' = 'live'): AgencyTurnInput {
  return { mode, compiled, state: createAgencyState('r1', now), context: {
    sessionId: 's1', revisionId: 'r1', actor: 'c1', evidence: [proof],
    clock: { now, mode: 'real_time', trigger: 'user', allowOfflineAdvance: false },
    permissions: { contact: false, capabilities: ['respond', 'ask', 'decline', 'defer', 'disclose', 'set_boundary', 'cancel_commitment', 'wait'] },
    world: { currentLocation: '런던 구시가지', currentTime: '저녁', worldStatus: null }, relationship: relationship(),
  } }
}
function plan(overrides: Record<string, unknown> = {}) {
  return { appraisal: { interpretation: '상대가 자신의 일상을 말한다.', evidenceIds: ['input-1'], ruleIds: ['respect'], goalCongruence: 0, valueConflict: 0,
    responsibility: 'uncertain', affectDelta: { valence: 0, arousal: 0, stress: 3, energy: 0 }, expression: { openness: 20, directness: 50 }, beliefs: [], relationshipChanges: [],
  }, candidates: [selected()], newGoals: [], goalChanges: [], ...overrides }
}
type StubOptions = { proposal?: Record<string, unknown>; dialogue?: Record<string, unknown>; rejectRealization?: boolean | number; failPlanner?: boolean }
/** Recorded model outputs exercise the real engine/reducer/verifier path, not model quality. */
function provider(options: StubOptions = {}) {
  const calls: Array<{ version?: string; system: string; prompt: string }> = []
  const llm: LLMProvider = {
    info: { mode: 'mock', name: 'recorded-agency-fixture', notice: 'Recorded contract fixture' },
    async generateStructured(request) {
      calls.push({ version: request.promptVersion, system: request.system, prompt: request.prompt })
      if (request.promptVersion === AGENCY_PLANNER_VERSION) {
        if (options.failPlanner) throw new Error('recorded_provider_failure')
        return request.schema.parse(options.proposal ?? plan())
      }
      if (request.promptVersion === 'agency-communication-check:v8') {
        const checks = calls.filter(c => c.version === request.promptVersion).length
        const reject = typeof options.rejectRealization === 'number' ? checks <= options.rejectRealization : Boolean(options.rejectRealization)
        return request.schema.parse(recordedConversationReview(request, { acceptable: !reject, blockIndex: 0 }))
      }
      if (request.promptVersion === 'agency-realization-check:v5') {
        const payload = JSON.parse(request.prompt)
        // number = 처음 n 번만 거부(재생성 계약을 본다). true = 항상 거부.
        const checks = calls.filter(c => c.version === 'agency-realization-check:v5').length
        const reject = typeof options.rejectRealization === 'number' ? checks <= options.rejectRealization : Boolean(options.rejectRealization)
        return request.schema.parse({ decisionId: payload.decision.id, aligned: !reject, claims: [], unsupported: [],
          violations: reject ? ['contradicts_decision'] : [] })
      }
      return request.schema.parse(options.dialogue ?? { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: response }] } })
    },
  }
  return { llm, calls }
}

beforeEach(() => vi.stubEnv('MIRO_MODE', 'alpha'))
afterEach(() => vi.unstubAllEnvs())

describe('runTurn agency integration', () => {
  it('checks invented user history before streaming even without any communication preference', async () => {
    const stub = provider()
    const current = '할머니가 주신 파란 책갈피를 가지고 다녀.'
    const input = agency()
    input.context.evidence = [{ ...proof, quote: current }]
    let renders = 0, checks = 0
    const good = '할머니가 주신 물건이라면 쉽게 버리기 어렵겠어요.'
    const llm: LLMProvider = { ...stub.llm, async generateStructured(request) {
      if (request.promptVersion === 'agency-communication-check:v8') {
        checks++
        expect(JSON.parse(request.prompt).groundingEvidence).toContainEqual(expect.objectContaining({ id: 'current-user-input', text: current }))
        return request.schema.parse(recordedConversationReview(request, { acceptable: renders > 1, blockIndex: 0, reason: renders > 1 ? 'none' : 'unsupported_user_history' }))
      }
      if (request.task === 'dialogue') {
        const draft = { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: ++renders === 1 ? '사연에서 밤마다 책을 읽다 잠든다고 하셨을 때 그 책갈피군요.' : good }] } }
        request.onText?.(JSON.stringify(draft))
        return request.schema.parse(draft)
      }
      return stub.llm.generateStructured(request)
    } }
    const visible: string[][] = []
    const result = await runTurn({ llm, snapshot: snapshot(), agency: input, userInput: current,
      stream: { onBlocks: blocks => visible.push(blocks.map(b => b.text)), onReset: () => { throw new Error('Unverified draft exposed') } } })
    expect(renders).toBe(2)
    expect(checks).toBe(2)
    expect(result.transition.blocks[0]?.text).toBe(good)
    expect(visible).toEqual([[good]])
  })

  it('checks an old preference outside the recent window at turn 120 using the original user words', async () => {
    const stub = provider()
    const input = agency()
    const old = { ...proof, id: 'old-preference', quote: '나를 공주라고 부르지 마. 그냥 이름으로 불러.', occurredAt: '2026-09-01T00:00:00Z' }
    input.context.evidence = [old, { ...proof, quote: '오늘도 책을 읽자.' }]
    const s = snapshot({ turnCount: 120, recentMessages: Array.from({ length: 12 }, (_, i) => ({ id: `later-${i}`, role: 'user', content: '책이 두껍네.' })) })
    const result = await runTurn({ llm: stub.llm, snapshot: s, userInput: '오늘도 책을 읽자.', agency: input })
    expect(result.agency?.verification.reviewed).toBe(true)
    const review = stub.calls.find(call => call.version === 'agency-communication-check:v8')!
    expect(JSON.parse(review.prompt).preferenceEvidence).toContainEqual({ sourceId: old.id, text: old.quote, occurredAt: old.occurredAt, kind: 'user_quote' })
    expect(stub.calls.find(call => call.version === 'agency-dialogue:v7')!.prompt).toContain(old.quote)
  })

  // 2026-10-16 운영 실측: 다시 쓴 뒤 턴 한도가 차면 '입력을 줄이라'는 한도 안내가 아니라 거부된 생성으로 끝나야 한다.
  it('a turn budget hit after a rejected draft is a rejected generation, not a turn-length limit', async () => {
    const stub = provider({ rejectRealization: true })
    let dialogues = 0
    const llm: LLMProvider = { ...stub.llm, async generateStructured(request) {
      if (request.task === 'dialogue' && ++dialogues === 2) throw new AIBudgetDeniedError('turn_tokens')
      return stub.llm.generateStructured(request)
    } }
    await expect(runTurn({ llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })).rejects.toThrow('agency_realization_rejected turn_budget')
    const first = provider()
    const denied: LLMProvider = { ...first.llm, async generateStructured(request) {
      if (request.task === 'dialogue') throw new AIBudgetDeniedError('turn_tokens')
      return first.llm.generateStructured(request)
    } }
    await expect(runTurn({ llm: denied, snapshot: snapshot(), userInput: proof.quote, agency: agency() })).rejects.toBeInstanceOf(AIBudgetDeniedError)
  })

  // 10/17 사용자: 답이 너무 늦게 보인다 — 검토가 없는 턴은 대사를 만드는 대로 보여 주고, 검토가 있으면 지금처럼 모았다가 보낸다.
  it('streams the draft while it is written when nothing needs review, and holds it when the strict review is on', async () => {
    const run = async () => {
      const stub = provider()
      const seen: string[] = []
      const llm: LLMProvider = { ...stub.llm, async generateStructured(request) {
        if (request.task === 'dialogue') { request.onText?.(JSON.stringify({ rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: response }] } })); seen.push(stub.calls.length ? 'draft' : '') }
        return stub.llm.generateStructured(request)
      } }
      const order: string[] = []
      await runTurn({ llm, snapshot: snapshot(), userInput: '오늘 공방은 어땠어요?', agency: agency(),
        stream: { onBlocks: () => order.push(seen.length ? 'shown' : 'early'), onReset: () => order.push('reset') } })
      return order
    }
    vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', '0')
    expect((await run()).length).toBe(2)                 // 쓰는 중에 한 번, 저장본으로 한 번
    vi.stubEnv('MIRO_FEATURE_STRICT_CONVERSATION_REVIEW', '1')
    expect((await run()).length).toBe(1)                 // 검토가 끝난 뒤에만
  })

  it('rewrites before delivery when a reply ignores an explicit communication preference', async () => {
    const stub = provider({ rejectRealization: 1 })
    const input = agency()
    const text = '완벽하다는 칭찬은 부담돼. 빈말 대신 어색한 부분 하나만 말해줘.'
    input.context.evidence = [{ ...proof, quote: text }]
    const visible: string[][] = []
    const llm: LLMProvider = { ...stub.llm, async generateStructured(request) {
      if (request.task === 'dialogue') request.onText?.(JSON.stringify({ rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: response }] } }))
      return stub.llm.generateStructured(request)
    } }
    const result = await runTurn({ llm, snapshot: snapshot(), userInput: text, agency: input,
      stream: { onBlocks: blocks => visible.push(blocks.map(block => block.text)), onReset: () => { throw new Error('Rejected draft was shown') } } })
    expect(result.agency?.verification).toMatchObject({ ok: true, reviewed: true })
    expect(stub.calls.filter(call => call.version === 'agency-communication-check:v8')).toHaveLength(2)
    const renders = stub.calls.filter(call => call.version === 'agency-dialogue:v7')
    expect(renders).toHaveLength(2)
    expect(renders[1]!.prompt).toContain('원하지 않은 과찬을 다른 과찬으로 바꾸지 말고')
    expect(visible).toEqual([[response]])
  })

  /** 의미 검토가 도는 결정(disclose) — 검토 단계의 출처·실패를 보려면 검토가 있어야 한다(대답·질문은 검토하지 않는다). */
  const reviewed = () => plan({ candidates: [selected({ id: 'disclose', action: 'disclose', description: '자기 이야기를 조금 꺼낸다.' })] })
  /** 한 단계만 예비 모델(gpt-mini)이 답한 것처럼 — 오케스트레이터가 남기는 표식(lastFallbackUsed·lastModelId)을 흉내 낸다. */
  function backupAtProvider(backupAt: string) {
    const stub = provider({ proposal: reviewed() })
    const llm: LLMProvider & { lastFallbackUsed: boolean; lastModelId: string } = {
      info: { mode: 'live', name: 'recorded-trace-simulation', notice: 'No network: synthetic provider metadata.' },
      lastFallbackUsed: false, lastModelId: 'gemini-flash',
      async generateStructured(request) {
        this.lastFallbackUsed = request.promptVersion === backupAt
        this.lastModelId = this.lastFallbackUsed ? 'gpt-mini' : 'gemini-flash'
        return stub.llm.generateStructured(request)
      },
    }
    return llm
  }
  // 10/2 결정: 예비 모델은 강한 일(계획·대사·검사)의 정식 예비다 — 어느 단계가 예비로 답해도 live 이고, 운영에서도 턴을 막지 않는다.
  it.each([AGENCY_PLANNER_VERSION, 'agency-dialogue:v7', 'agency-realization-check:v5'])(
    'a turn whose %s step was answered by the backup model is still live, also in production', async backupAt => {
      vi.stubEnv('VERCEL_ENV', 'production')
      const result = await runTurn({ llm: backupAtProvider(backupAt), snapshot: snapshot(), userInput: proof.quote, agency: agency() })
      expect(result.providerMode).toBe('live')
      expect(result.agency?.plan.modelId).toBe(backupAt === AGENCY_PLANNER_VERSION ? 'gpt-mini' : 'gemini-flash')
    },
  )

  it('runs the live decision path without legacy jealousy templates overriding the choice', async () => {
    const stub = provider()
    const input = agency()
    const result = await runTurn({ llm: stub.llm, snapshot: snapshot({ relationship: relationship({ jealousy: 60 }) }), userInput: proof.quote, agency: input })
    expect(result.agency?.plan.decision.action).toBe('respond')
    expect(result.agency?.verification.ok).toBe(true)
    expect(result.providerMode).toBe('mock')
    expect(result.firedRules).toEqual([])
    expect(result.transition.realityIntent).toBeNull()
    expect(result.semanticEvents).toEqual([expect.objectContaining({ type: 'mentioned_other_romantic_interest' })])
    expect(result.agency?.plan.state.affect.stress).toBe(23)
    expect(input.state.sequence).toBe(0)
    // Ordinary replies receive the compact user-grounding check, without a full canon audit.
    expect(result.agency?.verification.reviewed).toBe(true)
    expect(stub.calls.map(c => c.version)).toEqual([AGENCY_PLANNER_VERSION, 'agency-dialogue:v7', 'agency-communication-check:v8'])
    expect(stub.calls[1]?.system).toContain('Server-authorized character choice')
  })
  it('shadow planning never changes the legacy turn or returns state for persistence', async () => {
    const input = agency('shadow')
    const before = JSON.stringify(input.state)
    const result = await runTurn({ llm: provider().llm, snapshot: snapshot({ relationship: relationship({ jealousy: 60 }) }), userInput: proof.quote, agency: input })
    expect(result.agency).toBeUndefined()
    expect(result.agencyShadow).toEqual({ action: 'respond', issueCount: 0 })
    expect(result.firedRules).toContain('jealousy_spike')
    expect(result.transition.realityIntent?.channel).toBe('message')
    expect(JSON.stringify(input.state)).toBe(before)
  })
  it('keeps the old path usable after a shadow provider failure but never silently falls back live', async () => {
    const shadow = await runTurn({ llm: provider({ failPlanner: true }).llm, snapshot: snapshot(), userInput: '안녕', agency: agency('shadow') })
    expect(shadow.agencyShadow).toEqual({ error: true })
    expect(shadow.transition.blocks.length).toBeGreaterThan(0)
    await expect(runTurn({ llm: provider({ failPlanner: true }).llm, snapshot: snapshot(), userInput: '안녕', agency: agency('live') })).rejects.toThrow('recorded_provider_failure')
  })
  // §3.3: 승인 밖 변경은 제안에서 걷어 내고 거부로 기록한다 — 대사는 남고, 세계는 그대로다.
  it('strips renderer world mutations, keeps the reply, and records the rejection instead of failing the turn', async () => {
    const stub = provider({ dialogue: { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: response }, { type: 'npc', speaker: '이수현', text: '안녕' }] },
      worldDelta: { currentLocation: '서울', currentTime: '밤' }, eventCandidates: [{ type: 'crisis', summary: '사건', relevance: 1, salience: 1, participantNpcIds: [] }],
      eventUpdates: [{ eventId: 'e1', status: 'resolved' }] } })
    const result = await runTurn({ llm: stub.llm, snapshot: snapshot({ activeEvents: [event()] }), userInput: proof.quote, agency: agency() })
    expect(result.transition.worldDelta).toEqual({ currentTime: '밤' })   // 시간은 장면의 공기 — 허용. 장소는 결정이 아니다.
    expect(result.transition.newEvent).toBeNull()
    expect(result.transition.eventUpdates).toEqual([])
    expect(result.transition.blocks.map(b => b.type)).toEqual(['dialogue'])
    expect(result.records.filter(r => r.rule === 'unapproved_mutation').map(r => r.field).sort()).toEqual(['eventCandidates', 'eventUpdates', 'rp.blocks', 'worldDelta.currentLocation'])
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v7')?.prompt).not.toContain('왼팔 부상')
    expect(result.records).toContainEqual(expect.objectContaining({ field: 'world.currentTime', rule: 'world_delta', status: 'applied', decisionId: result.agency!.plan.decision.id }))
    // Stripped mutations schedule the full semantic review after the inline user-grounding check.
    expect(result.agency?.review?.strippedMutations).toBe(4)
    expect(stub.calls.some(c => c.version === 'agency-realization-check:v5')).toBe(false)
    expect((await verifyAgencyRealization(stub.llm, result.agency!.review!)).reviewed).toBe(true)
  })
  it('returns the risky realization for deferred review without silently replacing the already-rendered reply', async () => {
    const once = provider({ rejectRealization: true, proposal: reviewed() })
    const llm: LLMProvider = { ...once.llm, async generateStructured(request) {
      if (request.promptVersion === 'agency-communication-check:v8') return request.schema.parse(recordedConversationReview(request, { acceptable: true, blockIndex: 0, reason: 'none' }))
      return once.llm.generateStructured(request)
    } }
    const result = await runTurn({ llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })
    expect(result.agency?.verification.ok).toBe(true)
    expect(result.agency?.verification.deferredReview).toBe('action:disclose')
    expect(once.calls.map(c => c.version)).toEqual([AGENCY_PLANNER_VERSION, 'agency-dialogue:v7'])
    const check = await verifyAgencyRealization(once.llm, result.agency!.review!)
    expect(check.ok).toBe(false)
    expect(check.issues.map(i => i.reason)).toContain('contradicts_decision')
    expect(once.calls.filter(c => c.version === 'agency-dialogue:v7')).toHaveLength(1)
  })
  it('reports a provider block on the rendered reply as a safety refusal, like the legacy path', async () => {
    const stub = provider()
    const blocking: LLMProvider = { info: stub.llm.info, async generateStructured(request) {
      if (request.promptVersion === 'agency-dialogue:v7') throw new AIContentBlockedError()
      return stub.llm.generateStructured(request)
    } }
    await expect(runTurn({ llm: blocking, snapshot: snapshot(), userInput: proof.quote, agency: agency() })).rejects.toBeInstanceOf(UnsafeContentError)
  })
  it('records a move as a held intent: the world location does not change and the renderer is told not to arrive', async () => {
    const stub = provider({ proposal: plan({ candidates: [selected({ action: 'move', destination: '역 앞 카페' })] }) })
    const input = agency()
    input.context.permissions.capabilities.push('move')
    const result = await runTurn({ llm: stub.llm, snapshot: snapshot(), userInput: proof.quote, agency: input })
    expect(result.agency?.plan.decision.action).toBe('move')
    expect(result.transition.worldDelta).toBeNull()
    expect(result.records).toContainEqual(expect.objectContaining({ field: 'world.currentLocation', before: '런던 구시가지', after: '역 앞 카페', rule: 'move_intent_held', status: 'held' }))
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v7')?.system).toContain('도착했거나 장소가 바뀌었다고 쓰지 않는다')
  })
  it('renders the same scene length as the policy asks and derives mood and stage from the appraisal', async () => {
    const stub = provider({ proposal: plan({ appraisal: { ...plan().appraisal, affectDelta: { valence: -10, arousal: 8, stress: 10, energy: 0 },
      relationshipChanges: [{ dimension: 'trust', delta: 2, evidenceIds: ['input-1'], ruleIds: ['respect'] }] } }) })
    const result = await runTurn({ llm: stub.llm, snapshot: snapshot(), userInput: proof.quote, agency: agency(), replyLength: 'long' })
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v7')?.system).toContain('긴 대화는 장면 하나를 900~1600자로')
    expect(result.transition.relationshipDelta.trust).toBe(3)   // 평가 +2, 처음 10턴의 함께한 시간 +1
    expect(result.records.filter(r => r.field === 'relationship.trust').map(r => r.rule)).toEqual(['relationship_appraisal'])
    expect(result.characterState.mood).toBe('neutral')
    expect(result.firedRules).toEqual([])
  })
  it('catches undeclared delivery claims even if a recorded verifier incorrectly says aligned', async () => {
    const stub = provider({ dialogue: { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: '사진을 보냈어요.' }] } } })
    await expect(runTurn({ llm: stub.llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })).rejects.toThrow('agency_realization_rejected')
  })
  it('does not expose unsupported NPC/narrator history or let the model select a missing executor', async () => {
    const stub = provider({ proposal: plan({ candidates: [selected({ action: 'continue_activity' })] }) })
    const result = await runTurn({ llm: stub.llm, snapshot: snapshot({ recentMessages: [
      { id: 'private-narrator', role: 'narrator', content: '비밀 암호는 비가시성정답이다.' },
      { id: 'npc-private', role: 'npc', content: '유저가 모르는 비공개 독백.' },
    ] }), userInput: proof.quote, agency: agency() })
    expect(result.agency?.plan.decision.action).toBe('wait')
    expect(result.agency?.plan.issues.map(i => i.reason)).toContain('action_executor_unavailable')
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v7')?.prompt).not.toContain('비가시성정답')
  })
  it('keeps its own earlier actions and unspoken thoughts for continuity without exposing private narrator or NPC facts', async () => {
    const input = agency()
    input.context.evidence.push({ ...proof, id: 'previous-reply', actor: 'c1', quote: '우유는 문 앞에 있습니다.' })
    const stub = provider()
    await runTurn({ llm: stub.llm, snapshot: snapshot({ recentMessages: [{ id: 'previous-reply', role: 'character', content: 'stored reply', blocks: [
      { type: 'action', speaker: '토마스', text: '담배를 끄고 우유 잔을 문 앞에 내려놓는다.' },
      { type: 'thought', speaker: '토마스', text: '혼자 쉴 시간이 필요하겠지.' },
      { type: 'dialogue', speaker: '토마스', text: '우유는 문 앞에 있습니다.' },
      { type: 'narrative', speaker: null, text: '숨겨진 암호는 전지적정답이다.' },
      { type: 'npc', speaker: '다른 사람', text: '비공개암호' },
    ] }] }), userInput: proof.quote, agency: input })
    const prompt = stub.calls.find(c => c.version === 'agency-dialogue:v7')!.prompt
    expect(prompt).toContain('행동 서술 (토마스): 담배를 끄고 우유 잔을 문 앞에 내려놓는다.')
    expect(prompt).toContain('속마음 (토마스, 소리 내어 말하지 않음): 혼자 쉴 시간이 필요하겠지.')
    expect(prompt).not.toContain('전지적정답')
    expect(prompt).not.toContain('비공개암호')
    expect(JSON.parse(stub.calls[0]!.prompt).evidence.find((e: { id: string }) => e.id === 'previous-reply').quote).toBe('우유는 문 앞에 있습니다.')
  })
  it('applies an explicit reported-user cancellation and preserves it on the following turn', async () => {
    const input = agency()
    const pending: AgencyGoal = { id: 'old-promise', description: '저녁에 연락한다.', evidenceIds: ['input-1'], ruleIds: ['respect'], priority: .8,
      status: 'active', createdAt: now, updatedAt: now, success: 'sent' }
    input.state.goals = [pending]
    input.context.evidence = [{ ...proof, quote: '오늘 약속은 취소할게.' }]
    const first = await runTurn({ llm: provider({ proposal: plan({
      candidates: [selected({ action: 'cancel_commitment', goalIds: ['old-promise'] })],
      goalChanges: [{ kind: 'cancel', goalId: 'old-promise', evidenceIds: ['input-1'] }],
    }) }).llm, snapshot: snapshot(), userInput: '오늘 약속은 취소할게.', agency: input })
    expect(first.agency?.plan.state.goals[0]?.status).toBe('cancelled')
    const nextInput = { ...input, state: first.agency!.plan.state }
    const second = await runTurn({ llm: provider().llm, snapshot: snapshot(), userInput: '다른 이야기 하자.', agency: nextInput })
    expect(second.agency?.plan.state.goals[0]?.status).toBe('cancelled')
    expect(second.agency?.plan.state.affect.stress).toBe(first.agency?.plan.state.affect.stress)
  })
})
