import type { AgencyState, CompiledCharacter, StateTransitionRecord } from '@miro/domain'
import { applyRelationshipDelta, momentHint, moodFromAffect, nextRelationshipStage } from '@miro/domain'
import { AIContentBlockedError, type LLMProvider } from '@miro/providers'
import { POLICY, productionRuntime } from '@miro/config'
import { buildContext, estimateTokens, type SimulationSnapshot } from './context'
import { SimulationProposal } from './proposal.schema'
import { validateProposal } from './validator'
import { UnsafeContentError } from './safety'
import { buildAgencyDecisionDirective, planAgencyDecision, verifyAgencyRealization, type AgencyPlanningContext, type AgencyRealizationCheck, type AgencyRealizationInput } from './agency'
import { agencyProviderTrace } from './agency/provider'
import type { TurnResult } from './orchestrator'
import type { TurnPolicy } from './policy'
import { approveTransition } from './transition'
import { blockStream, type TurnStream } from './stream-blocks'

export type AgencyTurnInput = {
  mode: 'shadow' | 'live'
  compiled: CompiledCharacter
  state: AgencyState
  context: AgencyPlanningContext
}

/** 표현 검증이 거부한 뒤 같은 요청 예산 안에서 다시 쓰는 횟수(§3.3). */
// 2: 거부 사유와 문제 문장을 받은 다시 쓰기를 한 번 더(10/3 실측: 막연한 사유만 받고 같은 완료 주장을 되풀이해 '멈춰요' 턴이 실패).
const REGENERATIONS = 2

/** 판단이 필요한 말 — 약속·부탁·제안·감정·관계·사과·비밀. 이런 말이 있으면 일상 턴이 아니다. */
const NEEDS_PLAN = /약속|연락|부탁|취소|미안|사과|사랑|좋아해|좋아하|헤어|싫어|화나|화났|짜증|서운|섭섭|비밀|거짓|같이|만나|갈래|올래|줄래|해줘|해 줘|할래|될까|돼\?|가자|기억|잊|결혼|사귀|고백|울|죽|아파|힘들|외로|보고 ?싶/

/**
 * 일상 턴인가(10/9 속도) — 짧고, 판단할 거리(약속·감정·관계·일정)가 없고, 곧 해야 할 약속도 없는 말. 그런 턴은 계획 모델을 부르지 않는다.
 * 세 턴에 한 번과 대화 첫 두 턴은 늘 계획한다 — 그 사이에도 관계·기분이 이번 대화를 따라 움직이게.
 * ponytail: 낱말 목록이라 놓치는 말이 있다 — 놓치면 그 턴은 감정 평가 없이 평소처럼만 대답한다. 잦으면 싼 모델 분류로 바꾼다.
 */
export function routineTurn(input: string, turnCount: number, state: AgencyState, now: Date): boolean {
  const text = input.trim()
  if (!text || text.length > 40 || turnCount < 2 || (turnCount + 1) % 3 === 0) return false
  if (momentHint(text) || NEEDS_PLAN.test(text)) return false
  return !state.goals.some(goal => goal.status === 'active' && goal.dueAt && Date.parse(goal.dueAt) - now.getTime() < 2 * 3_600_000)
}

/**
 * 자율성 경로(§3.3): 계획 → 상태 전이 승인 → (승인된 결정·세계 사실을 넣은) 맥락 → 대사 → 승인 범위 검증 → 결과.
 * 승인되지 않은 세계 변경은 제안에서 걷어 내고 원장에 거부로 남긴다. 텍스트가 승인 밖 완료(도착·발송)를 말하면 한 번 다시 쓴다.
 * 기존 사건 템플릿은 검증된 선택을 덮지 못한다 — 별도 경로인 이유는 그대로다.
 */
