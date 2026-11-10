import { and, eq, inArray } from 'drizzle-orm'
import { db, rechargeGrants } from '@miro/db'
import { ATTENDANCE_GRANT } from '@miro/config'

/**
 * 11/10 출석 체크 — 프로필의 버튼을 눌러야 그날 1,500토큰(그날 KST 자정에 소멸). 7일 연속 출석마다 1,500 추가(7일 유효).
 * 지급은 충전 잔액(recharge_grants)에 넣는다 — (provider, '사용자:KST 날짜') 고유 색인이 하루 두 번 지급을 막는다(연타·동시 요청 포함).
 */
const KST = 9 * 3_600_000, DAY = 86_400_000
const LOOKBACK = 70
const kstDay = (t: number) => new Date(t + KST).toISOString().slice(0, 10)
const ref = (userId: string, day: string) => `${userId}:${day}`

export type Attendance = { checkedToday: boolean; streak: number }
export type CheckIn = Attendance & { granted: number; bonus: boolean }

/** 연속 출석 일수 — 오늘 출석했으면 오늘부터, 아니면 어제부터 거꾸로 센다(오늘 아직 안 눌렀다고 끊긴 게 아니다). */
export async function attendanceStatus(userId: string, now = new Date()): Promise<Attendance> {
  const days = Array.from({ length: LOOKBACK }, (_, i) => kstDay(now.getTime() - i * DAY))
  const rows = await db.select({ ref: rechargeGrants.externalRef }).from(rechargeGrants)
    .where(and(eq(rechargeGrants.userId, userId), eq(rechargeGrants.provider, 'daily'), inArray(rechargeGrants.externalRef, days.map(d => ref(userId, d)))))
  const seen = new Set(rows.map(r => r.ref))
  const checkedToday = seen.has(ref(userId, days[0]!))
  let streak = 0
  for (const day of days.slice(checkedToday ? 0 : 1)) { if (!seen.has(ref(userId, day))) break; streak++ }
  return { checkedToday, streak }
}

export async function checkIn(userId: string, now = new Date()): Promise<CheckIn> {
  const today = kstDay(now.getTime())
  const kst = new Date(now.getTime() + KST)
  const midnight = new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate() + 1) - KST)
  const [daily] = await db.insert(rechargeGrants).values({ userId, amount: ATTENDANCE_GRANT.daily, source: 'grant', provider: 'daily',
    externalRef: ref(userId, today), expiresAt: midnight }).onConflictDoNothing().returning({ id: rechargeGrants.id })
  const status = await attendanceStatus(userId, now)
  if (!daily) return { ...status, granted: 0, bonus: false }
  // 7일째·14일째… 연속 출석한 날 한 번 더(같은 날 두 번은 고유 색인이 막는다).
  const bonus = status.streak > 0 && status.streak % ATTENDANCE_GRANT.streakDays === 0 && (await db.insert(rechargeGrants).values({ userId,
    amount: ATTENDANCE_GRANT.weeklyBonus, source: 'grant', provider: 'attendance_week', externalRef: ref(userId, today),
    expiresAt: new Date(now.getTime() + ATTENDANCE_GRANT.bonusValidDays * DAY) }).onConflictDoNothing().returning({ id: rechargeGrants.id })).length > 0
  return { ...status, granted: ATTENDANCE_GRANT.daily + (bonus ? ATTENDANCE_GRANT.weeklyBonus : 0), bonus }
}
