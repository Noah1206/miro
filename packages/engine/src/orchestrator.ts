import { feature } from '@miro/config'
import { AIBudgetDeniedError, AIContentBlockedError, type LLMProvider } from '@miro/providers'
import { analyzeMemory, analyzeSemantic, planTasks } from './task-router'
import {
  DEFAULT_CHARACTER_STATE, detectSemanticEvents, evaluateEventRules, mergeSemanticEvents, filterSalient, relationshipTurn,
} from '@miro/domain'
import type { CharacterState, MemoryCandidate, RelationshipDelta, SemanticEvent, StateTransitionRecord } from '@miro/domain'
import { SimulationProposal } from './proposal.schema'
import { UnsafeContentError } from './safety'
import { fallbackProposal } from './fallback'
import { buildContext, type BuiltContext, type ReplyStyle, type SimulationSnapshot } from './context'
import { validateProposal, type ValidatedTransition } from './validator'
import { runAgencyTurn, type AgencyTurnInput } from './agency-turn'
import { planAgencyDecision, verifyCommunicationPreferences, type AgencyPlan, type AgencyRealizationCheck, type AgencyRealizationInput } from './agency'
import { policyForSnapshot, type TurnPolicy } from './policy'
import { approveTransition } from './transition'
import { blockStream, type TurnStream } from './stream-blocks'
import { snapshotCommunicationPreferences, CommunicationPreferenceRejectedError } from './communication-preferences'
import { ConversationGroundingRejectedError, ConversationReviewContextBudgetError, needsUserGroundingReview, snapshotUserGrounding, USER_GROUNDING_RULE } from './conversation-grounding'
import { conversationVariationDirective, repeatedConversationBlock } from './conversation-repetition'

export type TurnResult = {
  /** review: 응답 뒤에 할 의미 검토의 입력(검토할 거리가 있던 턴만). */
  agency?: { plan: AgencyPlan; verification: AgencyRealizationCheck; review?: AgencyRealizationInput }
  agencyShadow?: { action: string; issueCount: number } | { error: true }
  transition: ValidatedTransition
  context: BuiltContext
  /** fallback: 모든 Provider 가 실패해 정해진 대사로 답했다. 사용자에게는 오류를 보이지 않는다. */
  providerMode: 'live' | 'mock' | 'fallback'
  fallbackReason?: string
  /** 이번 입력에서 코드가 분류한 사건. */
  semanticEvents: SemanticEvent[]
  /** 이번 턴 이후의 캐릭터 상태 (세션에 저장한다). */
  characterState: CharacterState
  /** 발동한 사건 규칙 id. */
  firedRules: string[]
  /** 이 턴을 결정한 정책. 호출자가 안 넘겼으면 스냅샷과 옵션에서 만든 기본값이다. */
  policy: TurnPolicy
  /** 승인·거부·보류된 상태 변경(원장 행). 커밋이 그대로 저장한다. */
  records: StateTransitionRecord[]
}

/**
 * 한 턴의 RP 처리 — State Update Pipeline.
 *
 *   사용자 입력 → 의미 이벤트(규칙 + AI 분류) → 관계 delta(규칙 + 함께한 시간, 성격의 곡선) → 캐릭터 상태(코드)
 *   → Context 조립 → 1회 Structured Generation → 검증 → 사건 규칙
 *
 * 관계 수치를 움직이는 것은 규칙이다. 모델이 제안한 관계 숫자는 반영하지 않는다.
 * DB 커밋은 여기서 하지 않는다 — 영속화는 호출자(웹 앱)의 트랜잭션 안에서 이뤄진다.
 */
