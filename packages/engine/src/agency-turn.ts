import type { AgencyState, CompiledCharacter, StateTransitionRecord } from '@miro/domain'
import { addDelta, applyRelationshipDelta, bondingCurveOf, companionshipDelta, contactBoundaryDirective, detectSemanticEvents, momentHint, moodFromAffect, nextRelationshipStage, requestedContactBoundary, storyCalendarDirective } from '@miro/domain'
import { AIBudgetDeniedError, AIContentBlockedError, type LLMProvider } from '@miro/providers'
import { POLICY, feature, productionRuntime } from '@miro/config'
import { buildContext, estimateTokens, type SimulationSnapshot } from './context'
import { SimulationProposal } from './proposal.schema'
import { validateProposal } from './validator'
import { UnsafeContentError } from './safety'
import { buildAgencyDecisionDirective, planAgencyDecision, verifyAgencyRealization, needsCommunicationPreferenceReview, type AgencyPlanningContext, type AgencyRealizationCheck, type AgencyRealizationInput } from './agency'
import { agencyProviderTrace } from './agency/provider'
import type { TurnResult } from './orchestrator'
import type { TurnPolicy } from './policy'
import { approveTransition } from './transition'
import { blockStream, type TurnStream } from './stream-blocks'
import { agencyCommunicationPreferences } from './communication-preferences'
import { snapshotUserGrounding, USER_GROUNDING_RULE } from './conversation-grounding'
import { conversationVariationDirective, repeatedConversationBlock } from './conversation-repetition'

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
export function routineTurn(input: string, turnCount: number, state: AgencyState, now: Date, narrativeNow?: string): boolean {
  const text = input.trim()
  if (!text || text.length > 40 || turnCount < 2 || (turnCount + 1) % 3 === 0) return false
  if (momentHint(text) || NEEDS_PLAN.test(text)) return false
  if (requestedContactBoundary(text, now, 'UTC', 'classification')) return false
  return !state.goals.some(goal => {
    const clock = goal.clock === 'narrative' ? (narrativeNow ? Date.parse(narrativeNow) : null) : now.getTime()
    return goal.status === 'active' && goal.dueAt && clock !== null && Date.parse(goal.dueAt) - clock < 2 * 3_600_000
  })
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
  const scene = !snapshot.mode || snapshot.mode === 'chat'
  const calendarChanged = scene && snapshot.world.narrativeCalendar?.changedAtTurn === snapshot.turnCount
  const routine = !calendarChanged && routineTurn(opts.userInput, snapshot.turnCount, agency.state, new Date(agency.context.clock.now), agency.context.clock.narrativeNow)
  const calendar = scene ? storyCalendarDirective(snapshot.world.narrativeCalendar, snapshot.turnCount) : ''
  const plan = await planAgencyDecision(llm, agency.compiled, agency.state, { ...agency.context,
    input: calendar ? `${opts.userInput}\n\n[Server-confirmed scene calendar]\n${calendar}` : opts.userInput }, { routine })
  if (productionRuntime() && plan.providerMode !== 'live') throw new Error('agency_planner_not_live')
  const communicationPreferences = agencyCommunicationPreferences(plan.context, plan.state.beliefs, snapshot.memories)
  const communicationPreference = needsCommunicationPreferenceReview(opts.userInput, snapshot.recentMessages, communicationPreferences)

  // ── 승인 (표현 전) ──────────────────────────────────────────────────────────────────────────────
  // 사건에 대한 수치 변화는 계획(평가)이 정하고, 함께 보낸 시간만큼의 성장은 성격의 곡선이 더한다(10/16 — 빠져 있어 새 방의 관계가 멈춰 있었다).
  const table = snapshot.character.personality.relationshipProfile
  const semanticEvents = detectSemanticEvents(opts.userInput)
  const relationshipDelta = addDelta(plan.relationshipDelta, companionshipDelta({
    curve: snapshot.character.personality.bonding ?? bondingCurveOf(snapshot.character.personality), relationship: snapshot.relationship,
    events: semanticEvents, turn: snapshot.turnCount + 1, userInput: opts.userInput, profile: table }))
  const projected = applyRelationshipDelta(snapshot.relationship, relationshipDelta)
  const stage = nextRelationshipStage(snapshot.relationship.stage, projected, semanticEvents, snapshot.turnCount + 1, table)
  projected.stage = stage
  const mood = moodFromAffect(plan.state.affect, projected)
  const move = plan.decision.action === 'move' ? plan.decision.candidate.destination ?? null : null
  const held: StateTransitionRecord[] = move ? [{ field: 'world.currentLocation', before: snapshot.world.currentLocation, after: move, rule: 'move_intent_held', status: 'held', clock: 'narrative', actor, decisionId: plan.decision.id }] : []

  // ── 맥락 (§4 우선순위: 경계·설정 → 입력·승인된 결정 → 현재 장소/사건·목표 → 최근 대화 → 출처 있는 기억 → 보조) ──
  const evidence = new Set(plan.context.evidence.map(e => e.id))
  const evidenceMessages = snapshot.recentMessages.filter(m => m.id && evidence.has(m.id)).map(m => {
    const proof = plan.context.evidence.find(e => e.id === m.id)!
    // Keep the character's own earlier gestures/inner voice for scene continuity, separately
    // labelled by buildContext. They are not message evidence or facts known to the user.
    const ownBlocks = m.role === 'character' && m.kind !== 'reality_message' ? m.blocks?.filter(b =>
      b.type === 'dialogue' && (!b.speaker || b.speaker === snapshot.character.identity.name)
      || ['action', 'thought'].includes(b.type) && b.speaker === snapshot.character.identity.name) : undefined
    return { ...m, content: proof.quote, blocks: ownBlocks?.length ? ownBlocks : undefined }
  })
  // 출처(원문 메시지)가 남아 있는 기억만 기억으로 싣는다. 나머지는 불확실한 과거 기록으로 따로 — 관측 사실로 승격하지 않는다.
  const sourced = snapshot.memories.filter(m => m.sourceMessageId)
  let uncertain = snapshot.memories.filter(m => !m.sourceMessageId).map(m => m.content)
  const build = (recent: typeof evidenceMessages, memories: typeof sourced, unsure: string[]) => {
    const context = buildContext({ ...snapshot, relationship: projected, characterState: { ...(snapshot.characterState ?? { stress: 20, energy: 70, currentGoals: [], currentThoughts: [], firedRules: [] }), mood },
      // 사건·NPC 는 결정이 아니면 바뀌지 않는다 — 렌더러가 '마무리' 를 제안하지 않게 아예 싣지 않는다(§3.3).
      semanticEvents: [], memories, recentMessages: recent, activeNpcs: [], activeEvents: [], recentlyResolvedEvents: [], userInput: opts.userInput, communicationPreferences,
    }, opts.contextScale, false, policy.generation.replyLength)
    context.system += buildAgencyDecisionDirective(plan.decision)
    context.system += '\n' + USER_GROUNDING_RULE
    context.system += conversationVariationDirective(snapshot.recentMessages, snapshot.character.identity.name)
    context.system += '\n' + contactBoundaryDirective(snapshot.contactBoundary, new Date(agency.context.clock.now))
    context.system += '\n장면의 연속성: 최근 자기 행동과 소품 상태를 이어 갑니다. 이미 끈 담배를 다시 끄거나, 놓아 둔 잔을 다시 준비하는 식으로 장면을 초기화하지 않습니다. 새 반응에 필요하지 않은 같은 몸짓·돌봄 제안은 반복하지 않습니다. 과거 속마음은 소리 내어 한 말이 아니며, 내레이터나 다른 인물의 비공개 사실은 자기 지식으로 쓰지 않습니다.'
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
  let renderer = agencyProviderTrace(llm, 'agency-dialogue:v6')
  let feedback = ''
  // 검토할 것이 없는 턴은 초안을 만드는 대로 보낸다 — 대사 전체를 기다리던 몇 초가 첫 글자까지의 시간이었다(10/17 사용자: 너무 느리다).
  // 검토가 있는 턴은 거부된 초안이 잠깐이라도 보이지 않게 그대로 모아 둔다. 다시 쓰게 되면 보여 준 블록은 지운다.
  const draftStream = opts.stream && !communicationPreference && !feature('strictConversationReview') ? blockStream(snapshot, opts.stream, { dropWorld: true }) : undefined
  // A generated factual claim cannot be classified until its text exists. Buffer every draft;
  // the UI still types the approved blocks, but a rejected history/action never flashes first.
  // 다시 쓴 뒤에 턴 한도가 다 차면 사용자의 입력 길이 문제가 아니다 — 거부된 생성으로 돌려 '입력을 줄이라'는 안내가 나가지 않게 한다(10/16 운영 실측).
  try {
    for (let attempt = 0; attempt <= REGENERATIONS; attempt++) {
      // 공급자 필터는 높은 위험만(relaxed) — 같은 입력이 기존 경로에선 통과하는데 이 경로의 근거·상태 자료 때문에 대사가 막혔다(9/29 실측 3건).
      // 그래도 막히면 기존 경로처럼 안전 거부로 돌려준다 — 이름 없는 생성 실패('other')로 숨기지 않는다.
      const proposal = await llm.generateStructured({ schema: SimulationProposal, task: 'dialogue',
        promptVersion: 'agency-dialogue:v6', system: context.system, safety: 'relaxed',
        prompt: `${context.prompt}${feedback}\n\n사용자 입력: ${opts.userInput}`, maxTokens: opts.maxOutputTokens, ...draftStream })
        .catch((e: unknown) => { throw e instanceof AIContentBlockedError ? new UnsafeContentError() : e })
      // A later check call must not erase the renderer's provenance.
      renderer = agencyProviderTrace(llm, 'agency-dialogue:v6')
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
      const repeated = repeatedConversationBlock(validated.blocks, snapshot.recentMessages, opts.userInput, snapshot.character.identity.name)
      if (repeated !== null) {
        if (attempt === REGENERATIONS) throw new Error('agency_realization_rejected repeated_response')
        feedback = `\n이전 대사와 반복되는 블록 ${repeated}을 다시 쓰세요. 같은 뜻의 빈말이나 같은 소품 동작으로 바꾸지 말고, 지금 사용자가 한 말에 답하며 장면을 한 걸음 이어가세요. 반복 문장(데이터): ${JSON.stringify(validated.blocks[repeated]?.text)}`
        continue
      }
      validated.relationshipDelta = { ...relationshipDelta, ...(stage !== snapshot.relationship.stage ? { stage } : {}) }
      validated.memories = [] // Beliefs/goals carry exact evidence, not unsourced model memories.
      // Check user facts and boundaries before delivery with a compact request. Return the broader
      // canon/action audit for background review, avoiding that entire context on the critical path.
      const realization: AgencyRealizationInput = { decision: plan.decision, context: plan.context, state: plan.state, blocks: validated.blocks, commitmentChanges, strippedMutations: rejected.length, communicationPreference,
        communicationPreferenceSourceIds: communicationPreferences.map(item => item.sourceId),
        userGroundingEvidence: snapshotUserGrounding(snapshot, opts.userInput) }
      verification = await verifyAgencyRealization(llm, realization, { review: false })
      if (productionRuntime() && verification.providerMode !== 'live') throw new Error('agency_verifier_not_live')
      if (verification.ok && validated.blocks.length) {
        transition = validated; records.push(...attemptRecords)
        // Inline source/preference checks already ran. Deferred canon/action review must not
        // charge for or reinterpret the same user check a second time.
        if (verification.deferredReview) review = { ...realization, communicationPreference: false, userGroundingEvidence: undefined }
        break
      }
      // Issue reasons are fixed codes (never text), so the turn log can say which check rejected the reply.
      const reasons = [...new Set(verification.issues.map(i => i.reason))]
      if (attempt === REGENERATIONS) throw new Error(['agency_realization_rejected', ...reasons].join(' '))
      // 문제가 된 문장을 그대로 보여 준다 — 사유 코드만 주면 렌더러가 무엇을 고칠지 몰라 같은 말을 되풀이했다.
      const quotes = [...new Set(verification.issues.flatMap(issue => {
        const claim = /^claims\.(\d+)$/.exec(issue.field), block = /^blocks\.(\d+)$/.exec(issue.field)
        return claim ? [verification!.claims[Number(claim[1])]?.quote] : block ? [validated.blocks[Number(block[1])]?.text.slice(0, 120)] : []
      }).filter((q): q is string => !!q))].slice(0, 4)
      feedback = `\n\n## 이전 응답이 거부된 이유(코드): ${reasons.join(', ')}\n${quotes.length ? `문제가 된 문장: ${quotes.map(q => `"${q}"`).join(' / ')}\n` : ''}승인된 선택과 세계 상태 안에서만 다시 쓰세요. ${USER_GROUNDING_RULE} 완료되지 않은 행동·확인·도착·발송을 이미 한 일처럼 쓰지 말고, 아직 하지 않은 일은 '할게요·하려고 해요'처럼 앞으로의 일로 쓰세요.${communicationPreference ? ' 사용자가 실제로 정정한 말투·호칭·응원 방식과 요청한 피드백을 존중하세요. 원하지 않은 과찬을 다른 과찬으로 바꾸지 말고, 자기 성격에 맞는 솔직하고 구체적인 반응을 쓰세요.' : ''}`
    }
  } catch (error) {
    if (feedback && error instanceof AIBudgetDeniedError && error.reason === 'turn_tokens') throw new Error('agency_realization_rejected turn_budget')
    throw error
  }
  const approved = approveTransition(transition!, snapshot, policy, { relationshipOwner: 'appraisal', decisionId: plan.decision.id })
  // A rejected preference-breaking draft must never flash in the user's chat.
  opts.stream?.onBlocks(approved.transition.blocks)
  records.push(...approved.records)
  if (plan.transition.affectDelta) records.push({ field: 'agency.affect', before: agency.state.affect, after: plan.state.affect, rule: 'affect_appraisal', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })
  if (mood !== (snapshot.characterState?.mood ?? 'neutral')) records.push({ field: 'character.mood', before: snapshot.characterState?.mood ?? 'neutral', after: mood, rule: 'mood_derived', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })
  for (const change of plan.transition.goals ?? []) records.push({ field: `agency.goal.${change.kind === 'add' ? change.goal.id : change.goalId}`, after: change.kind, rule: 'goal_change', status: 'applied', clock: 'real', actor, decisionId: plan.decision.id })

  const characterState = { mood, stress: plan.state.affect.stress, energy: plan.state.affect.energy,
    currentGoals: plan.state.goals.filter(g => g.status === 'active').map(g => g.description),
    currentThoughts: [], firedRules: snapshot.characterState?.firedRules ?? [] }
  const providerMode = [plan.providerMode, renderer.providerMode, verification!.providerMode].includes('mock') ? 'mock' : 'live'
  return { transition: approved.transition, context, providerMode, semanticEvents, characterState, firedRules: [],
    agency: { plan, verification: verification!, ...(review ? { review } : {}) }, policy, records }
}
