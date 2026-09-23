import { randomBytes } from 'node:crypto'
import { cache } from 'react'
import { cookies } from 'next/headers'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { db, users, accounts, authSessions } from '@miro/db'
import { measured } from '@/lib/observe'

const COOKIE = 'miro_session'
const SESSION_DAYS = 30

export type SessionUser = {
  id: string
  email: string | null
  displayName: string | null
  plan: 'free' | 'pro'
  adultVerifiedAt: Date | null
}

/* ---------- session ---------- */

export async function createSession(userId: string): Promise<void> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000)

  await db.insert(authSessions).values({ userId, token, expiresAt })

  const jar = await cookies()
  jar.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  })
}

export async function destroySession(): Promise<void> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (token) await db.delete(authSessions).where(eq(authSessions.token, token))
  jar.delete(COOKIE)
}

/**
 * 현재 로그인 사용자. 삭제된 계정(deletedAt)은 로그인 상태로 취급하지 않는다
 * — 명세서 12.1: 삭제 완료 후 동일 계정으로 접근할 수 없어야 한다.
 *
 * 한 요청 안에서는 한 번만 읽는다(React cache) — 레이아웃과 페이지가 각자 불러 같은 쿼리가 두 번 나가고 있었다.
 * 세션을 만들거나 지우는 핸들러는 그 뒤에 다시 읽지 않으므로(callback·delete·alpha) 요청 단위 캐시가 안전하다.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null

  const rows = await measured('auth.session_db', () => db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      plan: users.plan,
      adultVerifiedAt: users.adultVerifiedAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(users.id, authSessions.userId))
    .where(and(
      eq(authSessions.token, token),
      gt(authSessions.expiresAt, new Date()),
      isNull(users.deletedAt),
    ))
    .limit(1))

  return rows[0] ?? null
})

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

/* ---------- social sign-in ---------- */

export type SignInResult = { ok: true; userId: string; isNew: boolean } | { ok: false; reason: 'deleted' }

/**
 * 소셜 프로필로 로그인. 계정이 없으면 만든다 — 별도 가입 절차는 없다.
 * (provider, providerAccountId) 가 열쇠. 같은 이메일의 기존 사용자가 있으면 그 사용자에 제공자를 연결한다.
 * 삭제된 계정은 같은 소셜 계정으로 다시 들어올 수 없다 (명세서 12.1).
 */
export async function signInWithProfile(p: { provider: string; providerAccountId: string; email: string | null; name: string | null }): Promise<SignInResult> {
  const [linked] = await db.select({ user: users }).from(accounts).innerJoin(users, eq(users.id, accounts.userId))
    .where(and(eq(accounts.provider, p.provider), eq(accounts.providerAccountId, p.providerAccountId))).limit(1)
  if (linked) {
    if (linked.user.deletedAt) return { ok: false, reason: 'deleted' }
    await createSession(linked.user.id)
    return { ok: true, userId: linked.user.id, isNew: false }
  }

  let userId: string | null = null
  if (p.email) {
    const [byEmail] = await db.select({ id: users.id, deletedAt: users.deletedAt }).from(users).where(eq(users.email, p.email)).limit(1)
    if (byEmail?.deletedAt) return { ok: false, reason: 'deleted' }
    userId = byEmail?.id ?? null
  }
  const isNew = userId === null
  if (!userId) {
    const [u] = await db.insert(users).values({ email: p.email, displayName: p.name }).returning({ id: users.id })
    userId = u!.id
  }
  await db.insert(accounts).values({ userId, provider: p.provider, providerAccountId: p.providerAccountId })
  await createSession(userId)
  return { ok: true, userId, isNew }
}
