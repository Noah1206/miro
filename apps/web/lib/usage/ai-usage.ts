import { and, count, eq, gte, isNotNull, sql } from 'drizzle-orm'
import { db, aiUsage } from '@miro/db'
import { setAIUsageSink, type AIUsageRecord } from '@miro/providers'
import { observe } from '@/lib/observe'

/**
 * Usage Manager + Budget Guard.
 * 모든 AI 호출은 Orchestrator 를 지나며 여기 기록된다 (성공·실패 모두). 토큰·모델·추정 비용이 한 표에 쌓인다.
 * Budget Guard 는 그 표에서 오늘 쓴 만큼을 세어 문턱을 넘으면 호출 전에 막는다 — 무료 등급이든 유료든 같은 코드다.
 */

/** 모델별 100만 토큰당 달러. 없는 모델은 0 — 무료 등급(Gemini/Cloudflare)이 기본이다. 유료 모델은 여기에 한 줄 추가. */
const PRICE_PER_MTOK: Record<string, { input: number; output: number }> = {
  'anthropic/claude-haiku-4-5': { input: 1, output: 5 },
  'anthropic/claude-sonnet-5': { input: 2, output: 10 },
  'anthropic/claude-opus-5': { input: 5, output: 25 },
}
export function estimateCost(model: string, inputTokens: number | null, outputTokens: number | null): number {
  const p = PRICE_PER_MTOK[model]
  if (!p) return 0
  return ((inputTokens ?? 0) * p.input + (outputTokens ?? 0) * p.output) / 1_000_000
}

let installed = false
/** Orchestrator 에 기록기를 꽂는다. 여러 번 불러도 한 번만. */
export function installAIUsageSink(): void {
  if (installed) return
  installed = true
  setAIUsageSink(recordAIUsage)
}

export async function recordAIUsage(r: AIUsageRecord): Promise<void> {
  try {
    await db.insert(aiUsage).values({
      userId: r.userId, sessionId: r.sessionId, task: r.task, provider: r.provider, model: r.model,
      inputTokens: r.inputTokens, outputTokens: r.outputTokens, estimatedCost: String(estimateCost(r.model, r.inputTokens, r.outputTokens)),
      latencyMs: r.latencyMs, ok: r.ok, error: r.error,
    })
  } catch (e) {
    observe('ai.usage_write_failed', { error: (e as Error).message })
  }
}

/* ───────────── Budget Guard ───────────── */

export type BudgetKind = 'user' | 'ip' | 'global_requests' | 'global_cost'

export class BudgetExceededError extends Error {
  constructor(public readonly kind: BudgetKind) { super(`ai budget exceeded: ${kind}`) }
}

const num = (k: string): number | null => { const n = Number(process.env[k]); return Number.isFinite(n) && n > 0 ? n : null }
/** 비어 있으면 그 한도는 없다. 프로덕션에서는 Free/Pro 창(usage_windows)이 사용자 한도를 맡고, 여기는 전체 예산만 남겨도 된다. */
export const BUDGET = {
  userPerDay: () => num('AI_USER_DAILY_LIMIT'),
  globalRequestsPerDay: () => num('AI_DAILY_REQUEST_LIMIT'),
  globalCostPerDay: () => num('AI_DAILY_BUDGET'),
  ipPerMinute: () => num('AI_IP_RATE_LIMIT_PER_MINUTE'),
}

/** 한국 시간 기준 오늘 0시 — "내일 다시" 가 사용자 감각과 맞아야 한다. */
export function startOfDayKST(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3_600_000)
  kst.setUTCHours(0, 0, 0, 0)
  return new Date(kst.getTime() - 9 * 3_600_000)
}

/** 호출 전에 부른다. 넘으면 throw — AI 는 불리지 않는다. */
export async function assertAIBudget(opts: { userId: string | null; ip?: string | null }): Promise<void> {
  const day = startOfDayKST()
  const [userLimit, reqLimit, costLimit, ipLimit] = [BUDGET.userPerDay(), BUDGET.globalRequestsPerDay(), BUDGET.globalCostPerDay(), BUDGET.ipPerMinute()]
  if (!userLimit && !reqLimit && !costLimit && !ipLimit) return

  const [[user], [global], [perIp]] = await Promise.all([
    userLimit && opts.userId
      ? db.select({ n: count() }).from(aiUsage).where(and(eq(aiUsage.userId, opts.userId), eq(aiUsage.task, 'character_response'), gte(aiUsage.createdAt, day)))
      : Promise.resolve([{ n: 0 }]),
    reqLimit || costLimit
      ? db.select({ n: count(), cost: sql<string>`coalesce(sum(${aiUsage.estimatedCost}), 0)` }).from(aiUsage).where(gte(aiUsage.createdAt, day))
      : Promise.resolve([{ n: 0, cost: '0' }]),
    ipLimit && opts.ip
      ? db.select({ n: count() }).from(aiUsage).where(and(eq(aiUsage.ip, opts.ip), isNotNull(aiUsage.ip), gte(aiUsage.createdAt, new Date(Date.now() - 60_000))))
      : Promise.resolve([{ n: 0 }]),
  ])
  if (userLimit && (user?.n ?? 0) >= userLimit) throw new BudgetExceededError('user')
  if (ipLimit && (perIp?.n ?? 0) >= ipLimit) throw new BudgetExceededError('ip')
  if (reqLimit && (global?.n ?? 0) >= reqLimit) throw new BudgetExceededError('global_requests')
  if (costLimit && Number((global as { cost?: string })?.cost ?? 0) >= costLimit) throw new BudgetExceededError('global_cost')
}

/** IP 는 Orchestrator 가 모른다 — 요청 경계에서 마지막 기록에 붙인다. 없으면 조용히 넘어간다. */
export async function tagLastUsageWithIp(userId: string, ip: string | null): Promise<void> {
  if (!ip) return
  try {
    await db.execute(sql`update ai_usage set ip = ${ip} where id = (select id from ai_usage where user_id = ${userId} order by created_at desc limit 1)`)
  } catch { /* 태그 실패는 무시 */ }
}
