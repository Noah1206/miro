import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAgencyState, type AgencyCandidate, type AgencyEvidence, type AgencyGoal, type CompiledCharacter } from '@miro/domain'
import type { LLMProvider } from '@miro/providers'
import { runTurn } from '../orchestrator'
import type { AgencyTurnInput } from '../agency-turn'
import { snapshot, relationship } from './fixtures'

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
type StubOptions = { proposal?: Record<string, unknown>; dialogue?: Record<string, unknown>; rejectRealization?: boolean; failPlanner?: boolean }
/** Recorded model outputs exercise the real engine/reducer/verifier path, not model quality. */
function provider(options: StubOptions = {}) {
  const calls: Array<{ version?: string; system: string; prompt: string }> = []
  const llm: LLMProvider = {
    info: { mode: 'mock', name: 'recorded-agency-fixture', notice: 'Recorded contract fixture' },
    async generateStructured(request) {
      calls.push({ version: request.promptVersion, system: request.system, prompt: request.prompt })
      if (request.promptVersion === 'agency-planner:v2') {
        if (options.failPlanner) throw new Error('recorded_provider_failure')
        return request.schema.parse(options.proposal ?? plan())
      }
      if (request.promptVersion === 'agency-realization-check:v2') {
        const payload = JSON.parse(request.prompt)
        return request.schema.parse({ decisionId: payload.decision.id, aligned: !options.rejectRealization, claims: [], unsupported: [],
          violations: options.rejectRealization ? ['contradicts_decision'] : [] })
      }
      return request.schema.parse(options.dialogue ?? { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: response }] } })
    },
  }
  return { llm, calls }
}

beforeEach(() => vi.stubEnv('MIRO_MODE', 'alpha'))
afterEach(() => vi.unstubAllEnvs())

describe('runTurn agency integration', () => {
  function changingTraceProvider(fallbackAt: string) {
    const stub = provider()
    const llm: LLMProvider & { lastFallbackUsed: boolean } = {
      info: { mode: 'live', name: 'recorded-trace-simulation', notice: 'No network: synthetic provider metadata.' },
      lastFallbackUsed: false,
      async generateStructured(request) {
        this.lastFallbackUsed = request.promptVersion === fallbackAt
        if (request.task === 'moderation') return request.schema.parse({ allowed: true, category: 'safe' })
        return stub.llm.generateStructured(request)
      },
    }
    return llm
  }
  it.each(['agency-planner:v2', 'agency-dialogue:v2', 'agency-realization-check:v2'])(
    'retains %s fallback provenance after later primary calls', async fallbackAt => {
      const llm = changingTraceProvider(fallbackAt)
      const result = await runTurn({ llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })
      expect(result.providerMode).toBe('fallback')
    },
  )
  it.each([
    ['agency-planner:v2', 'agency_planner_not_live'],
    ['agency-dialogue:v2', 'agency_renderer_not_live'],
    ['agency-realization-check:v2', 'agency_verifier_not_live'],
  ])('fails closed in production when %s used fallback', async (fallbackAt, failure) => {
    vi.stubEnv('VERCEL_ENV', 'production')
    await expect(runTurn({ llm: changingTraceProvider(fallbackAt), snapshot: snapshot(), userInput: proof.quote, agency: agency() }))
      .rejects.toThrow(failure)
  })

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
    expect(stub.calls.map(c => c.version)).toEqual(['agency-planner:v2', 'agency-dialogue:v2', 'agency-realization-check:v2'])
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
  it('blocks renderer world mutations rather than committing an unplanned event', async () => {
    const stub = provider({ dialogue: { rp: { blocks: [{ type: 'dialogue', speaker: '토마스', text: response }] }, worldDelta: { currentLocation: '서울' } } })
    await expect(runTurn({ llm: stub.llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })).rejects.toThrow('agency_unapproved_mutation')
    expect(stub.calls.some(c => c.version === 'agency-realization-check:v2')).toBe(false)
  })
  it('rejects a selected action whose actual dialogue fails semantic verification', async () => {
    const stub = provider({ rejectRealization: true })
    await expect(runTurn({ llm: stub.llm, snapshot: snapshot(), userInput: proof.quote, agency: agency() })).rejects.toThrow('agency_realization_rejected')
    expect(stub.calls.at(-1)?.version).toBe('agency-realization-check:v2')
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
    expect(stub.calls.find(c => c.version === 'agency-dialogue:v2')?.prompt).not.toContain('비가시성정답')
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
