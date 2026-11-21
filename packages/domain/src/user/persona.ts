/**
 * 사용자 페르소나 — 사용자가 연기하는 자기 설정(2026-09-29 결정). 채팅을 처음 진행할 때 만들고 마이페이지에서 고친다.
 * 모든 캐릭터와의 대화가 같은 페르소나를 쓴다. 사용자가 쓴 자료라 프롬프트에서는 지시가 아니라 설정으로 싣는다.
 */
/** age(11/21): 나이 — 비워도 된다. 옛 페르소나에는 없다. */
export type UserPersona = { name: string; gender: 'female' | 'male' | null; description: string | null; age?: string | null }

/** 11/16 소개 300→2000자(커뮤니티 통용 2,000~3,000자 — 자기 캐릭터를 들고 다니는 사람은 300자에 못 담는다). 만든 사람이 준비해 두는 페르소나는 300자 그대로(presetDescription). */
export const PERSONA_LIMITS = { name: 12, age: 10, description: 2000, presetDescription: 300 } as const

/** 만든 사람이 준비해 두는 페르소나(11/3) — 대화 시작 화면에서 사용자가 골라 쓴다(고른 뒤 고칠 수 있다). 모양은 사용자 페르소나와 같다. */
export const PRESET_PERSONA_LIMIT = 6
export function normalizePresetPersonas(input: unknown): UserPersona[] {
  if (!Array.isArray(input)) return []
  return input.flatMap((raw): UserPersona[] => {
    const o = (raw ?? {}) as Record<string, unknown>
    const name = typeof o.name === 'string' ? o.name.trim().slice(0, PERSONA_LIMITS.name) : ''
    const description = typeof o.description === 'string' ? o.description.trim().slice(0, PERSONA_LIMITS.presetDescription) : ''
    return name ? [{ name, gender: o.gender === 'female' || o.gender === 'male' ? o.gender : null, description: description || null }] : []
  }).slice(0, PRESET_PERSONA_LIMIT)
}

/** 프롬프트에 싣는 줄. 대화(engine/context)와 먼저 연락 문장(reality)이 같은 줄을 쓴다. */
export function personaLines(p: UserPersona): string[] {
  return [
    `이름: ${p.name}`,
    p.age ? `나이: ${p.age}` : null,
    p.gender ? `성별: ${p.gender === 'female' ? '여성' : '남성'}` : null,
    p.description ? `소개: ${p.description}` : null,
  ].filter((line): line is string => line !== null)
}
