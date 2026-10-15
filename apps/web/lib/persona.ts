import { redirect } from 'next/navigation'
import { and, eq, isNull, or } from 'drizzle-orm'
import { db, userPersonas, roleplaySessions, characters, messages } from '@miro/db'
import { PERSONA_LIMITS, mentionsMinor, type UserPersona } from '@miro/domain'
import { personalize } from './personalize'
import { introMessages } from './intro-dialogue'
import { officialIntro } from './editorial/official-copy'
import { msg } from '@/lib/i18n'

/**
 * 공용 페르소나는 새 대화의 기본값이다. 각 대화방에서 확인한 뒤에는 방별 설정을 쓴다.
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
  if (!name) return { ok: false, error: msg('이름을 적어 주세요.') }
  if ([...name].length > PERSONA_LIMITS.name) return { ok: false, error: msg('이름은 12자까지 쓸 수 있어요.') }
  if ([...description].length > PERSONA_LIMITS.description) return { ok: false, error: msg('소개는 300자까지 쓸 수 있어요.') }
  const gender = raw.gender === 'female' || raw.gender === 'male' ? raw.gender : null
  return { ok: true, persona: { name, gender, description: description || null } }
}

/** 공용 기본값 저장. 방에서 확인한 페르소나는 바꾸지 않는다. 따로 돌던 AI 안전 검사는 10/2 에 뺐다. */
export async function savePersona(userId: string, raw: { name: unknown; gender: unknown; description: unknown }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parsePersona(raw)
  if (!parsed.ok) return parsed
  const p = parsed.persona
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

/** 채팅·문자 화면의 관문. 페르소나가 없으면 페르소나 화면으로 보낸다(저장하면 back 으로 돌아온다). */
export async function requirePersona(persona: UserPersona | null | undefined, back: string): Promise<void> {
  if (persona) return
  redirect(requirePersonaPath(back))
}

/** The conversation override is shared by its scene, messages, calls and proactive contact. */
export async function getConversationPersona(userId: string, sessionId: string): Promise<UserPersona | null> {
  const [row] = await db.select({ persona: roleplaySessions.userPersona }).from(roleplaySessions)
    .where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt)))
  return row ? row.persona ?? await getPersona(userId) : null
}

export async function saveConversationPersona(userId: string, sessionId: string, raw: { name: unknown; gender: unknown; description: unknown }): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = parsePersona(raw)
  if (!parsed.ok) return parsed
  return db.transaction(async tx => {
    const [room] = await tx.select().from(roleplaySessions).where(and(eq(roleplaySessions.id, sessionId), eq(roleplaySessions.userId, userId), isNull(roleplaySessions.deletedAt))).for('update')
    if (!room) return { ok: false as const, error: msg('대화를 찾을 수 없습니다.') }
    const persona = parsed.persona
    if (room.adultSince && (mentionsMinor(persona.name) || mentionsMinor(persona.description))) return { ok: false as const, error: msg('페르소나가 학생·미성년자로 되어 있으면 언베일을 켤 수 없어요.') }
    // Restore second-person wording only in untouched authored openings; preserve played dialogue.
    if (room.turnCount === 0) {
      const [c] = await tx.select().from(characters).where(eq(characters.id, room.characterId))
      if (c) {
        const previous = room.userPersona ?? await getPersona(userId)
        const entries = officialIntro(c, c.sampleDialogue)
        const before = introMessages(sessionId, entries, undefined, { scene: room.openingScene ?? undefined, userName: previous?.name })
        for (const line of before) {
          if (line.role !== 'narrator' || line.kind !== 'text') continue
          await tx.update(messages).set({ content: line.content }).where(and(eq(messages.sessionId, sessionId), eq(messages.turnIndex, line.turnIndex), eq(messages.role, 'narrator'), or(eq(messages.content, line.content), eq(messages.content, personalize(line.content, previous?.name)))))
        }
      }
    }
    await tx.update(roleplaySessions).set({ userPersona: persona }).where(eq(roleplaySessions.id, room.id))
    return { ok: true as const }
  })
}
