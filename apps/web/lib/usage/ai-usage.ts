import { createHash } from 'node:crypto'
import { eq, sql } from 'drizzle-orm'
import { db, aiUsage, aiBudgetCounters } from '@miro/db'
import { setAIUsageSink, setAIBudgetGuard, modelCost, type AIUsageRecord, type BudgetGuard } from '@miro/providers'
import { effectivePlan } from './guard'

export type BudgetKind = 'user' | 'ip' | 'global_requests' | 'global_cost' | 'provider' | 'model' | 'plan' | 'unknown_price'
export class BudgetExceededError extends Error {
  constructor(public readonly kind: BudgetKind) { super(`ai budget exceeded: ${kind}`) }
}
export function startOfDayKST(now = new Date()): Date {
  const kst = new Date(now.getTime() + 9 * 3_600_000); kst.setUTCHours(0, 0, 0, 0)
  return new Date(kst.getTime() - 9 * 3_600_000)
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
  return { global: { requests: configured('AI_DAILY_REQUEST_LIMIT', 1000), cost: configured('AI_DAILY_BUDGET', 0) }, user: { requests: configured('AI_USER_DAILY_LIMIT', 200) }, ip: { requests: configured('AI_IP_RATE_LIMIT_PER_MINUTE', 20) }, ...custom }
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
    const scopes = [ ['global', 'global'], ['provider:' + model.provider, 'provider'], ['model:' + model.id, 'model'], ['plan:' + plan, 'plan'],
      ...(context.userId ? [['user:' + context.userId, 'user']] : []), ...(context.ip ? [['ip:' + ipHash(context.ip), 'ip']] : []) ]
    const entries = scopes.map(([scope, category]) => ({ key: (category === 'ip' ? minute : day) + ':' + scope!, limit: policy[scope!] ?? policy[category!] ?? {}, category: category! })).sort((a,b) => a.key.localeCompare(b.key))
    try {
      await db.transaction(async tx => {
        for (const entry of entries) {
          await tx.insert(aiBudgetCounters).values({ key: entry.key, expiresAt: new Date(Date.now() + 2 * 86400_000) }).onConflictDoNothing()
          const [counter] = await tx.select().from(aiBudgetCounters).where(eq(aiBudgetCounters.key, entry.key)).for('update')
          if ((entry.limit.requests !== undefined && counter!.requests + 1 > entry.limit.requests) || (estimate > 0 && entry.limit.cost !== undefined && Number(counter!.cost) + estimate > entry.limit.cost + 1e-10)) {
            throw new BudgetExceededError(entry.category === 'global' ? (estimate > 0 && entry.limit.cost !== undefined && Number(counter!.cost) + estimate > entry.limit.cost + 1e-10 ? 'global_cost' : 'global_requests') : entry.category as BudgetKind)
          }
          await tx.update(aiBudgetCounters).set({ requests: sql`${aiBudgetCounters.requests} + 1`, cost: sql`${aiBudgetCounters.cost} + ${estimate}` }).where(eq(aiBudgetCounters.key, entry.key))
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
export function installAIUsageSink(): void { setAIUsageSink(recordAIUsage); setAIBudgetGuard(productionBudgetGuard) }

export async function recordAIUsage(r: AIUsageRecord): Promise<void> {
  await db.transaction(async tx => {
    const [pending] = r.attemptId ? await tx.select().from(aiUsage).where(eq(aiUsage.attemptId, r.attemptId)).for('update') : []
    if (pending?.status === 'completed') return
    if (pending) {
      // Missing usage (timeout, transport failure): keep the full reservation; a failed request may still cost money.
      const charged = r.estimatedCost ?? Number(pending.reservedCost)
      const adjustment = charged - Number(pending.reservedCost)
      for (const key of [...pending.budgetKeys].sort()) await tx.update(aiBudgetCounters).set({ cost: sql`greatest(0, ${aiBudgetCounters.cost} + ${adjustment})` }).where(eq(aiBudgetCounters.key, key))
      await tx.update(aiUsage).set({ status: 'completed', estimatedCost: r.estimatedCost == null ? null : String(r.estimatedCost), actualCost: r.actualCost == null ? null : String(r.actualCost),
        inputTokens: r.inputTokens, outputTokens: r.outputTokens, usageUnits: r.usageUnits ?? 0, latencyMs: r.latencyMs, ok: r.ok, error: r.error,
        fallbackUsed: r.fallbackUsed ?? false, shadow: r.shadow ?? false }).where(eq(aiUsage.id, pending.id))
    } else {
      await tx.insert(aiUsage).values({ ...r, estimatedCost: r.estimatedCost == null ? null : String(r.estimatedCost), actualCost: r.actualCost == null ? null : String(r.actualCost), ip: ipHash(r.ip) })
    }
  })
}