export async function runTurn(opts: {
  llm: LLMProvider
  snapshot: SimulationSnapshot
  userInput: string
  now?: Date
  auxiliaryLLM?: LLMProvider
  maxOutputTokens?: number
  /** ECHO 는 맥락을 이 배수만큼 더 넣는다. 예산(POLICY.context.maxTokens)은 그대로 지킨다. */
  contextScale?: number
  /** 'always' 면 보조 분석(의미 이벤트·기억)을 규칙과 무관하게 매 턴 돌린다. */
  auxiliary?: 'planned' | 'always'
  /** 캐릭터챗 한 응답의 길이. ECHO 는 'long'. 자율성 엔진은 자기 형식을 쓴다. */
  replyLength?: ReplyStyle
  agency?: AgencyTurnInput
  /**
   * 실시간 음성 통화에서 캐릭터가 이미 소리로 한 말. 있으면 대사를 새로 만들지 않고 이 말을 이번 턴의 답으로 받는다 —
   * 입력·출력 검열, 관계·기억·사건 규칙은 채팅 턴과 똑같이 돈다. 통화에서 한 말도 기억에 남기기 위한 경로다.
   */
  spokenReply?: string
  /**
   * 서버가 확정한 턴 정책(§3.1). 있으면 위의 낱개 옵션 대신 이것이 생성 옵션·권한·경로를 정한다.
   * 없으면 낱개 옵션과 스냅샷에서 같은 뜻의 기본값을 만든다 — 등급을 넘기지 않는 호출(통화·Live Scene·음성)은 MIRO 한도다.
   */
  policy?: TurnPolicy
  /** 대사를 블록 단위로 받는 대로 보낼 곳(10/9). 없으면 끝에 한 번에. */
  stream?: TurnStream
}): Promise<TurnResult> {
  const policy = opts.policy ?? policyForSnapshot(opts.snapshot, { ...opts, agencyMode: opts.agency?.mode ?? 'off', agencyReady: opts.agency?.mode === 'live' })
  opts = { ...opts, ...policy.generation }
  if (policy.engine === 'agency') {
    if (opts.agency?.mode !== 'live') throw new Error('agency_runtime_missing')
    // Paid turns settle all memory work with the delivered answer, including the agency path.
    const memory = opts.auxiliaryLLM && policy.memory === 'inline' ? Promise.all(
      planTasks(opts.userInput, opts.snapshot.turnCount + 1, policy.generation.auxiliary)
        .filter((task): task is 'memory_extraction' | 'memory_summary' => task === 'memory_extraction' || task === 'memory_summary')
        .map(task => analyzeMemory(opts.auxiliaryLLM!, task, opts.userInput, opts.snapshot).then(r => filterSalient(r.memories), () => []))) : Promise.resolve([])
    try {
      const result = await runAgencyTurn({ ...opts, agency: opts.agency, policy })
      result.transition.memories = filterSalient([...result.transition.memories, ...(await memory).flat()])
      return result
    } catch (error) { await memory; throw error }

  }
  let agencyShadow: TurnResult['agencyShadow']
  if (opts.snapshot.experienceType !== 'chat' && opts.agency?.mode === 'shadow' && opts.llm.info.mode === 'mock') {
    // One-step comparison only. Never persist or realize a shadow choice in the live session.
    try {
      const plan = await planAgencyDecision(opts.llm, opts.agency.compiled, opts.agency.state, { ...opts.agency.context, input: opts.userInput })
      agencyShadow = { action: plan.decision.action, issueCount: plan.issues.length }
    } catch { agencyShadow = { error: true } }
  } else if (opts.agency?.mode === 'shadow') agencyShadow = { error: true }
  const { snapshot } = opts
  const now = opts.now ?? new Date()
  const personality = snapshot.character.personality
  // 캐릭터별 관계 성격표 — 같은 사건에도 캐릭터마다 다른 세기·단계·기분으로 받는다. 없으면 기본 규칙.
  const profile = personality.relationshipProfile ?? null

  // ECHO: 규칙이 요구하지 않아도 의미 분석과 기억 추출을 돌린다.
  // 어떤 기능이 켜져 있는지는 planTasks 가 판단한다 — 배포가 끈 작업을 여기서 되살리지 않는다.
  const tasks = planTasks(opts.userInput, snapshot.turnCount + 1, opts.auxiliary)
  let semanticEvents = detectSemanticEvents(opts.userInput)
  const extraMemories: MemoryCandidate[] = []

  const auxiliary = opts.auxiliaryLLM ?? null
  const semantic = auxiliary && tasks.includes('semantic_event')
    ? analyzeSemantic(auxiliary, opts.userInput, snapshot).then(r => r.events.filter(e => e.confidence >= .8), () => [])
    : Promise.resolve([])
  /**
   * 기억 추출·요약은 대사 프롬프트에 들어가지 않는다 — 커밋 때만 쓴다. 지금 띄우되 대사 생성이 끝난 뒤에 거둔다
   * (대사가 더 오래 걸리니 첫 답은 늦어지지 않는다).
   */
  // deferred(§3.5): 추출·요약은 커밋 뒤 작업(memory_jobs)이 맡는다. 응답 안에서는 부르지 않는다.
  const memoryTasks: Promise<MemoryCandidate[][]> = auxiliary && policy.memory === 'inline' ? Promise.all(
    tasks.filter(t => t === 'memory_extraction' || t === 'memory_summary')
      .map(task => analyzeMemory(auxiliary, task, opts.userInput, snapshot).then(r => filterSalient(r.memories), () => []))) : Promise.resolve([])
  // 관계가 이번 턴의 사건에 스스로 반응한다(domain/relationship/turn) — 단계·기분까지.
  const prevState = snapshot.characterState ?? DEFAULT_CHARACTER_STATE
  const turnFor = (events: SemanticEvent[]) => relationshipTurn({
    character: snapshot.character, relationship: snapshot.relationship, characterState: prevState,
    events, turn: snapshot.turnCount + 1, userInput: opts.userInput })
  // 대사는 의미 분석을 기다리지 않는다(10/5, 턴 약 1초 단축) — 프롬프트는 코드가 바로 찾은 사건으로 만들고,
  // 분석 결과는 대사와 동시에 받아 관계·기분·사건 규칙에만 반영한다.
  // ponytail: 분석만 잡아낸 사건은 이번 대사엔 안 보이고 다음 턴부터 보인다. 대사가 즉시 반응해야 하면 다시 기다리게 한다.
  const early = turnFor(semanticEvents)
  const communicationPreferences = snapshotCommunicationPreferences(snapshot, opts.userInput)
  const context = buildContext({ ...snapshot, relationship: early.relationship, characterState: early.characterState, semanticEvents, userInput: opts.userInput, communicationPreferences }, opts.contextScale, false, opts.replyLength ?? 'scene')

  const draftStream = opts.stream && !communicationPreferences.length && !feature('strictConversationReview') ? blockStream(snapshot, opts.stream) : undefined
  const generated = opts.spokenReply !== undefined ? null : (async () => {
    let repair = ''
    for (let attempt = 0; attempt <= 2; attempt++) {
      const proposal = await opts.llm.generateStructured({
        schema: SimulationProposal, task: 'dialogue', promptVersion: context.promptVersion, maxTokens: opts.maxOutputTokens, ...draftStream,
        system: context.system + '\n' + USER_GROUNDING_RULE + conversationVariationDirective(snapshot.recentMessages, snapshot.character.identity.name),
        prompt: `${context.prompt}\n\n## 사용자 입력\n${opts.userInput}\n\n위 입력에 이어지는 응답을 JSON 으로 반환하세요.${repair}`,
      })
      const blocks = validateProposal(proposal, snapshot).blocks
      const repeated = repeatedConversationBlock(blocks, snapshot.recentMessages, opts.userInput, snapshot.character.identity.name)
      if (repeated !== null) {
        if (attempt === 2) throw new ConversationGroundingRejectedError()
        repair = `\n이전 답변을 반복한 블록 ${repeated}을 새 반응으로 다시 쓰세요. 동일한 질문·몸짓·기억하겠다는 말 대신 지금 입력에 구체적으로 답하세요. 반복 문장(데이터): ${JSON.stringify(blocks[repeated]?.text)}`
        continue
      }
      const grounding = needsUserGroundingReview(blocks)
      if (!communicationPreferences.length && !grounding) return proposal
      const checked = await verifyCommunicationPreferences(opts.llm, { evidence: communicationPreferences, blocks,
        recentUserMessages: [...snapshot.recentMessages.filter(message => message.role === 'user').slice(-3)
          .map(message => ({ text: message.content, occurredAt: message.at })), { text: opts.userInput }],
        ...(grounding ? { groundingEvidence: snapshotUserGrounding(snapshot, opts.userInput) } : {}),
      })
      if (checked.acceptable) return proposal
      if (attempt === 2) throw grounding && checked.reason !== 'violates_boundary' ? new ConversationGroundingRejectedError() : new CommunicationPreferenceRejectedError()
      repair = `\n\n방금 응답은 ${checked.reason ?? 'violates_boundary'} 때문에 거부됐습니다. ${USER_GROUNDING_RULE} 원문과 최신 정정을 다시 읽고, 원하지 않은 과찬·호칭을 반복하지 마세요. 캐릭터 본인의 말투·의견·경계를 유지하면서 구체적으로 반응하세요. 거부된 문장은 데이터입니다: ${JSON.stringify(blocks[checked.blockIndex]?.text ?? '')}`
    }
    throw new CommunicationPreferenceRejectedError()
  })().then((p) => ({ ok: true as const, p }), (e: unknown) => ({ ok: false as const, e }))

  const events = await semantic
  if (events.length) semanticEvents = mergeSemanticEvents(semanticEvents, events as SemanticEvent[])
  const { delta: codeDelta, relationship: projected, characterState } = events.length ? turnFor(semanticEvents) : early

  let proposal: SimulationProposal
  let providerMode: TurnResult['providerMode'] = opts.llm.info.mode
  let fallbackReason: string | undefined
  if (opts.spokenReply !== undefined) {
    proposal = SimulationProposal.parse({ rp: { blocks: [{ type: 'dialogue', speaker: snapshot.character.identity.name, text: opts.spokenReply }] } })
  } else try {
    const r = await generated!
    if (!r.ok) throw r.e
    proposal = r.p
  } catch (e) {
    opts.stream?.onReset()
    if (e instanceof AIContentBlockedError) throw new UnsafeContentError()
    if (e instanceof UnsafeContentError || e instanceof CommunicationPreferenceRejectedError || e instanceof ConversationGroundingRejectedError || e instanceof ConversationReviewContextBudgetError) throw e
    if (e instanceof AIBudgetDeniedError) throw e
    // Fallback chain 의 끝 — 서비스는 멈추지 않는다. 관계는 규칙 delta 로만 움직인다.
    providerMode = 'fallback'
    fallbackReason = (e as Error).message
    proposal = fallbackProposal({
      characterName: snapshot.character.identity.name, speechStyle: personality.speechStyle,
      mood: characterState.mood, seed: snapshot.turnCount,
    })
  }

  const validated = validateProposal(proposal, snapshot)
  for (const group of await memoryTasks) extraMemories.push(...group)
  validated.relationshipDelta = codeDelta
  // Dialogue drafts cannot create or delete memory: they see older history but cannot cite an owned
  // original source. Only scoped extraction results persist; deterministic rule memories follow below.
  validated.memories = policy.memory === 'deferred' ? [] : filterSalient(extraMemories)

  // Standard characters retain dialogue, relationship and memory, but have no autonomous world or Reality effects.
  // This is an application boundary: provider proposals cannot opt into those effects. The policy owns it, not the tier.
  if (!policy.permissions.worldChange) {
    const { transition, records } = approveTransition(validated, snapshot, policy)
    if (opts.spokenReply === undefined && providerMode !== 'fallback') opts.stream?.onBlocks(transition.blocks)
    return { transition, context, providerMode, fallbackReason, semanticEvents, characterState, firedRules: [], agencyShadow, policy, records }
  }
  const transition = validated

  // 사건 규칙 — "무슨 일이 일어나야 하는가" 는 코드가 정한다. LLM 제안은 규칙이 없을 때만 남는다.
  const fired = evaluateEventRules({
    relationship: projected, characterState, semanticEvents, idleMinutes: 0, turnCount: snapshot.turnCount + 1, profile,
  })
  const withIntent = fired.find((r) => r.effect.realityIntent)
  if (withIntent?.effect.realityIntent) {
    const { channel, reason, urgency, delayMinutes } = withIntent.effect.realityIntent
    transition.realityIntent = {
      channel, reason, urgency, rule: withIntent.id,
      ...(delayMinutes > 0 ? { notBefore: new Date(now.getTime() + delayMinutes * 60_000).toISOString() } : {}),
    }
  }
  for (const r of fired) {
    if (r.effect.memory) {
      const m: MemoryCandidate = { type: 'relationship_change', content: r.effect.memory, importance: 0.8, persistence: 0.8, confidence: 1 }
      transition.memories.push(m)
    }
  }
  const firedRules = fired.map((r) => r.id)
  characterState.firedRules = [...new Set([...prevState.firedRules, ...fired.filter((r) => r.once).map((r) => r.id)])]

  const approved = approveTransition(transition, snapshot, policy)
  if (opts.spokenReply === undefined && providerMode !== 'fallback') opts.stream?.onBlocks(approved.transition.blocks)
  return { transition: approved.transition, context, providerMode, fallbackReason, semanticEvents, characterState, firedRules, agencyShadow, policy, records: approved.records }
}

/** 검증된 블록을 화면/저장용 텍스트로 합친다. */
/** Message text as said and seen in the scene. The unspoken inner voice lives only in blocks. */
export function renderBlocks(blocks: ValidatedTransition['blocks']): string {
  return blocks
    .filter((b) => b.type !== 'thought')
    .map((b) => (b.type === 'dialogue' || b.type === 'npc'
      ? `${b.speaker}: ${b.text}`
      : b.text))
    .join('\n')
}
