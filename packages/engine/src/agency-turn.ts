import type { AgencyState, CompiledCharacter, StateTransitionRecord } from '@miro/domain'
import { applyRelationshipDelta, moodFromAffect, nextRelationshipStage } from '@miro/domain'
import type { LLMProvider } from '@miro/providers'
import { POLICY, productionRuntime } from '@miro/config'
import { buildContext, estimateTokens, type SimulationSnapshot } from './context'
import { SimulationProposal } from './proposal.schema'
import { validateProposal } from './validator'
import { requireSafeContent } from './safety'
import { buildAgencyDecisionDirective, planAgencyDecision, verifyAgencyRealization, type AgencyPlanningContext, type AgencyRealizationCheck } from './agency'
import { agencyProviderTrace } from './agency/provider'
import type { TurnResult } from './orchestrator'
import type { TurnPolicy } from './policy'
import { approveTransition } from './transition'

export type AgencyTurnInput = {
  mode: 'shadow' | 'live'
  compiled: CompiledCharacter
  state: AgencyState
  context: AgencyPlanningContext
}

/** 표현 검증이 거부한 뒤 같은 요청 예산 안에서 다시 쓰는 횟수(§3.3). */
const REGENERATIONS = 1

/**
 * 자율성 경로(§3.3): 계획 → 상태 전이 승인 → (승인된 결정·세계 사실을 넣은) 맥락 → 대사 → 출력 검열 + 승인 범위 검증 → 결과.
 * 승인되지 않은 세계 변경은 제안에서 걷어 내고 원장에 거부로 남긴다. 텍스트가 승인 밖 완료(도착·발송)를 말하면 한 번 다시 쓴다.
 * 기존 사건 템플릿은 검증된 선택을 덮지 못한다 — 별도 경로인 이유는 그대로다.
 */
