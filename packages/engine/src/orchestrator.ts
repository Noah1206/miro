import type { LLMProvider } from '@miro/providers'
import {
  DEFAULT_CHARACTER_STATE, applyRelationshipDelta, deltaFromSemanticEvents, deriveCharacterState,
  detectSemanticEvents, evaluateEventRules, mergeRelationshipDelta,
} from '@miro/domain'
import type { CharacterState, MemoryCandidate, RelationshipDelta, SemanticEvent } from '@miro/domain'
import { SimulationProposal } from './proposal.schema'
import { fallbackProposal } from './fallback'
import { buildContext, type BuiltContext, type SimulationSnapshot } from './context'
import { validateProposal, type ValidatedTransition } from './validator'

export type TurnResult = {
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
 *   사용자 입력 → 의미 이벤트(코드) → 관계 delta(규칙) → 캐릭터 상태(코드)
 *   → Context 조립 → 1회 Structured Generation → 검증 → 규칙 delta + LLM 뉘앙스 병합 → 사건 규칙
 *
 * 관계 수치를 움직이는 것은 규칙이다. LLM 은 ±LLM_NUANCE_LIMIT 안에서만 보정한다.
 * DB 커밋은 여기서 하지 않는다 — 영속화는 호출자(웹 앱)의 트랜잭션 안에서 이뤄진다.
 */
export async function runTurn(opts: {
  llm: LLMProvider
  snapshot: SimulationSnapshot
  userInput: string
  now?: Date
}): Promise<TurnResult> {
  const { snapshot } = opts
  const now = opts.now ?? new Date()
  const personality = snapshot.character.personality

  const semanticEvents = detectSemanticEvents(opts.userInput)
  const codeDelta = deltaFromSemanticEvents(semanticEvents, personality)
  // 이번 턴의 관계(규칙 적용 후)로 기분을 정한다 — 모델은 수치가 아니라 기분을 본다.
  const projected = applyRelationshipDelta(snapshot.relationship, codeDelta)
  const prevState = snapshot.characterState ?? DEFAULT_CHARACTER_STATE
  const characterState = deriveCharacterState(prevState, projected, semanticEvents)

  const context = buildContext({ ...snapshot, characterState, semanticEvents, userInput: opts.userInput })

  let proposal: SimulationProposal
  let providerMode: TurnResult['providerMode'] = opts.llm.info.mode
  let fallbackReason: string | undefined
  try {
    proposal = await opts.llm.generateStructured({
      schema: SimulationProposal,
      system: context.system,
      prompt: `${context.prompt}\n\n## 사용자 입력\n${opts.userInput}\n\n위 입력에 이어지는 응답을 JSON 으로 반환하세요.`,
    })
  } catch (e) {
    // Fallback chain 의 끝 — 서비스는 멈추지 않는다. 관계는 규칙 delta 로만 움직인다.
    providerMode = 'fallback'
    fallbackReason = (e as Error).message
    proposal = fallbackProposal({
      characterName: snapshot.character.identity.name, speechStyle: personality.speechStyle,
      mood: characterState.mood, seed: snapshot.turnCount,
    })
  }

  const transition = validateProposal(proposal, snapshot)
  transition.relationshipDelta = mergeRelationshipDelta(codeDelta, transition.relationshipDelta as RelationshipDelta) as never

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

  return { transition, context, providerMode, fallbackReason, semanticEvents, characterState, firedRules }
}

/** 검증된 블록을 화면/저장용 텍스트로 합친다. */
export function renderBlocks(blocks: ValidatedTransition['blocks']): string {
  return blocks
    .map((b) => (b.type === 'dialogue' || b.type === 'npc'
      ? `${b.speaker}: ${b.text}`
      : b.text))
    .join('\n')
}
