import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, adminSessions, adminUsers, verifyPassword } from '@miro/db'
import { can, type AdminPermission, type AdminRole } from '@miro/domain'

/** 사용자 앱과 다른 쿠키·테이블. 두 인증은 어떤 경로로도 섞이지 않는다. */
const COOKIE = 'miro_admin'

export type Admin = { id: string; email: string; role: AdminRole }

/**
 * 운영자 콘솔 접근은 Vercel Authentication(배포 보호 'all', 10/20)이 막는다 — Vercel 팀 계정으로 로그인된 브라우저만 여기까지 온다.
 * 그래서 ADMIN_TRUST_VERCEL_AUTH=1 이면 콘솔 안에서 이메일·비밀번호를 다시 묻지 않고 운영자(superadmin) 로 본다.
 * 이 플래그는 배포 보호가 켜진 프로젝트에서만 켜야 한다. 꺼져 있으면 예전처럼 쿠키 세션이 필요하다.
 */
async function trustedOperator(): Promise<Admin | null> {
  if (process.env.ADMIN_TRUST_VERCEL_AUTH !== '1') return null
  const rows = await db.select({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role })
    .from(adminUsers).where(and(eq(adminUsers.role, 'superadmin'), isNull(adminUsers.disabledAt))).orderBy(adminUsers.createdAt).limit(1)
  return rows[0] ?? null
}

export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return trustedOperator()
  const rows = await db.select({ id: adminUsers.id, email: adminUsers.email, role: adminUsers.role })
    .from(adminSessions).innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
    .where(and(eq(adminSessions.token, token), gt(adminSessions.expiresAt, new Date()), isNull(adminUsers.disabledAt)))
    .limit(1)
  return rows[0] ?? null
}

export async function requireAdmin(permission?: AdminPermission): Promise<Admin> {
  const admin = await currentAdmin()
  if (!admin) throw new Error('UNAUTHORIZED')
  if (permission && !can(admin.role, permission)) throw new Error('FORBIDDEN')
  return admin
}

export async function login(email: string, password: string): Promise<Admin | null> {
  const [a] = await db.select().from(adminUsers).where(and(eq(adminUsers.email, email), isNull(adminUsers.disabledAt))).limit(1)
  if (!a || !verifyPassword(password, a.passwordHash)) return null
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 12 * 3600_000)
  await db.insert(adminSessions).values({ adminId: a.id, token, expiresAt })
  ;(await cookies()).set(COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: process.env.NODE_ENV === 'production', path: '/', expires: expiresAt })
  return { id: a.id, email: a.email, role: a.role }
}

export async function logout() {
  const jar = await cookies(); const token = jar.get(COOKIE)?.value
  if (token) await db.delete(adminSessions).where(eq(adminSessions.token, token))
  jar.delete(COOKIE)
}
