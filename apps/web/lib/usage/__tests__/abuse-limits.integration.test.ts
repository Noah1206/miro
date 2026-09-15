import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq, like } from 'drizzle-orm'
import { db, users, aiBudgetCounters } from '@miro/db'
import { registryFromEnv } from '@miro/providers'
import { budgetPolicy, productionBudgetGuard, startOfDayKST, startOfMonthKST } from '../ai-usage'

const describeDb = process.env.DATABASE_URL ? describe : describe.skip
const REGISTRY = JSON.stringify([{ id: 'm', provider: 'gemini', providerModelId: 'm', tier: 'small',
  capabilities: ['dialogue'], inputCost: 0.3, outputCost: 2.5, maxContextTokens: 32768, maxOutputTokens: 1024, enabled: true }])

/** 무료 대화가 무제한이 된 뒤의 남용 방지 한도. */
describeDb('abuse limits on free chat', () => {
  const made: string[] = []
  const day = startOfDayKST().toISOString(), month = startOfMonthKST().toISOString()
  afterEach(() => vi.unstubAllEnvs())
  afterAll(async () => {
    for (const id of made) await db.delete(users).where(eq(users.id, id))
    for (const w of [day, month]) await db.delete(aiBudgetCounters).where(like(aiBudgetCounters.key, `${w}:%`))
  })
  async function user() {
    const [u] = await db.insert(users).values({ email: `ab-${randomUUID()}@t.dev` }).returning()
    made.push(u!.id); return u!.id
  }
  function authorize(userId: string) {
    vi.stubEnv('MIRO_MODEL_REGISTRY', REGISTRY)
    const { registry } = registryFromEnv(() => '')
    const model = registry.models.find(m => m.capabilities.includes('dialogue'))!
    const req = { task: 'dialogue' as const, system: 'x'.repeat(1000), prompt: 'y'.repeat(1000), maxTokens: 256, promptVersion: 'v1' }
    return productionBudgetGuard.authorize(req, model, { userId, sessionId: null, traceId: randomUUID(), requestId: randomUUID(), ip: null, usageUnits: 0 }, randomUUID())
  }

  it('a monthly per-user ceiling exists and is not merely the daily one', () => {
    vi.stubEnv('AI_USER_MONTHLY_BUDGET', ''); vi.stubEnv('AI_USER_MONTHLY_LIMIT', '')
    const p = budgetPolicy()
    expect(p.user_monthly!.cost).toBeGreaterThan(0)
    // 일 단위 한도는 매일 리셋되므로 월 원가를 혼자서는 못 막는다.
    expect(p.user!.requests).toBeDefined()
    expect(startOfMonthKST().getTime()).toBeLessThanOrEqual(startOfDayKST().getTime())
  })

  it('stops one account once it has burned the monthly cost ceiling', async () => {
    vi.stubEnv('AI_DAILY_BUDGET', '1000'); vi.stubEnv('AI_USER_MONTHLY_BUDGET', '0.01')
    const id = await user()
    expect((await authorize(id)).allowed).toBe(true)
    // 월 상한까지 태운다 — 하루 예산은 아직 넉넉하다.
    await db.update(aiBudgetCounters).set({ cost: '0.0099' }).where(eq(aiBudgetCounters.key, `${month}:user_monthly:${id}`))
    const blocked = await authorize(id)
    expect(blocked.allowed).toBe(false)
    expect((blocked as { reason: string }).reason).toBe('user_monthly')
  })

  it('does not punish another account for one abuser', async () => {
    vi.stubEnv('AI_DAILY_BUDGET', '1000'); vi.stubEnv('AI_USER_MONTHLY_BUDGET', '0.01')
    const abuser = await user(), bystander = await user()
    await authorize(abuser)
    await db.update(aiBudgetCounters).set({ cost: '0.0099' }).where(eq(aiBudgetCounters.key, `${month}:user_monthly:${abuser}`))
    expect((await authorize(abuser)).allowed).toBe(false)
    expect((await authorize(bystander)).allowed).toBe(true)
  })

  it('keeps the monthly counter alive past the daily sweep', async () => {
    vi.stubEnv('AI_DAILY_BUDGET', '1000'); vi.stubEnv('AI_USER_MONTHLY_BUDGET', '1')
    const id = await user()
    await authorize(id)
    const [monthly] = await db.select().from(aiBudgetCounters).where(eq(aiBudgetCounters.key, `${month}:user_monthly:${id}`))
    const [daily] = await db.select().from(aiBudgetCounters).where(eq(aiBudgetCounters.key, `${day}:user:${id}`))
    // 월간 카운터가 이틀 뒤 청소에 쓸려가면 한도가 매달이 아니라 이틀마다 풀린다.
    expect(monthly!.expiresAt.getTime()).toBeGreaterThan(daily!.expiresAt.getTime())
    expect(monthly!.expiresAt.getTime() - Date.now()).toBeGreaterThan(31 * 86_400_000)
  })

  it('a default ceiling still allows a heavy but honest user', async () => {
    vi.stubEnv('AI_USER_MONTHLY_BUDGET', '')
    const ceiling = budgetPolicy().user_monthly!.cost!
    // 6단계 실측: MIRO 턴당 $0.00216. 보고서가 헤비 유저로 든 월 1000턴은 통과해야 한다.
    expect(ceiling).toBeGreaterThan(1000 * 0.00216)
  })
})
