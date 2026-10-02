import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgencyState, type AgencyCandidate, type AgencyEvidence, type AgencyGoal, type CompiledCharacter } from '@miro/domain'
import { AIContentBlockedError, type LLMProvider } from '@miro/providers'
import { UnsafeContentError } from '../safety'
import { runTurn } from '../orchestrator'
import type { AgencyTurnInput } from '../agency-turn'
import { event, snapshot, relationship } from './fixtures'

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
      if (request.promptVersion === 'agency-planner:v6') {
        if (options.failPlanner) throw new Error('recorded_provider_failure')
        return request.schema.parse(options.proposal ?? plan())
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
  it.each(['agency-planner:v6', 'agency-dialogue:v4', 'agency-realization-check:v5'])(
    'a turn whose %s step was answered by the backup model is still live, also in production', async backupAt => {
      vi.stubEnv('VERCEL_ENV', 'production')
      const result = await runTurn({ llm: backupAtProvider(backupAt), snapshot: snapshot(), userInput: proof.quote, agency: agency() })
      expect(result.providerMode).toBe('live')
      expect(result.agency?.plan.modelId).toBe(backupAt === 'agency-planner:v6' ? 'gpt-mini' : 'gemini-flash')
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
    expect(result.semanticEvents).toEqual([])
    expect(result.agency?.plan.state.affect.stress).toBe(23)
    expect(input.state.sequence).toBe(0)
    // 대답(respond)은 실행·약속·완료 주장이 없어 의미 검토를 하지 않는다 — 결정적 검사만 한다(10/2).
    expect(result.agency?.verification.reviewed).toBe(false)
    expect(stub.calls.map(c => c.version)).toEqual(['agency-planner:v6', 'agency-dialogue:v4'])
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
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v4')?.prompt).not.toContain('왼팔 부상')
    expect(result.records).toContainEqual(expect.objectContaining({ field: 'world.currentTime', rule: 'world_delta', status: 'applied', decisionId: result.agency!.plan.decision.id }))
    // 걷힌 변경을 글이 서술했을 수 있다 — 대답이어도 의미 검토를 한다.
    expect(stub.calls.some(c => c.version === 'agency-realization-check:v5')).toBe(true)
  })
  it('rewrites once with the rejection codes when verification fails, then gives up with the codes', async () => {
    const once = provider({ rejectRealization: 1, proposal: reviewed() })
    const result = await runTurn({ llm: once.llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })
    expect(result.agency?.verification.ok).toBe(true)
    expect(once.calls.map(c => c.version)).toEqual(['agency-planner:v6', 'agency-dialogue:v4', 'agency-realization-check:v5', 'agency-dialogue:v4', 'agency-realization-check:v5'])
    expect(once.calls[3]?.prompt).toContain('이전 응답이 거부된 이유')
    const always = provider({ rejectRealization: true, proposal: reviewed() })
    await expect(runTurn({ llm: always.llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })).rejects.toThrow(/^agency_realization_rejected semantic_/)
    expect(always.calls.filter(c => c.version === 'agency-dialogue:v4')).toHaveLength(2)
  })
  it('reports a provider block on the rendered reply as a safety refusal, like the legacy path', async () => {
    const stub = provider()
    const blocking: LLMProvider = { info: stub.llm.info, async generateStructured(request) {
      if (request.promptVersion === 'agency-dialogue:v4') throw new AIContentBlockedError()
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
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v4')?.system).toContain('도착했거나 장소가 바뀌었다고 쓰지 않는다')
  })
  it('renders the same scene length as the policy asks and derives mood and stage from the appraisal', async () => {
    const stub = provider({ proposal: plan({ appraisal: { ...plan().appraisal, affectDelta: { valence: -10, arousal: 8, stress: 10, energy: 0 },
      relationshipChanges: [{ dimension: 'trust', delta: 2, evidenceIds: ['input-1'], ruleIds: ['respect'] }] } }) })
    const result = await runTurn({ llm: stub.llm, snapshot: snapshot(), userInput: proof.quote, agency: agency(), replyLength: 'long' })
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v4')?.system).toMatch(/블록 8~11개, 전체 1000~1600자/)
    expect(result.transition.relationshipDelta.trust).toBe(2)
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
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v4')?.prompt).not.toContain('비가시성정답')
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
