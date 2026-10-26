import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db, users, usageLedger, messages } from '@miro/db'
import { AIOrchestrator, ModelRegistry, type AIContext, type GenerationRequest } from '@miro/providers'
import { createRoleplaySession } from '@/lib/simulation/start'
import { runConversationTurn } from '@/lib/simulation/turn'
import { grantRecharge, rechargeBalance } from '../guard'
const fake = vi.hoisted(() => ({ calls: 0, fail: false }))
const definition = { id: 'priced', provider: 'openai', providerModelId: 'test-priced', tier: 'standard', capabilities: ['dialogue', 'memory_extraction', 'memory_summary', 'semantic_event'], inputCost: 0.1, outputCost: 0.2, maxContextTokens: 100000, maxOutputTokens: 4096 }
vi.mock('@/lib/simulation/mock-llm', () => {
  const llm = (name: string, context: AIContext) => {
    const model = new ModelRegistry([definition]).models[0]!
    return new AIOrchestrator({ context, explicitModel: model, maxRetries: 0, chain: [{ info: { mode: 'live', name: 'local-fixture', notice: null }, healthCheck: async () => true,
      generate: async (req: GenerationRequest) => {
        fake.calls++
        if (fake.fail) throw new Error('provider_http_400')
        const value = req.task === 'agency_verify' ? { complete: true, blocks: JSON.parse(req.prompt).blocks.map((block: { index: number }) => ({ blockIndex: block.index, noUserClaims: true, boundaryViolation: false, claims: [] })) } : req.task.startsWith('memory_') ? { memories: [] } : req.task === 'semantic_event' ? { events: [] }
          : { rp: { blocks: [{ type: 'dialogue', speaker: name, text: '안녕. 오늘 하루는 어땠어?' }] } }
        return { text: JSON.stringify(value), provider: 'openai', model: 'test-priced', inputTokens: 100, outputTokens: 100, latencyMs: 1 }
      } }] })
  }
  return { resolveRpLLM: llm, auxiliaryLLM: llm }
})
const ids: string[] = []
const describeDb = process.env.DATABASE_URL ? describe : describe.skip
async function fixture(balance: number) {
  const [u] = await db.insert(users).values({ email: `token-turn-${randomUUID()}@miro.test`, displayName: '테스트' }).returning()
  ids.push(u!.id)
  if (balance) await grantRecharge({ userId: u!.id, amount: balance, source: 'grant' })
  const { sessionId } = await createRoleplaySession(u!.id, 'thomas')
  return { userId: u!.id, sessionId, input: '안녕', requestId: randomUUID() }
}
beforeEach(() => { fake.calls = 0; fake.fail = false; vi.stubEnv('MIRO_MODEL_REGISTRY', JSON.stringify([definition])); vi.stubEnv('MIRO_CHAT_MODEL_ID', '') })
afterEach(() => vi.unstubAllEnvs())
afterAll(async () => { for (const id of ids) await db.delete(users).where(eq(users.id, id)) })
describeDb('priced dialogue delivery', () => {
  it('charges even the former free choice, commits its exact fee with the answer, and replays without another charge', async () => {
    const opts = await fixture(300)
    const r = await runConversationTurn({ ...opts, chatModel: 'miro' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.tokensCharged).toBeGreaterThan(0)
    expect(await rechargeBalance(opts.userId)).toBe(300 - r.tokensCharged!)
    const calls = fake.calls
    const retry = await runConversationTurn({ ...opts, chatModel: 'miro' })
    expect(retry.ok).toBe(true)
    expect(fake.calls).toBe(calls)
    expect(await rechargeBalance(opts.userId)).toBe(300 - r.tokensCharged!)
    const ledgers = await db.select().from(usageLedger).where(eq(usageLedger.userId, opts.userId))
    expect(ledgers).toHaveLength(1)
    expect(ledgers[0]!.status).toBe('committed')
    expect(ledgers[0]!.amount).toBe(r.tokensCharged)
  })
  it('allows a small balance to fund actual usage and honors the lower displayed ceiling', async () => {
    const opts = await fixture(20)
    const r = await runConversationTurn({ ...opts, tokenCeiling: 10 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.tokensCharged).toBeLessThanOrEqual(10)
    expect(await rechargeBalance(opts.userId)).toBeGreaterThan(0)
  })
  it('rejects an invalid client ceiling without invoking any model', async () => {
    const opts = await fixture(300)
    const r = await runConversationTurn({ ...opts, tokenCeiling: -1 })
    expect(r.ok).toBe(false)
    expect(fake.calls).toBe(0)
    expect(await rechargeBalance(opts.userId)).toBe(300)
  })
  it('rejects an empty wallet before calling any model', async () => {
    const r = await runConversationTurn(await fixture(0))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('usage')
    expect(fake.calls).toBe(0)
  })
  it('refunds the full reservation and stores no generated answer on failure', async () => {
    const opts = await fixture(300)
    const before = await db.select().from(messages).where(eq(messages.sessionId, opts.sessionId))
    fake.fail = true
    const r = await runConversationTurn(opts)
    expect(r.ok).toBe(false)
    expect(await rechargeBalance(opts.userId)).toBe(300)
    expect(await db.select().from(messages).where(eq(messages.sessionId, opts.sessionId))).toHaveLength(before.length)
  })
})
