import { createHash } from 'node:crypto'
import { eq, inArray, sql } from 'drizzle-orm'
import { db, aiUsage, aiBudgetCounters } from '@miro/db'
import { setAIUsageSink, setAIBudgetGuard, setAILeaseGuard, modelCost, type AIUsageRecord, type BudgetGuard } from '@miro/providers'
import { databaseAILeaseGuard } from '@/lib/ai/gateway'
import { effectivePlan } from './guard'
import { afterResponse } from '@/lib/defer'
import { observe } from '@/lib/observe'

export type BudgetKind = 'user' | 'user_monthly' | 'ip' | 'global_requests' | 'global_cost' | 'provider' | 'model' | 'plan' | 'unknown_price'
export class BudgetExceededError extends Error {
  constructor(public readonly kind: BudgetKind) { super(`ai budget exceeded: ${kind}`) }
}
export function startOfDayKST(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3_600_000); kst.setUTCHours(0, 0, 0, 0)
  return new Date(kst.getTime() - 9 * 3_600_000)
}
/** 월간 창과 같은 기준(KST 달력 월)을 쓴다 — 사용량 초기화와 남용 한도가 어긋나지 않게. */
export function startOfMonthKST(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3_600_000)
  return new Date(Date.UTC(kst.getUTCFullYear(), kst.getUTCMonth(), 1) - 9 * 3_600_000)
}
const configured = (name: string, fallback?: number) => {
  const raw = process.env[name]
  if (!raw) return fallback
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid budget configuration')
  return n
}
type Limit = { requests?: number; cost?: number }
export function budgetPolicy(): Record<string, Limit> {
  const custom = JSON.parse(process.env.MIRO_BUDGET_POLICY || '{}') as Record<string, Limit>
  for (const v of Object.values(custom)) for (const n of Object.values(v)) if (typeof n !== 'number' || !Number.isFinite(n) || n < 0) throw new Error('invalid budget policy')
  return {
    global: { requests: configured('AI_DAILY_REQUEST_LIMIT', 1000), cost: configured('AI_DAILY_BUDGET', 0) },
    user: { requests: configured('AI_USER_DAILY_LIMIT', 200) },
    ip: { requests: configured('AI_IP_RATE_LIMIT_PER_MINUTE', 20) },
    /**
     * 한 사용자가 한 달에 태울 수 있는 원가 상한. 무료 대화는 월간 사용량을 차감하지 않으므로
     * 이 상한이 없으면 한 계정이 하루 한도를 매일 채워 원가를 끝없이 늘릴 수 있다.
     * 일 단위 한도와 달리 월초에만 초기화된다.
     */
    user_monthly: { cost: configured('AI_USER_MONTHLY_BUDGET', 3), requests: configured('AI_USER_MONTHLY_LIMIT', 3000) },
    ...custom,
  }
}
/** Hash at request creation; never attach IP to an arbitrary user's latest record. */
export function ipHash(ip?: string | null): string | null { return ip ? createHash('sha256').update(ip).digest('hex') : null }