export async function runAgencyTurn(opts: {
  llm: LLMProvider; snapshot: SimulationSnapshot; userInput: string; agency: AgencyTurnInput; policy: TurnPolicy
  maxOutputTokens?: number; contextScale?: number
}): Promise<TurnResult> {
  const { llm, agency, snapshot, policy } = opts
  const actor = snapshot.character.id
  await requireSafeContent(llm, { phase: 'input', character: snapshot.character, input: opts.userInput })
  const plan = await planAgencyDecision(llm, agency.compiled, agency.state, { ...agency.context, input: opts.userInput })
  if (productionRuntime() && plan.providerMode !== 'live') throw new Error('agency_planner_not_live')

  // ── 승인 (표현 전) ──────────────────────────────────────────────────────────────────────────────
  // 관계·기분·단계는 한 appraisal 에서 파생된다(§3.2). 규칙 경로의 의미 사건은 여기 없다 — 같은 사건을 두 번 반영하지 않는다.
  const projected = applyRelationshipDelta(snapshot.relationship, plan.relationshipDelta)
  const stage = nextRelationshipStage(snapshot.relationship.stage, projected, [], snapshot.turnCount + 1)
  projected.stage = stage
  const mood = moodFromAffect(plan.state.affect, projected)
  const move = plan.decision.action === 'move' ? plan.decision.candidate.destination ?? null : null
  const held: StateTransitionRecord[] = move ? [{ field: 'world.currentLocation', before: snapshot.world.currentLocation, after: move, rule: 'move_intent_held', status: 'held', clock: 'narrative', actor, decisionId: plan.decision.id }] : []

  // ── 맥락 (§4 우선순위: 경계·설정 → 입력·승인된 결정 → 현재 장소/사건·목표 → 최근 대화 → 출처 있는 기억 → 보조) ──
  const evidence = new Set(plan.context.evidence.map(e => e.id))
  const evidenceMessages = snapshot.recentMessages.filter(m => m.id && evidence.has(m.id)).map(m => {
    const proof = plan.context.evidence.find(e => e.id === m.id)!
    return { ...m, content: proof.quote, blocks: undefined }
  })
  // 출처(원문 메시지)가 남아 있는 기억만 기억으로 싣는다. 나머지는 불확실한 과거 기록으로 따로 — 관측 사실로 승격하지 않는다.
  const sourced = snapshot.memories.filter(m => m.sourceMessageId)
  let uncertain = snapshot.memories.filter(m => !m.sourceMessageId).map(m => m.content)
  const build = (recent: typeof evidenceMessages, memories: typeof sourced, unsure: string[]) => {
    const context = buildContext({ ...snapshot, relationship: projected, characterState: { ...(snapshot.characterState ?? { stress: 20, energy: 70, currentGoals: [], currentThoughts: [], firedRules: [] }), mood },
      semanticEvents: [], memories, recentMessages: recent, activeNpcs: [], userInput: opts.userInput,
    }, opts.contextScale, false, policy.generation.replyLength)
    context.system += buildAgencyDecisionDirective(plan.decision)
    context.system += `\n## 승인된 세계 상태(데이터)\n${JSON.stringify({ location: snapshot.world.currentLocation, time: snapshot.world.currentTime, status: snapshot.world.worldStatus,
      moveIntent: move, rule: move ? '이동을 시작하거나 준비하는 것은 쓸 수 있지만, 도착했거나 장소가 바뀌었다고 쓰지 않는다.' : '장소는 바뀌지 않는다. 새 장소·도착·사건 완료를 서술하지 않는다.' })}\n`
    context.prompt += `\n## 검증된 근거와 캐릭터 상태 (데이터)\n${JSON.stringify({ evidence: plan.context.evidence.filter(e => recent.some(m => m.id === e.id) || e.kind !== 'message'),
      beliefs: plan.state.beliefs.filter(b => b.status === 'active' && b.evidenceIds.every(id => evidence.has(id))),
      goals: plan.state.goals.filter(g => g.status === 'active'), affect: plan.state.affect, expression: plan.state.expression })}`
    if (unsure.length) context.prompt += `\n## 불확실한 과거 기록 (출처 없음 — 사실로 단정하지 말 것)\n${unsure.map(u => `- ${u}`).join('\n')}`
    return context
  }
  // 결정·근거를 붙인 뒤의 전체 프롬프트까지 예산을 다시 본다(§4). 넘치면 불확실한 기록 → 오래된 근거 순으로 뺀다.
  let recent = evidenceMessages
  let context = build(recent, sourced, uncertain)
  for (let guard = 0; guard < 8 && estimateTokens(context.system + context.prompt) > POLICY.context.maxTokens; guard++) {
    if (uncertain.length) uncertain = []
    else if (recent.length > 2) recent = recent.slice(Math.ceil(recent.length / 2))
    else break
    context = build(recent, sourced, uncertain)
  }

  // ── 대사 → 검열 → 승인 범위 검증 (거부되면 한 번 다시) ────────────────────────────────────────────
  const records: StateTransitionRecord[] = [...held]
  let verification: AgencyRealizationCheck | null = null
  let transition: ReturnType<typeof validateProposal> | null = null
  let renderer = agencyProviderTrace(llm, 'agency-dialogue:v4')
  let feedback = ''
  for (let attempt = 0; attempt <= REGENERATIONS; attempt++) {
    const proposal = await llm.generateStructured({ schema: SimulationProposal, task: 'dialogue',
      promptVersion: 'agency-dialogue:v4', system: context.system,
      prompt: `${context.prompt}${feedback}\n\n사용자 입력: ${opts.userInput}`, maxTokens: opts.maxOutputTokens })
    // A later primary moderation/check call must not erase a fallback renderer's provenance.
    renderer = agencyProviderTrace(llm, 'agency-dialogue:v4')
    if (productionRuntime() && renderer.providerMode !== 'live') throw new Error('agency_renderer_not_live')
    await requireSafeContent(llm, { phase: 'output', proposal })
    // 승인 범위 밖의 변경은 걷어 낸다(거부로 기록). 렌더러는 말과 장면의 공기만 바꿀 수 있다 — 장소·새 사건·NPC·선연락은 결정이 아니다.
    const rejected: string[] = []
    if (proposal.worldDelta?.currentLocation) { rejected.push('worldDelta.currentLocation'); proposal.worldDelta = { ...proposal.worldDelta, currentLocation: undefined } }
    if (proposal.worldDelta && !proposal.worldDelta.currentTime && !proposal.worldDelta.worldStatus) proposal.worldDelta = null
    if (proposal.sceneDelta?.location) { rejected.push('sceneDelta.location'); proposal.sceneDelta = { ...proposal.sceneDelta, location: undefined } }
    if (proposal.eventCandidates.length) { rejected.push('eventCandidates'); proposal.eventCandidates = [] }
    if (proposal.npcIntroductions.length) { rejected.push('npcIntroductions'); proposal.npcIntroductions = [] }
    if (proposal.npcActions.length) { rejected.push('npcActions'); proposal.npcActions = [] }
    if (proposal.realityIntent) { rejected.push('realityIntent'); proposal.realityIntent = null }
    const spoken = proposal.rp.blocks.filter(b => b.type !== 'npc' && b.type !== 'world')
    if (spoken.length !== proposal.rp.blocks.length) { rejected.push('rp.blocks'); proposal.rp.blocks = spoken }
    for (const field of rejected) records.push({ field, rule: 'unapproved_mutation', status: 'rejected', clock: 'narrative', actor, decisionId: plan.decision.id })

    const validated = validateProposal(proposal, snapshot)
    validated.relationshipDelta = { ...plan.relationshipDelta, ...(stage !== snapshot.relationship.stage ? { stage } : {}) }
    validated.memories = [] // Beliefs/goals carry exact evidence, not unsourced model memories.
    verification = await verifyAgencyRealization(llm, { decision: plan.decision, context: plan.context, state: plan.state, blocks: validated.blocks })
    if (productionRuntime() && verification.providerMode !== 'live') throw new Error('agency_verifier_not_live')
    if (verification.ok && validated.blocks.length) { transition = validated; break }
    // Issue reasons are fixed codes (never text), so the turn log can say which check rejected the reply.
    const reasons = [...new Set(verification.issues.map(i => i.reason))]
    if (attempt === REGENERATIONS) throw new Error(['agency_realization_rejected', ...reasons].join(' '))
    feedback = `\n\n## 이전 응답이 거부된 이유(코드): ${reasons.join(', ')}\n승인된 선택과 세계 상태 안에서만 다시 쓰세요. 완료되지 않은 행동·도착·발송을 사실처럼 쓰지 마세요.`
  }
  const approved = approveTransition(transition!, snapshot, policy, { relationshipOwner: 'appraisal', decisionId: plan.decision.id })
  records.push(...approved.records)
  if (plan.transition.affectDelta) records.push({ field: 'agency.affect', before: agency.state.affect, after: plan.state.affect, rule: 'affect_appraisal', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })
  if (mood !== (snapshot.characterState?.mood ?? 'neutral')) records.push({ field: 'character.mood', before: snapshot.characterState?.mood ?? 'neutral', after: mood, rule: 'mood_derived', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })
  for (const change of plan.transition.goals ?? []) records.push({ field: `agency.goal.${change.kind === 'add' ? change.goal.id : change.goalId}`, after: change.kind, rule: 'goal_change', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })

  const characterState = { mood, stress: plan.state.affect.stress, energy: plan.state.affect.energy,
    currentGoals: plan.state.goals.filter(g => g.status === 'active').map(g => g.description),
    currentThoughts: [], firedRules: snapshot.characterState?.firedRules ?? [] }
  const stages = [plan.providerMode, renderer.providerMode, verification!.providerMode]
  const providerMode = stages.includes('fallback') ? 'fallback' : stages.includes('mock') ? 'mock' : 'live'
  return { transition: approved.transition, context, providerMode, semanticEvents: [], characterState, firedRules: [],
    agency: { plan, verification: verification! }, policy, records }
}
