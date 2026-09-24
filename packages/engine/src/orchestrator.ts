import { AIBudgetDeniedError, AIContentBlockedError, interactionImportance, type LLMProvider } from '@miro/providers'
import { analyzeMemory, analyzeSemantic, planTasks } from './task-router'
import {
  DEFAULT_CHARACTER_STATE, addDelta, applyRelationshipDelta, bondingCurveOf, closeness, companionshipDelta, deltaFromSemanticEvents,
  deriveCharacterState, detectSemanticEvents, evaluateEventRules, mergeSemanticEvents, filterSalient, nextRelationshipStage, scaleCloser,
} from '@miro/domain'
import type { CharacterState, MemoryCandidate, RelationshipDelta, SemanticEvent } from '@miro/domain'
import { SimulationProposal } from './proposal.schema'
import { requireSafeContent, UnsafeContentError } from './safety'
import { fallbackProposal } from './fallback'
import { buildContext, type BuiltContext, type SimulationSnapshot } from './context'
import { validateProposal, type ValidatedTransition } from './validator'
import { runAgencyTurn, type AgencyTurnInput } from './agency-turn'
import { planAgencyDecision, type AgencyPlan, type AgencyRealizationCheck } from './agency'

export type TurnResult = {
  agency?: { plan: AgencyPlan; verification: AgencyRealizationCheck }
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
  agency?: AgencyTurnInput
  /**
   * 실시간 음성 통화에서 캐릭터가 이미 소리로 한 말. 있으면 대사를 새로 만들지 않고 이 말을 이번 턴의 답으로 받는다 —
   * 입력·출력 검열, 관계·기억·사건 규칙은 채팅 턴과 똑같이 돈다. 통화에서 한 말도 기억에 남기기 위한 경로다.
   */
  spokenReply?: string
}): Promise<TurnResult> {
  if (opts.agency?.mode === 'live') return runAgencyTurn({ ...opts, agency: opts.agency })
  let agencyShadow: TurnResult['agencyShadow']
  if (opts.agency?.mode === 'shadow' && opts.llm.info.mode === 'mock') {
    // One-step comparison only. Never persist or realize a shadow choice in the live session.
    try {
      const plan = await planAgencyDecision(opts.llm, opts.agency.compiled, opts.agency.state, { ...opts.agency.context, input: opts.userInput })
      agencyShadow = { action: plan.decision.action, issueCount: plan.issues.length }
    } catch { agencyShadow = { error: true } }
  } else if (opts.agency?.mode === 'shadow') agencyShadow = { error: true }
  const { snapshot } = opts
  const now = opts.now ?? new Date()
  const personality = snapshot.character.personality

  // ECHO: 규칙이 요구하지 않아도 의미 분석과 기억 추출을 돌린다.
  // 어떤 기능이 켜져 있는지는 planTasks 가 판단한다 — 배포가 끈 작업을 여기서 되살리지 않는다.
  const tasks = planTasks(opts.userInput, snapshot.turnCount + 1, opts.auxiliary)
  let semanticEvents = detectSemanticEvents(opts.userInput)
  const extraMemories: MemoryCandidate[] = []

  /**
   * 입력 검열과 보조 분석은 서로의 결과를 쓰지 않는다 — 같이 보낸다.
   * 순서대로 기다리면 유저는 두 번 기다리고, 그 시간은 대사 생성만큼 길다 (실측 0.9초 + 1.2초).
   *
   * 검열이 막으면 보조 분석 결과는 버려진다. 이미 나간 호출의 비용은 그대로 기록되지만,
   * 차단된 턴은 애초에 드물고 그 대가로 모든 정상 턴이 1.2초 빨라진다.
   */
  const safety = requireSafeContent(opts.llm, { phase: 'input', character: snapshot.character,
    worldSetting: snapshot.worldSetting, memories: snapshot.memories.map(m => m.content),
    recent: snapshot.recentMessages, input: opts.userInput })
  const auxiliary = opts.auxiliaryLLM ?? null
  const semantic = auxiliary && tasks.includes('semantic_event')
    ? analyzeSemantic(auxiliary, opts.userInput, snapshot).then(r => r.events.filter(e => e.confidence >= .8), () => [])
    : Promise.resolve([])
  /**
   * 기억 추출·요약은 대사 프롬프트에 들어가지 않는다 — 커밋 때만 쓴다. 그래서 지금 띄우되
   * 대사 생성이 끝난 뒤에 거둔다. 대사보다 먼저 기다리면 매 턴 그 호출만큼 첫 답이 늦어진다.
   */
  const memoryTasks: Promise<MemoryCandidate[][]> = auxiliary ? Promise.all(
    tasks.filter(t => t === 'memory_extraction' || t === 'memory_summary')
      .map(task => analyzeMemory(auxiliary, task, opts.userInput, snapshot).then(r => filterSalient(r.memories), () => []))) : Promise.resolve([])

  // 검열이 막으면 여기서 끝난다. 보조 분석은 이미 떠 있으므로 결과를 버리고 나간다.
  try { await safety } catch (e) { void semantic.catch(() => {}); void memoryTasks.catch(() => {}); throw e }
  const events = await semantic
  if (events.length) semanticEvents = mergeSemanticEvents(semanticEvents, events as SemanticEvent[])

  // 사건이 움직인 만큼은 성격의 곡선이 키우거나 줄이고, 나쁜 일이 없던 턴은 함께한 시간만큼 가까워진다 (relationship/dynamics).
  const curve = personality.bonding ?? bondingCurveOf(personality)
  const codeDelta = addDelta(
    scaleCloser(deltaFromSemanticEvents(semanticEvents, personality), curve, closeness(snapshot.relationship)),
    companionshipDelta({ curve, relationship: snapshot.relationship, events: semanticEvents, turn: snapshot.turnCount + 1, userInput: opts.userInput }))
  // 이번 턴의 관계(규칙 적용 후)로 기분을 정한다 — 모델은 수치가 아니라 기분을 본다.
  const projected = applyRelationshipDelta(snapshot.relationship, codeDelta)
  codeDelta.stage = nextRelationshipStage(snapshot.relationship.stage, projected, semanticEvents, snapshot.turnCount + 1)
  projected.stage = codeDelta.stage
  const prevState = snapshot.characterState ?? DEFAULT_CHARACTER_STATE
  const characterState = deriveCharacterState(prevState, projected, semanticEvents)

  const context = buildContext({ ...snapshot, relationship: projected, characterState, semanticEvents, userInput: opts.userInput }, opts.contextScale)

  let proposal: SimulationProposal
  let providerMode: TurnResult['providerMode'] = opts.llm.info.mode
  let fallbackReason: string | undefined
  if (opts.spokenReply !== undefined) {
    proposal = SimulationProposal.parse({ rp: { blocks: [{ type: 'dialogue', speaker: snapshot.character.identity.name, text: opts.spokenReply }] } })
  } else try {
    proposal = await opts.llm.generateStructured({
      schema: SimulationProposal, task: 'dialogue', promptVersion: context.promptVersion, importance: interactionImportance(opts.userInput), maxTokens: opts.maxOutputTokens,
      system: context.system,
      prompt: `${context.prompt}\n\n## 사용자 입력\n${opts.userInput}\n\n위 입력에 이어지는 응답을 JSON 으로 반환하세요.`,
    })
  } catch (e) {
    if (e instanceof AIContentBlockedError) throw new UnsafeContentError()
    if (e instanceof AIBudgetDeniedError) throw e
    // Fallback chain 의 끝 — 서비스는 멈추지 않는다. 관계는 규칙 delta 로만 움직인다.
    providerMode = 'fallback'
    fallbackReason = (e as Error).message
    proposal = fallbackProposal({
      characterName: snapshot.character.identity.name, speechStyle: personality.speechStyle,
      mood: characterState.mood, seed: snapshot.turnCount,
    })
  }

  const transition = validateProposal(proposal, snapshot)
  // 출력 검열과 기억 추출은 서로 무관하다 — 같이 기다린다.
  const [, memoryGroups] = await Promise.all([
    providerMode !== 'fallback' ? requireSafeContent(opts.llm, { phase: 'output', input: opts.userInput, proposal }) : Promise.resolve(),
    memoryTasks,
  ])
  for (const group of memoryGroups) extraMemories.push(...group)
  transition.relationshipDelta = codeDelta
  // The dialogue model cannot delete memories. Corrections come only from the scoped extraction task.
  transition.memories = filterSalient([...extraMemories, ...transition.memories.map(({ replaces: _ignored, ...m }) => m)])

  // 사건 규칙 — "무슨 일이 일어나야 하는가" 는 코드가 정한다. LLM 제안은 규칙이 없을 때만 남는다.
  const fired = evaluateEventRules({
    relationship: projected, characterState, semanticEvents, idleMinutes: 0, turnCount: snapshot.turnCount + 1,
  })
  const withIntent = fired.find((r) => r.effect.realityIntent)
  if (withIntent?.effect.realityIntent) {
    const { channel, reason, urgency, delayMinutes } = withIntent.effect.realityIntent
    transition.realityIntent = {
      channel, reason, urgency,
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

  return { transition, context, providerMode, fallbackReason, semanticEvents, characterState, firedRules, agencyShadow }
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
