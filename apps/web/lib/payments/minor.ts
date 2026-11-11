import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'

/** 민법상 미성년(만 19세 미만) — 생년월일이 없으면(예전 가입자) 성인으로 본다. 11/12 청소년 가입 개방. */
export function minorOn(birthDate: string | null | undefined, today = new Date()): boolean {
  if (!birthDate) return false
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number]
  const age = today.getUTCFullYear() - y - (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d) ? 1 : 0)
  return age < 19
}

export async function isMinor(userId: string): Promise<boolean> {
  const [u] = await db.select({ birth: users.birthDate }).from(users).where(eq(users.id, userId)).limit(1)
  return minorOn(u?.birth)
}

