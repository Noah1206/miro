import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { eq, and, isNull, gt } from 'drizzle-orm'
import { db, users, accounts, authSessions, hashPassword, verifyPassword } from '@miro/db'

const COOKIE = 'miro_session'
const SESSION_DAYS = 30

export type SessionUser = {
  id: string
  email: string
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
 */
export async function currentUser(): Promise<SessionUser | null> {
  const jar = await cookies()
  const token = jar.get(COOKIE)?.value
  if (!token) return null

  const rows = await db
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
    .limit(1)

  return rows[0] ?? null
}

export async function requireUser(): Promise<SessionUser> {
  const user = await currentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

/* ---------- signup / login ---------- */

export async function signup(email: string, password: string): Promise<SessionUser> {
  const existing = await db.select({ id: users.id }).from(users)
    .where(eq(users.email, email)).limit(1)
  if (existing.length > 0) throw new Error('EMAIL_TAKEN')

  const [user] = await db.insert(users).values({ email }).returning()
  if (!user) throw new Error('SIGNUP_FAILED')

  await db.insert(accounts).values({
    userId: user.id,
    provider: 'credentials',
    providerAccountId: hashPassword(password),
  })

  await createSession(user.id)
  return {
    id: user.id, email: user.email, displayName: user.displayName,
    plan: user.plan, adultVerifiedAt: user.adultVerifiedAt,
  }
}

export async function login(email: string, password: string): Promise<SessionUser> {
  const rows = await db
    .select({ user: users, credential: accounts.providerAccountId })
    .from(users)
    .innerJoin(accounts, and(
      eq(accounts.userId, users.id),
      eq(accounts.provider, 'credentials'),
    ))
    .where(and(eq(users.email, email), isNull(users.deletedAt)))
    .limit(1)

  const row = rows[0]
  if (!row || !verifyPassword(password, row.credential)) {
    throw new Error('INVALID_CREDENTIALS')
  }

  await createSession(row.user.id)
  return {
    id: row.user.id, email: row.user.email, displayName: row.user.displayName,
    plan: row.user.plan, adultVerifiedAt: row.user.adultVerifiedAt,
  }
}
