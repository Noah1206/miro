import { POLICY } from '@miro/config'
import { CALL_MODE_RULES, describeRelationship, selectRelevantMemories } from '@miro/domain'
import type {
  CharacterCore, Memory, RelationshipState, SimulationEvent, Npc, WorldState, Scene, SimulationMode,
} from '@miro/domain'

export type RecentMessage = {
  role: 'user' | 'character' | 'narrator' | 'npc'
  content: string
}

export type SimulationSnapshot = {
  character: CharacterCore
  world: WorldState
  worldSetting: string | null
  relationship: RelationshipState
  scene: Scene | null
  memories: Memory[]
  recentMessages: RecentMessage[]
  activeEvents: SimulationEvent[]
  recentlyResolvedEvents: SimulationEvent[]
  activeNpcs: Npc[]
  recentRealityContacts: Array<{ channel: string; sentAt: Date }>
  outputStyle: 'messenger' | 'balanced' | 'narrative'
  turnCount: number
  /** chat(기본) | voice_call | video_call. 통화도 같은 시뮬레이션이다. */
  mode?: SimulationMode
}

export type BuiltContext = {
  system: string
  prompt: string
  /** 대략적 토큰 추정. 예산 초과 시 무엇이 잘렸는지 확인용. */
  approxTokens: number
  dropped: string[]
}

const STYLE_GUIDE = {
  messenger: '짧은 대사 위주로. 서술은 최소한으로. 메신저 대화처럼.',
  balanced: '대사와 짧은 행동 묘사를 섞어서. 일상 장면은 짧게, 중요한 장면은 길게.',
  narrative: '서술과 묘사를 충분히. 장면의 공기와 감각을 함께 전달.',
} as const

/**
 * Context 조립.
 *
 * 전체 대화 원문을 매번 보내지 않는다. 최근 메시지 일부 + 요약된 장기 기억만 사용한다.
 * 예산을 넘으면 중요도가 낮은 항목부터 제외하고, 무엇을 뺐는지 기록한다.
 */
export function buildContext(s: SimulationSnapshot): BuiltContext {
  const dropped: string[] = []

  const memories = selectRelevantMemories(
    s.memories, s.relationship.sessionId, POLICY.context.relevantMemoryCount,
  )
  if (s.memories.length > memories.length) {
    dropped.push(`memories(${s.memories.length - memories.length})`)
  }

  const recent = s.recentMessages.slice(-POLICY.context.recentMessageCount)
  if (s.recentMessages.length > recent.length) {
    dropped.push(`messages(${s.recentMessages.length - recent.length})`)
  }

  const system = buildSystem(s)
  const prompt = buildPrompt(s, memories, recent)
  const approxTokens = estimateTokens(system) + estimateTokens(prompt)

  return { system, prompt, approxTokens, dropped }
}

/** Character Core — 매 턴 성격을 새로 정의하지 않도록 안정적으로 고정한다. */
function buildSystem(s: SimulationSnapshot): string {
  const c = s.character
  return [
    '당신은 자유 역할극의 진행자이자 캐릭터 연기자입니다.',
    '',
    '## 캐릭터 (변하지 않는 정체성)',
    `이름: ${c.identity.name}`,
    c.identity.age ? `나이: ${c.identity.age}` : null,
    c.identity.occupation ? `직업: ${c.identity.occupation}` : null,
    `성격: ${c.personality.personality}`,
    c.personality.values ? `가치관: ${c.personality.values}` : null,
    c.personality.speechStyle ? `말투: ${c.personality.speechStyle}` : null,
    c.personality.hobbies.length ? `좋아하는 것: ${c.personality.hobbies.join(', ')}` : null,
    c.personality.dislikes.length ? `싫어하는 것: ${c.personality.dislikes.join(', ')}` : null,
    `질투 성향 ${c.personality.jealousy}/100, 주도성 ${c.personality.initiative}/100, 감정표현 ${c.personality.emotionalExpression}/100`,
    '',
    '## 규칙',
    '- 이 캐릭터의 성격과 말투를 유지합니다. 상황에 따라 감정과 태도는 변하지만 정체성은 변하지 않습니다.',
    '- 사용자에게 무조건 호의적으로 굴지 않습니다. 관계 상태에 맞게 행동합니다.',
    '- 관계 수치를 대사나 서술에 노출하지 않습니다.',
    '- 사용자의 행동을 대신 정하지 않습니다. 사용자 캐릭터의 대사나 선택을 서술하지 않습니다.',
    '- 정해진 줄거리를 따라가지 않습니다. 현재 상태에서 자연스럽게 이어지는 반응을 만듭니다.',
    s.mode && s.mode !== 'chat' ? CALL_MODE_RULES[s.mode] : `- 출력 스타일: ${STYLE_GUIDE[s.outputStyle]}`,
    '',
    '## 상태 변화 제안',
    '- 관계 변화는 delta 로만 제안합니다. 한 턴에 큰 폭으로 움직이지 않습니다.',
    '- 사건은 지금 상황에서 자연스러울 때만 제안합니다. 매 턴 사건을 만들지 않습니다.',
    '- 기억은 관계에 실제로 중요한 것만 남깁니다.',
    '',
    '반드시 지정된 JSON 스키마에 맞는 객체만 반환합니다.',
  ].filter(Boolean).join('\n')
}

