import { and, count, eq, gte } from 'drizzle-orm'
import { db, alphaAiCalls } from '@miro/db'

/**
 * 무료 비용 보호. 한도에 걸리면 AI 를 부르지 않는다 — 검사는 호출 전에, 기록은 호출 시도마다.
 * 세 한도 모두 alpha_ai_calls 한 표에서 센다.
 */
export type LimitKind = 'user' | 'ip' | 'global'

const num = (k: string, fallback: number) => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : fallback }
export const LIMITS = {
  userPerDay: () => num('USER_DAILY_MESSAGE_LIMIT', 15),
  globalPerDay: () => num('DAILY_AI_REQUEST_LIMIT', 300),
  ipPerMinute: () => num('IP_RATE_LIMIT_PER_MINUTE', 8),
}

/** 한국 시간 기준 오늘 0시 — "내일 다시" 가 사용자 감각과 맞아야 한다. */
export function startOfDayKST(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3_600_000)
  kst.setUTCHours(0, 0, 0, 0)
  return new Date(kst.getTime() - 9 * 3_600_000)
}

export async function checkLimits(sessionId: string, ip: string | null): Promise<LimitKind | null> {
  const day = startOfDayKST()
  const minuteAgo = new Date(Date.now() - 60_000)
  const [[user], [global], [perIp]] = await Promise.all([
    db.select({ n: count() }).from(alphaAiCalls).where(and(eq(alphaAiCalls.sessionId, sessionId), gte(alphaAiCalls.createdAt, day))),
    db.select({ n: count() }).from(alphaAiCalls).where(gte(alphaAiCalls.createdAt, day)),
    ip ? db.select({ n: count() }).from(alphaAiCalls).where(and(eq(alphaAiCalls.ip, ip), gte(alphaAiCalls.createdAt, minuteAgo))) : Promise.resolve([{ n: 0 }]),
  ])
  if ((user?.n ?? 0) >= LIMITS.userPerDay()) return 'user'
  if ((perIp?.n ?? 0) >= LIMITS.ipPerMinute()) return 'ip'
  if ((global?.n ?? 0) >= LIMITS.globalPerDay()) return 'global'
  return null
}

export async function recordCall(sessionId: string, ip: string | null): Promise<void> {
  await db.insert(alphaAiCalls).values({ sessionId, ip })
}
