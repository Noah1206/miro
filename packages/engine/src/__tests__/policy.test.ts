import { afterEach, describe, expect, it, vi } from 'vitest'
import { AIOrchestrator, MockAIProvider, type GenerationRequest } from '@miro/providers'
import { POLICY } from '@miro/config'
import { policyForSnapshot, resolveTurnPolicy } from '../policy'
import { runTurn } from '../orchestrator'
import { buildMockProposal } from '../mock-rp'
import { snapshot } from './fixtures'

afterEach(() => vi.unstubAllEnvs())

/** 1단계 계약(agency-core-transition-plan §3.1·§4): 경험·등급·채널을 분리하고, 동작은 바꾸지 않는다. */
describe('turn policy', () => {
  it('a standard character has no world or proactive permission on either tier', () => {
    for (const tier of ['miro', 'echo'] as const) {
      const p = resolveTurnPolicy({ experience: 'chat', tier, channel: 'scene', agencyMode: 'live', agencyReady: true })
      expect(p.permissions).toEqual({ worldChange: false, proactiveContact: false })
      expect(p.engine).toBe('legacy')
    }
  })
  it('ECHO changes budget only; permissions come from the experience', () => {
    const miro = resolveTurnPolicy({ experience: 'reality', tier: 'miro', channel: 'scene', agencyMode: 'off', agencyReady: false })
    const echo = resolveTurnPolicy({ experience: 'reality', tier: 'echo', channel: 'scene', agencyMode: 'off', agencyReady: false })
    expect(echo.permissions).toEqual(miro.permissions)
    expect(miro.metered).toBe(false)
    expect(echo.metered).toBe(true)
    expect(echo.generation).toEqual({ maxOutputTokens: POLICY.chatTier.echo.maxOutputTokens, contextScale: POLICY.chatTier.echo.contextScale, auxiliary: 'always', replyLength: 'long' })
    expect(miro.generation).toEqual({ maxOutputTokens: POLICY.chatTier.miro.maxOutputTokens, contextScale: 1, auxiliary: 'planned', replyLength: 'scene' })
  })
  it('messenger and calls keep channel length even on ECHO; continuity turns are minimal and unmetered', () => {
    expect(resolveTurnPolicy({ experience: 'reality', tier: 'echo', channel: 'messenger', agencyMode: 'off', agencyReady: false }).generation.replyLength).toBe('scene')
    expect(resolveTurnPolicy({ experience: 'reality', tier: 'echo', channel: 'voice_call', agencyMode: 'off', agencyReady: false }).generation.replyLength).toBe('scene')
    const c = resolveTurnPolicy({ experience: 'reality', tier: 'echo', channel: 'scene', agencyMode: 'off', agencyReady: false, continuity: true })
    expect(c.metered).toBe(false)
    expect(c.generation.maxOutputTokens).toBeLessThan(POLICY.chatTier.miro.maxOutputTokens)
  })
  it('uses the agency engine only for a reality session whose cohort is live and whose revision is ready', () => {
    const on = { experience: 'reality' as const, tier: 'miro' as const, channel: 'scene' as const }
    expect(resolveTurnPolicy({ ...on, agencyMode: 'live', agencyReady: true }).engine).toBe('agency')
    expect(resolveTurnPolicy({ ...on, agencyMode: 'live', agencyReady: false }).engine).toBe('legacy')   // 준비 전 보류
    expect(resolveTurnPolicy({ ...on, agencyMode: 'shadow', agencyReady: true }).engine).toBe('legacy')
    expect(resolveTurnPolicy({ ...on, agencyMode: 'off', agencyReady: true }).engine).toBe('legacy')
    expect(resolveTurnPolicy({ ...on, experience: 'chat', agencyMode: 'live', agencyReady: true }).engine).toBe('legacy')
  })
  it('names the path in origin so ai_usage rows can be grouped by it', () => {
    expect(resolveTurnPolicy({ experience: 'reality', tier: 'echo', channel: 'scene', agencyMode: 'live', agencyReady: true }).origin).toBe('turn:agency:reality:echo:scene')
    expect(resolveTurnPolicy({ experience: 'chat', tier: 'miro', channel: 'background', agencyMode: 'off', agencyReady: false }).origin).toBe('reality:legacy:chat:miro:background')
  })
  it('the default policy for callers without one matches the old loose options', () => {
    const p = policyForSnapshot(snapshot({ mode: 'voice_call' }), { replyLength: 'long' })
    expect(p.channel).toBe('voice_call')
    expect(p.tier).toBe('miro')
    expect(p.generation.maxOutputTokens).toBe(POLICY.chatTier.miro.maxOutputTokens)
    expect(p.generation.replyLength).toBe('long')
    expect(p.memory).toBe('inline')
  })
  it('runTurn follows the policy it is given and reports it back', async () => {
    const seen: Array<number | undefined> = []
    const llm = new AIOrchestrator({ chain: [new MockAIProvider((req: GenerationRequest) => { if (req.task === 'dialogue') seen.push(req.maxTokens); return buildMockProposal(req.prompt, { characterName: '토마스' }) })] })
    const base = resolveTurnPolicy({ experience: 'chat', tier: 'echo', channel: 'scene', agencyMode: 'off', agencyReady: false })
    const policy = { ...base, generation: { ...base.generation, maxOutputTokens: 512 } }
    const r = await runTurn({ llm, snapshot: snapshot({ experienceType: 'chat' }), userInput: '안녕', policy, maxOutputTokens: 4096 })
    expect(seen).toEqual([512])   // 낱개 옵션(4096)이 아니라 정책이 이긴다
    expect(r.policy).toBe(policy)
    expect(r.transition.realityIntent).toBeNull()
    expect(r.transition.worldDelta).toBeNull()
  })
  it('a deferred memory policy makes no extraction call inside the turn', async () => {
    vi.stubEnv('MIRO_FEATURE_MEMORY_EXTRACTION', '1')
    const tasks: string[] = []
    const auxiliaryLLM = new AIOrchestrator({ chain: [new MockAIProvider((req: GenerationRequest) => { tasks.push(req.task); return req.task === 'semantic_event' ? { events: [] } : { memories: [] } })] })
    const llm = new AIOrchestrator({ chain: [new MockAIProvider((req: GenerationRequest) => buildMockProposal(req.prompt, { characterName: '토마스' }))] })
    const policy = resolveTurnPolicy({ experience: 'chat', tier: 'echo', channel: 'scene', agencyMode: 'off', agencyReady: false, memory: 'deferred' })
    await runTurn({ llm, snapshot: snapshot(), userInput: '기억해줘 나 커피 좋아해', auxiliaryLLM, policy })
    expect(tasks).not.toContain('memory_extraction')
  })
})