/** Dynamic State — 매 턴 달라지는 부분. */
function buildPrompt(
  s: SimulationSnapshot,
  memories: Memory[],
  recent: RecentMessage[],
): string {
  const parts: string[] = []

  parts.push('## 현재 세계')
  parts.push(`장소: ${s.world.currentLocation}`)
  parts.push(`시간: ${s.world.currentTime}`)
  if (s.world.worldStatus) parts.push(`상황: ${s.world.worldStatus}`)
  if (s.worldSetting) parts.push(`세계관: ${s.worldSetting}`)
  if (s.scene) parts.push(`장면: ${s.scene.mood} / ${s.scene.weather}`)

  const r = s.relationship
  parts.push('', '## 현재 관계 (내부 상태 — 절대 노출하지 말 것)')
  parts.push(`단계: ${r.stage}`)
  parts.push(
    `신뢰 ${r.trust} / 끌림 ${r.attraction} / 질투 ${r.jealousy} / ` +
    `보호 ${r.protectiveness} / 정서적 거리 ${r.emotionalDistance} / 애착 ${r.attachment}`,
  )
  parts.push(describeRelationship(r))

  if (s.activeEvents.length > 0) {
    parts.push('', '## 진행 중인 사건 (해결 전까지 사라지지 않음)')
    for (const e of s.activeEvents) {
      // id 를 함께 실어야 AI 가 특정 사건의 해결/진행을 제안할 수 있다.
      parts.push(`- [${e.type}] ${JSON.stringify({ __id: e.id, ...e.continuationState })}`)
    }
    parts.push('사건이 마무리되었다면 eventUpdates 로 resolved 를 제안하세요.')
  }
  if (s.recentlyResolvedEvents.length > 0) {
    parts.push('', '## 최근 마무리된 사건 (당분간 반복 금지)')
    parts.push(s.recentlyResolvedEvents.map((e) => e.type).join(', '))
  }

  if (s.activeNpcs.length > 0) {
    parts.push('', '## 등장 가능한 NPC')
    for (const n of s.activeNpcs) {
      parts.push(`- ${n.name} (${n.role}) — 아는 것: ${n.knows.join(', ') || '없음'}`)
    }
    parts.push('NPC 는 자신이 아는 정보로만 행동합니다.')
  }

  if (memories.length > 0) {
    parts.push('', '## 기억하고 있는 것')
    for (const m of memories) parts.push(`- ${m.content}`)
  }

  if (s.recentRealityContacts.length > 0) {
    parts.push('', '## 최근 먼저 연락한 기록')
    parts.push(s.recentRealityContacts.map((c) => c.channel).join(', '))
  }

  if (recent.length > 0) {
    parts.push('', '## 최근 대화')
    for (const m of recent) {
      parts.push(`${m.role === 'user' ? '사용자' : s.character.identity.name}: ${m.content}`)
    }
  }

  return parts.join('\n')
}

/** 한국어는 문자당 토큰 비율이 높다. 보수적으로 잡는다. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 2.2)
}