export async function runAgencyTurn(opts: {
  llm: LLMProvider; snapshot: SimulationSnapshot; userInput: string; agency: AgencyTurnInput; policy: TurnPolicy
  maxOutputTokens?: number; contextScale?: number; stream?: TurnStream
}): Promise<TurnResult> {
  const { llm, agency, snapshot, policy } = opts
  const actor = snapshot.character.id
  const routine = routineTurn(opts.userInput, snapshot.turnCount, agency.state, new Date(agency.context.clock.now))
  const plan = await planAgencyDecision(llm, agency.compiled, agency.state, { ...agency.context, input: opts.userInput }, { routine })
  if (productionRuntime() && plan.providerMode !== 'live') throw new Error('agency_planner_not_live')

  // ── 승인 (표현 전) ──────────────────────────────────────────────────────────────────────────────
  // 관계·기분·단계는 한 appraisal 에서 파생된다(§3.2). 규칙 경로의 의미 사건은 여기 없다 — 같은 사건을 두 번 반영하지 않는다.
  const projected = applyRelationshipDelta(snapshot.relationship, plan.relationshipDelta)
  // 이 경로에는 의미 사건이 없다 — '친구가 되는 계기' 는 관찰할 수 없으니 빼고 문턱만 본다(빼지 않으면 친구가 될 수 없다).
  const table = snapshot.character.personality.relationshipProfile
  const stage = nextRelationshipStage(snapshot.relationship.stage, projected, [], snapshot.turnCount + 1, table && { ...table, turningPoint: undefined })
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
      // 사건·NPC 는 결정이 아니면 바뀌지 않는다 — 렌더러가 '마무리' 를 제안하지 않게 아예 싣지 않는다(§3.3).
      semanticEvents: [], memories, recentMessages: recent, activeNpcs: [], activeEvents: [], recentlyResolvedEvents: [], userInput: opts.userInput,
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

  // ── 대사 → 승인 범위 검증 (거부되면 한 번 다시) ──────────────────────────────────────────────────
  const records: StateTransitionRecord[] = [...held]
  // 이 턴에 약속이 생기거나 취소되면 말과 약속이 맞는지 의미 검토를 한다(realizationRisk).
  const commitmentChanges = (plan.transition.goals ?? []).filter(change => change.kind === 'add' ? change.goal.status === 'active' : ['cancel', 'abandon', 'suspend'].includes(change.kind)).length
  let verification: AgencyRealizationCheck | null = null
  let review: AgencyRealizationInput | undefined
  let transition: ReturnType<typeof validateProposal> | null = null
  let renderer = agencyProviderTrace(llm, 'agency-dialogue:v4')
  let feedback = ''
  // 다시 쓰기마다 앞에서 보여 준 블록은 지운다(같은 통로 하나 — 새 호출의 첫 시도가 reset 을 보낸다).
  const streaming = opts.stream ? blockStream(snapshot, opts.stream, { dropWorld: true }) : {}
  for (let attempt = 0; attempt <= REGENERATIONS; attempt++) {
    // 공급자 필터는 높은 위험만(relaxed) — 같은 입력이 기존 경로에선 통과하는데 이 경로의 근거·상태 자료 때문에 대사가 막혔다(9/29 실측 3건).
    // 그래도 막히면 기존 경로처럼 안전 거부로 돌려준다 — 이름 없는 생성 실패('other')로 숨기지 않는다.
    const proposal = await llm.generateStructured({ schema: SimulationProposal, task: 'dialogue',
      promptVersion: 'agency-dialogue:v4', system: context.system, safety: 'relaxed',
      prompt: `${context.prompt}${feedback}\n\n사용자 입력: ${opts.userInput}`, maxTokens: opts.maxOutputTokens, ...streaming })
      .catch((e: unknown) => { throw e instanceof AIContentBlockedError ? new UnsafeContentError() : e })
    // A later check call must not erase the renderer's provenance.
    renderer = agencyProviderTrace(llm, 'agency-dialogue:v4')
    if (productionRuntime() && renderer.providerMode !== 'live') throw new Error('agency_renderer_not_live')
    // 승인 범위 밖의 변경은 걷어 낸다(거부로 기록). 렌더러는 말과 장면의 공기만 바꿀 수 있다 — 장소·새 사건·NPC·선연락은 결정이 아니다.
    const rejected: string[] = []
    if (proposal.worldDelta?.currentLocation) { rejected.push('worldDelta.currentLocation'); proposal.worldDelta = { ...proposal.worldDelta, currentLocation: undefined } }
    if (proposal.worldDelta && !proposal.worldDelta.currentTime && !proposal.worldDelta.worldStatus) proposal.worldDelta = null
    if (proposal.sceneDelta?.location) { rejected.push('sceneDelta.location'); proposal.sceneDelta = { ...proposal.sceneDelta, location: undefined } }
    if (proposal.eventCandidates.length) { rejected.push('eventCandidates'); proposal.eventCandidates = [] }
    if (proposal.eventUpdates.length) { rejected.push('eventUpdates'); proposal.eventUpdates = [] }
    if (proposal.npcIntroductions.length) { rejected.push('npcIntroductions'); proposal.npcIntroductions = [] }
    if (proposal.npcActions.length) { rejected.push('npcActions'); proposal.npcActions = [] }
    if (proposal.realityIntent) { rejected.push('realityIntent'); proposal.realityIntent = null }
    const spoken = proposal.rp.blocks.filter(b => b.type !== 'npc' && b.type !== 'world')
    if (spoken.length !== proposal.rp.blocks.length) { rejected.push('rp.blocks'); proposal.rp.blocks = spoken }
    // 원장에는 채택된 시도의 거부만 남긴다 — 버려진 첫 시도의 제안은 승인 대상이 아니었다.
    const attemptRecords: StateTransitionRecord[] = rejected.map(field => ({ field, rule: 'unapproved_mutation', status: 'rejected', clock: 'narrative', actor, decisionId: plan.decision.id }))

    const validated = validateProposal(proposal, snapshot)
    validated.relationshipDelta = { ...plan.relationshipDelta, ...(stage !== snapshot.relationship.stage ? { stage } : {}) }
    validated.memories = [] // Beliefs/goals carry exact evidence, not unsourced model memories.
    // 의미 검토(모델 호출)는 응답 뒤로 — 여기서는 규칙 검사만 해 답을 먼저 보낸다(10/9 속도: 검토·다시 쓰기가 턴을 20~44초로 늘렸다).
    // 검토할 거리가 있었으면 그 입력을 돌려줘 호출한 쪽이 응답 뒤에 검토하고 기록한다.
    const realization: AgencyRealizationInput = { decision: plan.decision, context: plan.context, state: plan.state, blocks: validated.blocks, commitmentChanges, strippedMutations: rejected.length }
    verification = await verifyAgencyRealization(llm, realization, { review: false })
    if (productionRuntime() && verification.providerMode !== 'live') throw new Error('agency_verifier_not_live')
    if (verification.ok && validated.blocks.length) { transition = validated; records.push(...attemptRecords); if (verification.deferredReview) review = realization; break }
    // Issue reasons are fixed codes (never text), so the turn log can say which check rejected the reply.
    const reasons = [...new Set(verification.issues.map(i => i.reason))]
    if (attempt === REGENERATIONS) throw new Error(['agency_realization_rejected', ...reasons].join(' '))
    // 문제가 된 문장을 그대로 보여 준다 — 사유 코드만 주면 렌더러가 무엇을 고칠지 몰라 같은 말을 되풀이했다.
    const quotes = [...new Set(verification.issues.flatMap(issue => {
      const claim = /^claims\.(\d+)$/.exec(issue.field), block = /^blocks\.(\d+)$/.exec(issue.field)
      return claim ? [verification!.claims[Number(claim[1])]?.quote] : block ? [validated.blocks[Number(block[1])]?.text.slice(0, 120)] : []
    }).filter((q): q is string => !!q))].slice(0, 4)
    feedback = `\n\n## 이전 응답이 거부된 이유(코드): ${reasons.join(', ')}\n${quotes.length ? `문제가 된 문장: ${quotes.map(q => `"${q}"`).join(' / ')}\n` : ''}승인된 선택과 세계 상태 안에서만 다시 쓰세요. 완료되지 않은 행동·확인·도착·발송을 이미 한 일처럼 쓰지 말고, 아직 하지 않은 일은 '할게요·하려고 해요'처럼 앞으로의 일로 쓰세요.`
  }
  const approved = approveTransition(transition!, snapshot, policy, { relationshipOwner: 'appraisal', decisionId: plan.decision.id })
  records.push(...approved.records)
  if (plan.transition.affectDelta) records.push({ field: 'agency.affect', before: agency.state.affect, after: plan.state.affect, rule: 'affect_appraisal', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })
  if (mood !== (snapshot.characterState?.mood ?? 'neutral')) records.push({ field: 'character.mood', before: snapshot.characterState?.mood ?? 'neutral', after: mood, rule: 'mood_derived', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })
  for (const change of plan.transition.goals ?? []) records.push({ field: `agency.goal.${change.kind === 'add' ? change.goal.id : change.goalId}`, after: change.kind, rule: 'goal_change', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })

  const characterState = { mood, stress: plan.state.affect.stress, energy: plan.state.affect.energy,
    currentGoals: plan.state.goals.filter(g => g.status === 'active').map(g => g.description),
    currentThoughts: [], firedRules: snapshot.characterState?.firedRules ?? [] }
  const providerMode = [plan.providerMode, renderer.providerMode, verification!.providerMode].includes('mock') ? 'mock' : 'live'
  return { transition: approved.transition, context, providerMode, semanticEvents: [], characterState, firedRules: [],
    agency: { plan, verification: verification!, ...(review ? { review } : {}) }, policy, records }
}
