/**
 * 사용자 페르소나 — 사용자가 연기하는 자기 설정(2026-09-29 결정). 채팅을 처음 진행할 때 만들고 마이페이지에서 고친다.
 * 모든 캐릭터와의 대화가 같은 페르소나를 쓴다. 사용자가 쓴 자료라 프롬프트에서는 지시가 아니라 설정으로 싣는다.
 */
export type UserPersona = { name: string; gender: 'female' | 'male' | null; description: string | null }

export const PERSONA_LIMITS = { name: 12, description: 300 } as const

/** 만든 사람이 준비해 두는 페르소나(11/3) — 대화 시작 화면에서 사용자가 골라 쓴다(고른 뒤 고칠 수 있다). 모양은 사용자 페르소나와 같다. */
export const PRESET_PERSONA_LIMIT = 6
export function normalizePresetPersonas(input: unknown): UserPersona[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw): UserPersona[] => {
    const o = (raw ?? {}) as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, PERSONA_LIMITS.name) : ''
    const description = typeof o.description === 'string' ? o.description.trim().slice(0, PERSONA_LIMITS.description) : ''
    return name ? [{ name, gender: o.gender === 'female' || o.gender === 'male' ? o.gender : null, description: description || null }] : []
  }).slice(0, PRESET_PERSONA_LIMIT)
}

/** 프롬프트에 싣는 줄. 대화(engine/context)와 먼저 연락 문장(reality)이 같은 줄을 쓴다. */
export function personaLines(p: UserPersona): string[] {
  return [
    `이름: ${p.name}`,
    p.gender ? `성별: ${p.gender === 'female' ? '여성' : '남성'}` : null,
    p.description ? `소개: ${p.description}` : null,
  ].filter((line): line is string => line !== null)
}
