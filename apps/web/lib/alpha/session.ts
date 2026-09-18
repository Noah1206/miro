import { headers } from 'next/headers'
import { and, asc, eq, isNull } from 'drizzle-orm'
import { db, characters, messages, roleplaySessions, users } from '@miro/db'
import { createSession, currentUser } from '@/lib/auth'
import { createRoleplaySession } from '@/lib/simulation/start'
import { YUJIN } from './character'

/**
 * 알파 세션 = 게스트 계정 + 유진과의 정식 역할극 세션. 별도 표가 없다.
 * 로그인 쿠키(auth_sessions)가 곧 체험 쿠키다 — 나중에 소셜 로그인으로 같은 계정을 이어붙일 수 있다.
 */
export type AlphaSession = { userId: string; sessionId: string; turnCount: number }
export type AlphaMessage = { role: 'user' | 'character'; text: string; at: string; reality?: boolean }

export async function clientIp(): Promise<string | null> {
  const h = await headers()
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() ?? h.get('x-real-ip') ?? null
}

/** 쿠키의 계정이 유진과 진행 중인 세션. 없으면 null — 호출자가 /alpha 로 돌려보낸다. */
export async function getAlphaSession(): Promise<AlphaSession | null> {
  const user = await currentUser()
  if (!user) return null
  const [row] = await db.select({ id: roleplaySessions.id, turnCount: roleplaySessions.turnCount })
    .from(roleplaySessions)
    .innerJoin(characters, eq(characters.id, roleplaySessions.characterId))
    .where(and(
      eq(roleplaySessions.userId, user.id), eq(characters.slug, YUJIN.slug),
      eq(roleplaySessions.status, 'active'), isNull(roleplaySessions.deletedAt),
    )).limit(1)
  return row ? { userId: user.id, sessionId: row.id, turnCount: row.turnCount } : null
}

/** 체험 시작 — 게스트 계정을 만들고(이미 로그인했으면 그 계정), 유진의 첫 메시지가 와 있는 세션을 연다. */
export async function createAlphaSession(): Promise<AlphaSession> {
  const user = await currentUser()
  let userId = user?.id
  if (!userId) {
    const [guest] = await db.insert(users).values({ isGuest: true }).returning({ id: users.id })
    userId = guest!.id
    await createSession(userId)
  }
  const s = await createRoleplaySession(userId, YUJIN.slug, { opening: YUJIN.opening })
  return { userId, sessionId: s.sessionId, turnCount: 0 }
}

/** 화면에 그릴 대화. 정식 messages 표에서 읽는다 — 선연락은 reality 로 표시된다. */
export async function loadAlphaMessages(sessionId: string): Promise<AlphaMessage[]> {
  const rows = await db.select({ role: messages.role, kind: messages.kind, content: messages.content, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.sessionId, sessionId), isNull(messages.hiddenAt)))
    .orderBy(asc(messages.turnIndex), asc(messages.createdAt))
  return rows
    .filter((m) => m.role === 'user' || m.role === 'character')
    .map((m) => ({ role: m.role as 'user' | 'character', text: m.content, at: m.createdAt.toISOString(), reality: m.kind === 'reality_message' || undefined }))
}
