import { randomBytes } from 'node:crypto'
import { cookies } from 'next/headers'
import { and, eq, gt, isNull } from 'drizzle-orm'
import { db, adminSessions, adminUsers, verifyPassword } from '@miro/db'
import { can, type AdminPermission, type AdminRole } from '@miro/domain'

/** 사용자 앱과 다른 쿠키·테이블. 두 인증은 어떤 경로로도 섞이지 않는다. */
const COOKIE = 'miro_admin'

export type Admin = { id: string; email: string; role: AdminRole }

export async function currentAdmin(): Promise<Admin | null> {
  const token = (await cookies()).get(COOKIE)?.value
  if (!token) return null
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
