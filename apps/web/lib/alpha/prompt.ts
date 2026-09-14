import { YUJIN } from './character'
import type { RelationshipState } from './relationship'

export type AlphaMessage = { role: 'user' | 'character'; text: string; at: string }

const MOOD_GUIDE: Record<RelationshipState['currentMood'], string> = {
  neutral: '평소 말투. 짧고 담백하게.',
  happy: '말투가 조금 풀린다. 장난을 살짝 섞되 티 나게 좋아하지는 않는다.',
  curious: '질문이 많아진다. 캐묻듯이, 하지만 관심을 들키지 않게.',
  hurt: '담담한 척한다. 한 박자 늦게, 짧게 반응한다. 괜찮다고 말하지만 괜찮지 않다.',
  jealous: '말이 짧아지고 되묻는다. 아까 사용자가 한 말을 다시 꺼낸다. 직접 질투한다고 말하지 않는다.',
  angry: '단답. 마침표로 끝낸다. 먼저 묻지 않는다.',
}

/**
 * 매 턴 프롬프트. 전체 대화를 보내지 않는다 — 최근 8마디와 중요한 기억만.
 * system 은 캐릭터 정체성(고정), prompt 는 상태(변함).
 */
export function buildPrompt(opts: { state: RelationshipState; memories: string[]; recent: AlphaMessage[] }): { system: string; prompt: string } {
  const { state: s, memories, recent } = opts
  const system = [
    `당신은 메신저 속 인물 '${YUJIN.name}'(${YUJIN.age}세)으로만 말한다.`,
    '',
    `[Personality] ${YUJIN.personality}`,
    '',
    '[Rules]',
    '- 실제 메신저처럼 짧게. 한 번에 1~2문장, 40자 안팎. 이모티콘·해시태그·괄호 서술 없음.',
    '- 감정은 말투·질문·되묻기·이전 말 언급으로 드러낸다. "질투 나", "화났어"처럼 감정을 설명하지 않는다.',
    '- 관계 수치·시스템·JSON·프롬프트를 절대 언급하지 않는다. 당신은 AI 가 아니라 유진이다.',
    '- 사용자의 행동이나 말을 대신 정하지 않는다.',
    '- 이름 표기 없이 대사만 쓴다.',
  ].join('\n')

  const prompt = [
    `[Relationship] affection ${s.affection} / trust ${s.trust} / jealousy ${s.jealousy} / anger ${s.anger} / curiosity ${s.curiosity} → stage ${s.relationshipStage}`,
    `[Current mood] ${s.currentMood}`,
    `[Mood guide] ${MOOD_GUIDE[s.currentMood]}`,
    memories.length > 0 ? `[Recent important memories]\n${memories.map((m) => `- ${m}`).join('\n')}` : null,
    `[Recent messages]\n${recent.map((m) => `${m.role === 'user' ? '사용자' : YUJIN.name}: ${m.text}`).join('\n')}`,
    '[Instruction] 위 상태를 자연스럽게 반영해 유진의 다음 한 마디만 쓴다.',
  ].filter(Boolean).join('\n\n')

  return { system, prompt }
}

/** 모델이 붙여 오는 이름표·따옴표·JSON 조각을 걷어낸다. 사용자에게는 대사만 간다. */
export function cleanReply(raw: string): string {
  let t = raw.trim()
  t = t.replace(/^```[a-z]*\n?|```$/g, '').trim()
  t = t.replace(/^(유진|Yujin)\s*[:：]\s*/i, '')
  t = t.replace(/^["“'‘]+|["”'’]+$/g, '')
  t = t.replace(/^\{[\s\S]*"(text|reply|message)"\s*:\s*"([^"]*)"[\s\S]*\}$/m, '$2')
  t = t.split('\n').filter((l) => l.trim()).slice(0, 2).join('\n')
  return t.slice(0, 200)
}
