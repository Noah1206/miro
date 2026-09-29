/**
 * 사용자 페르소나 — 사용자가 연기하는 자기 설정(2026-09-29 결정). 채팅을 처음 진행할 때 만들고 마이페이지에서 고친다.
 * 모든 캐릭터와의 대화가 같은 페르소나를 쓴다. 사용자가 쓴 자료라 프롬프트에서는 지시가 아니라 설정으로 싣는다.
 */
export type UserPersona = { name: string; gender: 'female' | 'male' | null; description: string | null }

export const PERSONA_LIMITS = { name: 12, description: 300 } as const

/** 프롬프트에 싣는 줄. 대화(engine/context)와 먼저 연락 문장(reality)이 같은 줄을 쓴다. */
export function personaLines(p: UserPersona): string[] {
  return [
    `이름: ${p.name}`,
    p.gender ? `성별: ${p.gender === 'female' ? '여성' : '남성'}` : null,
    p.description ? `소개: ${p.description}` : null,
  ].filter((line): line is string => line !== null)
}
