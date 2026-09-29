import { randomUUID } from 'node:crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db, userPersonas } from '@miro/db'
import { PERSONA_LIMITS, type UserPersona } from '@miro/domain'
import { requireSafeContent, UnsafeContentError } from '@miro/engine'
import { observe } from '@/lib/observe'
import { resolveRpLLM } from '@/lib/simulation/mock-llm'

/**
 * 사용자 페르소나(domain/user/persona). 채팅·문자 화면은 페르소나가 없으면 먼저 만들게 보낸다(requirePersonaPath).
 * 모든 캐릭터와의 대화가 같은 페르소나를 쓴다.
 */
export async function getPersona(userId: string): Promise<UserPersona | null> {
  const [row] = await db.select({ name: userPersonas.name, gender: userPersonas.gender, description: userPersonas.description })
    .from(userPersonas).where(eq(userPersonas.userId, userId)).limit(1)
  return row ?? null
}

/** 폼 값 → 페르소나. 이름은 필수, 나머지는 비워도 된다. 길이 한도는 DB 제약과 같다. */
export function parsePersona(raw: { name: unknown; gender: unknown; description: unknown }): { ok: true; persona: UserPersona } | { ok: false; error: string } {
  // 제어 문자(NUL 등)는 DB text 가 받지 않고 프롬프트에도 쓸모가 없다 — 공백으로 바꾼 뒤 공백을 하나로 모은다.
  const text = (v: unknown) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim() : '')
  const name = text(raw.name), description = text(raw.description)
  if (!name) return { ok: false, error: '이름을 적어 주세요.' }
  if ([...name].length > PERSONA_LIMITS.name) return { ok: false, error: `이름은 ${PERSONA_LIMITS.name}자까지 쓸 수 있어요.` }
  if ([...description].length > PERSONA_LIMITS.description) return { ok: false, error: `소개는 ${PERSONA_LIMITS.description}자까지 쓸 수 있어요.` }
  const gender = raw.gender === 'female' || raw.gender === 'male' ? raw.gender : null
  return { ok: true, persona: { name, gender, description: description || null } }
}

/**
 * 저장. 페르소나는 모든 대화의 시스템 프롬프트에 실리므로 저장 전에 안전 검사를 한 번 거친다(사용자 입력과 같은 검사).
 * 검사를 못 하면 저장하지 않는다 — 검사 없이 들어간 설정은 매 턴 모델에 실린다.
 */
export async function savePersona(userId: string, raw: { name: unknown; gender: unknown; description: unknown }): Promise<{ ok: true } | { ok: false; error: string; canSkip?: true }> {
  const parsed = parsePersona(raw)
  if (!parsed.ok) return parsed
  const p = parsed.persona
  try {
    await requireSafeContent(resolveRpLLM('페르소나', { userId, requestId: randomUUID(), usageUnits: 0, origin: 'persona:moderation' }),
      { phase: 'input', input: [p.name, p.description].filter(Boolean).join('\n') })
  } catch (e) {
    if (e instanceof UnsafeContentError) return { ok: false, error: '이 내용은 쓸 수 없어요. 다른 표현으로 적어 주세요.' }
    observe('persona.moderation_failed', { userId, error: (e as Error).message })
    // 검사를 못 하는 것(공급자 장애·예산)은 사용자 탓이 아니다 — 저장은 막되, 이번에는 페르소나 없이 대화로 가게 한다(PERSONA_LATER).
    return { ok: false, error: '지금은 저장할 수 없어요. 잠시 뒤 다시 시도하거나, 이번에는 건너뛰고 대화할 수 있어요.', canSkip: true }
  }
  await db.insert(userPersonas).values({ userId, ...p })
    .onConflictDoUpdate({ target: userPersonas.userId, set: { ...p, updatedAt: new Date() } })
  return { ok: true }
}

/** 페르소나 화면에서 돌아갈 곳. 채팅·문자 화면과 마이페이지만 — 열린 리다이렉트를 만들지 않는다. */
const NEXT = /^\/(?:chat|messages)\/[0-9a-f-]{36}$|^\/my$/
export function personaNext(v: unknown): string {
  return typeof v === 'string' && NEXT.test(v) ? v : '/my'
}
/** 채팅·문자 화면에서 페르소나가 없을 때 보낼 곳. */
export function requirePersonaPath(back: string): string {
  return `/persona?next=${encodeURIComponent(personaNext(back))}`
}

/**
 * 안전 검사를 못 해 저장할 수 없었을 때 '이번에는 건너뛰기' 를 고른 표시(브라우저 세션 쿠키). 있으면 관문이 보내지 않는다 —
 * AI 장애가 대화 기록·문자까지 막지 않게. 페르소나가 없으니 캐릭터는 '사용자' 로만 안다. 다음 세션에 다시 묻는다.
 */
export const PERSONA_LATER = 'miro_persona_later'

/** 채팅·문자 화면의 관문. 페르소나가 없고 '이번에는 건너뛰기' 도 고르지 않았으면 페르소나 화면으로 보낸다(저장하면 back 으로 돌아온다). */
export async function requirePersona(persona: UserPersona | null | undefined, back: string): Promise<void> {
  if (persona || (await cookies()).has(PERSONA_LATER)) return
  redirect(requirePersonaPath(back))
}
