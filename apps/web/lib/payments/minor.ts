import { eq } from 'drizzle-orm'
import { db, users } from '@miro/db'

/** 민법상 미성년(만 19세 미만) — 생년월일이 없으면(예전 가입자) 성인으로 본다. 11/12 청소년 가입 개방. */
export function minorOn(birthDate: string | null | undefined, today = new Date()): boolean {
  if (!birthDate) return false
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number]
  const age = today.getUTCFullYear() - y - (today.getUTCMonth() + 1 < m || (today.getUTCMonth() + 1 === m && today.getUTCDate() < d) ? 1 : 0)
  return age < 19
}

/**
 * 결제 때 법정대리인 동의 체크를 받을 사람인가.
 * 11/14 사용자: 성인 인증(언베일 최초 인증)을 한 번 마쳤으면 묻지 않는다. 인증 전이면 생년월일로 보고,
 * 생년월일도 없으면(11/13부터 가입 때 받지 않음) 나이를 모르니 묻는다.
 */
export async function isMinor(userId: string): Promise<boolean> {
  const [u] = await db.select({ birth: users.birthDate, verified: users.adultVerifiedAt }).from(users).where(eq(users.id, userId)).limit(1)
  if (!u || u.verified) return false
  return u.birth ? minorOn(u.birth) : true
}