export const productionBudgetGuard: BudgetGuard = {
  async authorize(request, model, context, attemptId) {
    // UTF-8 byte count is a conservative input token reservation, not a user-facing usage unit.
    const estimate = request.costCeilingUSD ?? modelCost(model, Buffer.byteLength(request.system + request.prompt, 'utf8') + 512, request.maxTokens ?? model.maxOutputTokens)
    if (estimate !== null && (!Number.isFinite(estimate) || estimate < 0)) throw new Error('invalid cost ceiling')
    if (estimate === null) return { allowed: false, reason: 'unknown_price' }
    const plan = context.userId ? await effectivePlan(context.userId) : 'free'
    const policy = budgetPolicy(), day = startOfDayKST().toISOString(), minute = Math.floor(Date.now() / 60_000)
    const month = startOfMonthKST().toISOString()
    const scopes = [ ['global', 'global'], ['provider:' + model.provider, 'provider'], ['model:' + model.id, 'model'], ['plan:' + plan, 'plan'],
      ...(context.userId ? [['user:' + context.userId, 'user'], ['user_monthly:' + context.userId, 'user_monthly']] : []),
      ...(context.ip ? [['ip:' + ipHash(context.ip), 'ip']] : []) ]
    const window = (category: string) => category === 'ip' ? String(minute) : category === 'user_monthly' ? month : day
    const entries = scopes.map(([scope, category]) => ({ key: window(category!) + ':' + scope!, limit: policy[scope!] ?? policy[category!] ?? {}, category: category!,
      // 월간 카운터는 달이 끝나기 전에 지워지면 한도가 초기화된다 — 넉넉히 살려 둔다.
      ttlMs: category === 'user_monthly' ? 40 * 86400_000 : 2 * 86400_000 })).sort((a,b) => a.key.localeCompare(b.key))
    try {
      await db.transaction(async tx => {
        /**
         * 카운터 일곱 개를 한 문장으로 올리고 결과로 판정한다. 한도를 넘긴 것이 있으면 던져서
         * 트랜잭션째 되돌린다 — 키마다 잠그고·읽고·올리던 세 문장씩(왕복 21회)과 같은 결과다.
         * 여러 행을 한 UPDATE 로 잠그면 동시 요청도 같은 순서로 행을 지나므로 서로 엇갈리지 않는다.
         */
        await tx.insert(aiBudgetCounters).values(entries.map(e => ({ key: e.key, expiresAt: new Date(Date.now() + e.ttlMs) }))).onConflictDoNothing()
        const counters = await tx.update(aiBudgetCounters)
          .set({ requests: sql`${aiBudgetCounters.requests} + 1`, cost: sql`${aiBudgetCounters.cost} + ${estimate}` })
          .where(inArray(aiBudgetCounters.key, entries.map(e => e.key)))
          .returning({ key: aiBudgetCounters.key, requests: aiBudgetCounters.requests, cost: aiBudgetCounters.cost })
        const byKey = new Map(counters.map(c => [c.key, c]))
        for (const entry of entries) {
          const counter = byKey.get(entry.key)!
          const overCost = estimate > 0 && entry.limit.cost !== undefined && Number(counter.cost) > entry.limit.cost + 1e-10
          if ((entry.limit.requests !== undefined && counter.requests > entry.limit.requests) || overCost) {
            throw new BudgetExceededError(entry.category === 'global' ? (overCost ? 'global_cost' : 'global_requests') : entry.category as BudgetKind)
          }
        }
        await tx.insert(aiUsage).values({ attemptId, traceId: context.traceId, requestId: context.requestId,
          userId: context.userId, sessionId: context.sessionId, ip: ipHash(context.ip), task: request.task,
          provider: model.provider, model: model.providerModelId, modelId: model.id, modelVersion: model.version,
          promptVersion: request.promptVersion, status: 'reserved', reservedCost: String(estimate), budgetKeys: entries.map(e => e.key), ok: false, latencyMs: 0 })
      })
      return { allowed: true, reservationId: attemptId, maxUsageUnits: context.usageUnits ?? 0 }
    } catch (e) { if (e instanceof BudgetExceededError) return { allowed: false, reason: e.kind }; throw e }
  },
}
/**
 * 정산은 응답 뒤에 한다 — 유저가 답을 기다리는 동안 원가 기록 왕복을 세지 않는다.
 * 예약(authorize)은 여전히 호출 전에 막으므로 한도는 그대로 지켜진다. 기록 실패는 턴을 깨지 않고 남긴다.
 */
export function installAIUsageSink(): void {
  setAIUsageSink(r => afterResponse(() => recordAIUsage(r).catch(e => observe('ai.usage_record_failed', { attemptId: r.attemptId, error: (e as Error).message }))))
  setAIBudgetGuard(productionBudgetGuard)
  setAILeaseGuard(process.env.MIRO_AI_DB_LEASES === '1' ? databaseAILeaseGuard : undefined)
}

export async function recordAIUsage(r: AIUsageRecord): Promise<void> {
  await db.transaction(async tx => {
    const [pending] = r.attemptId ? await tx.select().from(aiUsage).where(eq(aiUsage.attemptId, r.attemptId)).for('update') : []
    if (pending?.status === 'completed') return
    if (pending) {
      // Missing usage (timeout, transport failure): keep the full reservation; a failed request may still cost money.
      const charged = r.estimatedCost ?? Number(pending.reservedCost)
      const adjustment = charged - Number(pending.reservedCost)
      // 예약과 실제의 차이만 카운터에 반영한다. 차이가 없으면 쓰지 않는다 — 한 문장으로 모든 키를 고친다.
      if (adjustment !== 0 && pending.budgetKeys.length) await tx.update(aiBudgetCounters).set({ cost: sql`greatest(0, ${aiBudgetCounters.cost} + ${adjustment})` }).where(inArray(aiBudgetCounters.key, pending.budgetKeys))
      await tx.update(aiUsage).set({ status: 'completed', estimatedCost: r.estimatedCost == null ? null : String(r.estimatedCost), actualCost: r.actualCost == null ? null : String(r.actualCost),
        inputTokens: r.inputTokens, outputTokens: r.outputTokens, usageUnits: r.usageUnits ?? 0, latencyMs: r.latencyMs, ok: r.ok, error: r.error,
        fallbackUsed: r.fallbackUsed ?? false, shadow: r.shadow ?? false }).where(eq(aiUsage.id, pending.id))
    } else {
      await tx.insert(aiUsage).values({ ...r, estimatedCost: r.estimatedCost == null ? null : String(r.estimatedCost), actualCost: r.actualCost == null ? null : String(r.actualCost), ip: ipHash(r.ip) })
    }
  })
}
