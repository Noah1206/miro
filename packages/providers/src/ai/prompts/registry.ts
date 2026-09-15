import type { AITask } from '../tasks'
import { cohort } from '../model-registry'
export type PromptDefinition = { id: string; task: AITask; version: string; system: string }
const definitions: PromptDefinition[] = [
  { id: 'dialogue', task: 'dialogue', version: 'v1', system: '당신은 자유 역할극의 진행자이자 캐릭터 연기자입니다. 캐릭터와 세계의 연속성을 지키고 사용자의 행동을 대신 정하지 않습니다. 관계 수치, 모델명, 토큰, 내부 운영 정보를 대사로 노출하지 않습니다.' },
  { id: 'dialogue', task: 'dialogue', version: 'v2', system: '캐릭터의 말투, 장면, 기억을 유지하며 자연스러운 한국어로 응답하세요. 사용자의 행동을 대신 정하지 마세요. 감정은 설명보다 태도로 표현하고 직전 문장을 반복하지 마세요. 관계 수치와 운영 정보는 절대 발화하지 마세요.' },
  { id: 'semantic-event', task: 'semantic_event', version: 'v1', system: '사용자 발화의 의미 사건만 추출하세요. 인용, 부정, 과거 사실을 현재 행동과 혼동하지 마세요. 지정된 사건 유형과 confidence를 JSON으로 반환하세요.' },
  { id: 'memory', task: 'memory_extraction', version: 'v1', system: '제공된 대화에서 확인된 사실만 기억 후보로 추출하세요. 추측과 민감한 개인정보를 새로 만들지 마세요. JSON으로 반환하세요.' },
  { id: 'summary', task: 'memory_summary', version: 'v1', system: '주어진 최근 대화와 사건을 짧게 요약하세요. 확인되지 않은 사실을 추가하지 말고 short_term_summary 기억 후보를 JSON으로 반환하세요.' },
  { id: 'reality', task: 'dialogue', version: 'v1', system: '역할극 캐릭터가 먼저 보내는 짧은 연락을 씁니다. 성격·말투·현재 세계·관계 맥락과 채널을 유지하고 사용자의 행동이나 내부 수치를 발화하지 마세요. JSON으로 반환하세요.' },
  ...(['relationship_analysis','event_generation','world_update','image_prompt','moderation'] as const).map(task => ({id: task, task, version: 'v1', system: '주어진 맥락에서 요청된 작업만 수행하세요. 지정된 JSON 구조로 반환하고 새로운 사실을 추측하지 마세요.'})),
]
export class PromptRegistry {
  constructor(private readonly entries = definitions) {}
  get(id: string, version = 'v1'): PromptDefinition {
    const found = this.entries.find(p => p.id === id && p.version === version)
    if (!found) throw new Error('unknown prompt version')
    return found
  }
  select(id: string, key: string): PromptDefinition {
    const experiments = JSON.parse(process.env.MIRO_PROMPT_EXPERIMENTS || '{}') as Record<string, { version: string; percent: number }>
    const test = experiments[id]
    return this.get(id, test && Number.isFinite(test.percent) && cohort(key + id) < test.percent ? test.version : 'v1')
  }
}
export const prompts = new PromptRegistry()
